#!/system/bin/sh
#######################################
# 文件: service.sh
# 功能: NetProxy sing-box 服务管理脚本，负责启动/停止/重启 sing-box
#       进程，同步运行模式与节点配置，并加载/清理透明代理规则。
# 用法: service.sh {start|stop|restart|status} [core]
#       (附加 core 表示仅操作核心进程，跳过透明代理规则)
# 依赖: common.sh、config.sh、api.sh、nodes.sh、runtime.sh。
#######################################

set -u  # 引用未定义变量报错

# 模块根目录与关键路径
readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"          # 服务日志
readonly SING_BOX_BIN="$MODDIR/bin/sing-box"          # sing-box 二进制
readonly MODULE_CONF="$MODDIR/config/module.conf"     # 模块配置
readonly TPROXY_CONF_DIR="$MODDIR/config/tproxy"      # 透明代理配置目录
readonly SINGBOX_LOG_FILE="$MODDIR/logs/sing-box.log" # sing-box 运行日志
readonly SINGBOX_DIR="$MODDIR/config/singbox"         # sing-box 配置根目录
readonly CONFDIR="$SINGBOX_DIR/confdir"               # 通用配置目录
readonly RUNTIME_DIR="$SINGBOX_DIR/runtime"           # 运行时生成目录
readonly SWITCH_SCRIPT="$MODDIR/scripts/core/switch.sh"     # 模式/节点切换脚本
readonly TPROXY_SCRIPT="$MODDIR/scripts/network/tproxy.sh"  # 透明代理脚本
readonly NETMON_SCRIPT="$MODDIR/scripts/network/netmon.sh"  # WiFi 自动切换监听脚本
readonly SUBSCHED_SCRIPT="$MODDIR/scripts/core/subsched.sh" # 订阅定时更新调度脚本
readonly KILL_TIMEOUT=5                               # 等待进程退出的秒数上限
readonly LOG_TAG="service"                            # 日志组件标签

. "$MODDIR/scripts/utils/common.sh"
. "$MODDIR/scripts/utils/config.sh"
. "$MODDIR/scripts/utils/api.sh"
. "$MODDIR/scripts/utils/nodes.sh"
. "$MODDIR/scripts/core/runtime.sh"

# 将模块 bin 目录加入 PATH，便于调用自带二进制
export PATH="$MODDIR/bin:$PATH"

readonly BUSYBOX="$(detect_busybox)"  # busybox 路径 (用于 setuidgid)

#######################################
# 校验服务运行所需的命令、文件与目录
# 参数: 无
# 返回: 全部就绪返回 0，否则退出
#######################################
verify_environment() {
  # 关键外部命令检查
  require_cmds awk sed nohup

  # 关键文件与目录检查
  require_file "$SING_BOX_BIN" "sing-box 二进制不存在: $SING_BOX_BIN"
  require_file "$MODULE_CONF" "模块配置文件不存在: $MODULE_CONF"
  require_file "$TPROXY_CONF_DIR/tproxy.conf" "透明代理配置文件不存在: $TPROXY_CONF_DIR/tproxy.conf"
  require_dir "$SINGBOX_DIR" "sing-box 配置目录不存在: $SINGBOX_DIR"
  require_dir "$CONFDIR" "通用配置目录不存在: $CONFDIR"

  # 确保日志与运行时目录存在
  ensure_dir "$MODDIR/logs" "无法创建日志目录: $MODDIR/logs"
  ensure_dir "$RUNTIME_DIR" "无法创建运行时目录: $RUNTIME_DIR"
}

#######################################
# 清理运行时生成的临时文件
# 参数: 无
# 返回: 无
#######################################
cleanup_runtime_files() {
  rm -f "$RUNTIME_DIR/outbounds.json" 2> /dev/null || true
}

#######################################
# 打印服务动作横幅 (按是否跳过 tproxy 区分级别与措辞)
# 参数:
#   $1  动作动词 (启动/停止/重启)
#   $2  是否仅核心 (1=跳过 tproxy，记 DEBUG；否则记 INFO)
# 返回: 无
#######################################
log_service_action() {
  if [ "$2" = "1" ]; then
    log "DEBUG" "$1 sing-box 核心服务 (跳过 tproxy)"
  else
    log "INFO" "$1 sing-box 服务"
  fi
}

#######################################
# 判断节点选择模式是否为手动选择
# 参数:
#   $1  选择模式 (CUR_SELECTOR_MODE)
# 返回: 0=手动选择，非 0=其他
#######################################
is_manual_selector() {
  case "$1" in
    manual | selector | 手动选择 | 手动) return 0 ;;
    *) return 1 ;;
  esac
}

#######################################
# 启动 sing-box 服务
# 参数:
#   $1  是否跳过透明代理 (1=跳过，仅启动核心，默认 0)
# 返回: 成功返回 0，启动失败则退出
#######################################
do_start() {
  local skip_tproxy="${1:-0}"
  local pid runtime_outbounds new_pid
  local node_path

  log_service_action "启动" "$skip_tproxy"
  verify_environment

  # 已在运行则直接返回，保证幂等
  pid="$(get_pid "$SING_BOX_BIN")"
  if [ -n "$pid" ]; then
    log "WARN" "sing-box 已在运行中 (PID: $pid)"
    return 0
  fi

  # 初始化上下文并扫描节点、生成运行时出站配置
  initialize_runtime_context
  scan_runtime_nodes "$CUR_OUTBOUND_DIR"
  write_runtime_outbounds > /dev/null
  runtime_outbounds="$RUNTIME_OUTBOUNDS_FILE"

  [ "$RUNTIME_NODE_COUNT" -gt 0 ] || die "当前节点目录没有可加载的节点配置: $CUR_OUTBOUND_DIR"

  # 节点与模式概要 (单行)
  log "INFO" "节点目录=$CUR_OUTBOUND_DIR 模式=$CUR_OUTBOUND_MODE 选择=$CUR_SELECTOR_MODE 已加载=$RUNTIME_NODE_COUNT 跳过=$RUNTIME_SKIPPED_COUNT"

  # 构造启动参数：先基础参数，再逐个追加节点配置，最后追加运行时出站
  set -- run -C "$CONFDIR"
  while IFS= read -r node_path; do
    [ -n "$node_path" ] || continue
    set -- "$@" -c "$node_path"
  done << EOF
$RUNTIME_NODE_PATHS
EOF
  set -- "$@" -c "$runtime_outbounds"

  # 以 root:net_admin 身份后台启动进程
  log "DEBUG" "正在启动 sing-box 进程..."
  cd "$SINGBOX_DIR" || die "无法进入配置目录: $SINGBOX_DIR"
  nohup "$BUSYBOX" setuidgid root:net_admin "$SING_BOX_BIN" "$@" > "$SINGBOX_LOG_FILE" 2>&1 &

  # 短暂等待后确认进程存活
  new_pid=$!
  sleep 1

  if kill -0 "$new_pid" 2> /dev/null; then
    log "INFO" "sing-box 启动成功 (PID: $new_pid)"
  else
    die "sing-box 启动失败，请检查日志: $SINGBOX_LOG_FILE"
  fi

  # 等待控制接口就绪后同步运行模式与节点 (尽力而为：失败仅告警，不中止启动)
  if api_wait_available 30 1; then
    LOG_STDERR=0 LOG_LEVEL=WARN SWITCH_ALLOW_RESTART=0 sh "$SWITCH_SCRIPT" mode "$CUR_OUTBOUND_MODE" \
      || log "WARN" "运行模式同步失败，将沿用配置默认模式"
    # 手动选择模式下额外同步当前节点
    if is_manual_selector "$CUR_SELECTOR_MODE"; then
      LOG_STDERR=0 LOG_LEVEL=WARN SWITCH_ALLOW_RESTART=0 sh "$SWITCH_SCRIPT" config "$CUR_OUTBOUND_CONFIG" \
        || log "WARN" "节点配置同步失败，将沿用配置默认节点"
    fi
  else
    log "WARN" "控制接口在超时时间内未就绪，跳过模式/节点同步"
  fi

  # 非跳过模式下加载透明代理规则
  if [ "$skip_tproxy" != "1" ]; then
    log "DEBUG" "正在加载透明代理规则..."
    "$TPROXY_SCRIPT" start -d "$TPROXY_CONF_DIR" >> "$LOG_FILE" 2>&1 || die "透明代理规则加载失败"
    # WiFi 自动切换：按配置启停监听守护并做初始决策 (失败不影响主流程)
    sh "$NETMON_SCRIPT" sync > /dev/null 2>&1 || log "WARN" "WiFi 自动切换初始化失败"
    # 订阅定时更新：按配置启停 crond 守护
    sh "$SUBSCHED_SCRIPT" sync > /dev/null 2>&1 || log "WARN" "订阅定时更新初始化失败"
  fi

  log "INFO" "sing-box 服务启动完成"
}

#######################################
# 停止 sing-box 服务
# 参数:
#   $1  是否跳过透明代理清理 (1=跳过，默认 0)
# 返回: 无
#######################################
do_stop() {
  local skip_tproxy="${1:-0}"
  local pid count

  log_service_action "停止" "$skip_tproxy"
  verify_environment

  # 先清理透明代理规则 (非跳过模式)
  if [ "$skip_tproxy" != "1" ]; then
    # 先停掉 WiFi 自动切换监听守护，避免其在清理期间误触发切换
    sh "$NETMON_SCRIPT" stop > /dev/null 2>&1 || true
    # 停掉订阅定时更新 crond 守护
    sh "$SUBSCHED_SCRIPT" stop > /dev/null 2>&1 || true
    log "DEBUG" "正在清理透明代理规则..."
    "$TPROXY_SCRIPT" stop -d "$TPROXY_CONF_DIR" >> "$LOG_FILE" 2>&1 || true
  fi

  # 进程不存在则清理运行时文件后返回，保证幂等
  pid="$(get_pid "$SING_BOX_BIN")"
  if [ -z "$pid" ]; then
    log "DEBUG" "未发现运行中的 sing-box 进程"
    cleanup_runtime_files
    return 0
  fi

  log "DEBUG" "正在停止 sing-box 进程 (PID: $pid)..."

  # 先发送 SIGTERM，超时未退出再强制 SIGKILL
  if kill "$pid" 2> /dev/null; then
    count=0
    while kill -0 "$pid" 2> /dev/null && [ "$count" -lt "$KILL_TIMEOUT" ]; do
      sleep 1
      count=$((count + 1))
    done

    if kill -0 "$pid" 2> /dev/null; then
      log "WARN" "进程未响应 SIGTERM，改用 SIGKILL"
      kill -9 "$pid" 2> /dev/null || true
      # 给 SIGKILL 留出回收时间
      sleep 1
    fi
  fi

  # 最终确认进程是否已退出，未退出则视为停止失败
  if kill -0 "$pid" 2> /dev/null; then
    log "ERROR" "sing-box 进程仍在运行 (PID: $pid)，停止失败"
    return 1
  fi

  cleanup_runtime_files
  log "INFO" "sing-box 服务已停止"
}

#######################################
# 重启 sing-box 服务
# 参数:
#   $1  是否跳过透明代理 (1=仅核心，默认 0)
# 返回: 无
#######################################
do_restart() {
  local skip_tproxy="${1:-0}"

  log_service_action "重启" "$skip_tproxy"

  do_stop "$skip_tproxy"
  sleep 1
  do_start "$skip_tproxy"
}

#######################################
# 查看服务运行状态
# 参数: 无
# 返回: 运行中返回 0，未运行返回 1
#######################################
do_status() {
  local pid uptime

  pid="$(get_pid "$SING_BOX_BIN")"
  if [ -n "$pid" ]; then
    printf "sing-box 运行中 (PID: %s)\n" "$pid"
    uptime="$(get_process_uptime "$pid")"
    if [ "$uptime" -gt 0 ]; then
      printf "运行时间: %s 秒\n" "$uptime"
    fi
    return 0
  fi

  printf "sing-box 未运行\n"
  return 1
}

#######################################
# 显示帮助信息
# 参数: 无
# 返回: 无
#######################################
show_usage() {
  cat << EOF
用法: $(basename "$0") {start|stop|restart|status}

命令:
  start     启动 sing-box 服务
  stop      停止 sing-box 服务
  restart   重启 sing-box 服务
  status    查看服务状态
EOF
}

#######################################
# 主入口：解析命令并分发
# 参数:
#   $1  命令 (start/stop/restart/status)
#   $2  可选目标 (core=仅操作核心，跳过透明代理)
# 返回: 依命令而定
#######################################
main() {
  local cmd="${1:-}"
  # 第二参数为 core 时仅操作核心进程
  local skip=0
  [ "${2:-}" = "core" ] && skip=1

  case "$cmd" in
    start) do_start "$skip" ;;
    stop) do_stop "$skip" ;;
    restart) do_restart "$skip" ;;
    status) do_status ;;
    -h | --help | help) show_usage ;;
    *)
      show_usage
      exit 1
      ;;
  esac
}

main "$@"
