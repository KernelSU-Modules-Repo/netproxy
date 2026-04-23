#!/system/bin/sh
# NetProxy sing-box 服务管理脚本
# 用法: service.sh {start|stop|restart|status}

set -u

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"
readonly SING_BOX_BIN="$MODDIR/bin/sing-box"
readonly MODULE_CONF="$MODDIR/config/module.conf"
readonly TPROXY_CONF_DIR="$MODDIR/config/tproxy"
readonly SINGBOX_LOG_FILE="$MODDIR/logs/sing-box.log"
readonly SINGBOX_DIR="$MODDIR/config/singbox"
readonly CONFDIR="$SINGBOX_DIR/confdir"
readonly RUNTIME_DIR="$SINGBOX_DIR/runtime"
readonly SWITCH_SCRIPT="$MODDIR/scripts/core/switch.sh"
readonly TPROXY_SCRIPT="$MODDIR/scripts/network/tproxy.sh"
readonly KILL_TIMEOUT=5

. "$MODDIR/scripts/utils/common.sh"
. "$MODDIR/scripts/utils/config.sh"
. "$MODDIR/scripts/utils/api.sh"
. "$MODDIR/scripts/utils/nodes.sh"
. "$MODDIR/scripts/core/runtime.sh"

export PATH="$MODDIR/bin:$PATH"

readonly BUSYBOX="$(detect_busybox)"

#######################################
# 检查服务运行环境
#######################################
verify_environment() {
  require_file "$SING_BOX_BIN" "sing-box 二进制不存在: $SING_BOX_BIN"
  require_file "$MODULE_CONF" "模块配置文件不存在: $MODULE_CONF"
  require_file "$TPROXY_CONF_DIR/tproxy.conf" "透明代理配置文件不存在: $TPROXY_CONF_DIR/tproxy.conf"
  require_dir "$SINGBOX_DIR" "sing-box 配置目录不存在: $SINGBOX_DIR"
  require_dir "$CONFDIR" "通用配置目录不存在: $CONFDIR"

  ensure_dir "$MODDIR/logs" "无法创建日志目录: $MODDIR/logs"
  ensure_dir "$RUNTIME_DIR" "无法创建运行时目录: $RUNTIME_DIR"
}

#######################################
# 清理运行时文件
#######################################
cleanup_runtime_files() {
  rm -f "$RUNTIME_DIR/outbounds.json" 2> /dev/null || true
}

#######################################
# 启动服务
#######################################
do_start() {
  local pid runtime_outbounds new_pid
  local node_path

  log "INFO" "========== 开始启动 sing-box 服务 =========="
  verify_environment

  pid="$(get_pid "$SING_BOX_BIN")"
  if [ -n "$pid" ]; then
    log "WARN" "sing-box 已在运行中 (PID: $pid)"
    return 0
  fi

  initialize_runtime_context
  scan_runtime_nodes "$CUR_OUTBOUND_DIR"
  write_runtime_outbounds > /dev/null
  runtime_outbounds="$RUNTIME_OUTBOUNDS_FILE"

  [ "$RUNTIME_NODE_COUNT" -gt 0 ] || die "当前节点目录没有可加载的节点配置: $CUR_OUTBOUND_DIR"

  log "INFO" "当前节点目录: $CUR_OUTBOUND_DIR"
  log "INFO" "路由模式: $CUR_OUTBOUND_MODE"
  log "INFO" "选择模式: $CUR_SELECTOR_MODE"
  log "INFO" "已加载节点: $RUNTIME_NODE_COUNT，跳过无效节点: $RUNTIME_SKIPPED_COUNT"

  # 构造最终启动参数
  set -- run -C "$CONFDIR"
  while IFS= read -r node_path; do
    [ -n "$node_path" ] || continue
    set -- "$@" -c "$node_path"
  done << EOF
$RUNTIME_NODE_PATHS
EOF
  set -- "$@" -c "$runtime_outbounds"

  log "INFO" "正在启动 sing-box 进程..."
  cd "$SINGBOX_DIR" || die "无法进入配置目录: $SINGBOX_DIR"
  nohup "$BUSYBOX" setuidgid root:net_admin "$SING_BOX_BIN" "$@" > "$SINGBOX_LOG_FILE" 2>&1 &

  new_pid=$!
  sleep 1

  if kill -0 "$new_pid" 2> /dev/null; then
    log "INFO" "sing-box 启动成功 (PID: $new_pid)"
  else
    die "sing-box 启动失败，请检查日志: $SINGBOX_LOG_FILE"
  fi

  if api_wait_available 5 1; then
    LOG_STDERR=0 SWITCH_ALLOW_RESTART=0 sh "$SWITCH_SCRIPT" mode "$CUR_OUTBOUND_MODE" || log "WARN" "运行模式同步失败"
  else
    log "WARN" "控制接口未就绪，本次未同步运行模式"
  fi

  log "INFO" "正在加载透明代理规则..."
  sh "$TPROXY_SCRIPT" start -d "$TPROXY_CONF_DIR" >> "$LOG_FILE" 2>&1 || die "透明代理规则加载失败"

  log "INFO" "========== sing-box 服务启动完成 =========="
}

#######################################
# 停止服务
#######################################
do_stop() {
  local pid count

  log "INFO" "========== 开始停止 sing-box 服务 =========="
  verify_environment

  log "INFO" "正在清理透明代理规则..."
  sh "$TPROXY_SCRIPT" stop -d "$TPROXY_CONF_DIR" >> "$LOG_FILE" 2>&1 || true

  pid="$(get_pid "$SING_BOX_BIN")"
  if [ -z "$pid" ]; then
    log "INFO" "未发现运行中的 sing-box 进程"
    cleanup_runtime_files
    log "INFO" "========== sing-box 服务停止完成 =========="
    return 0
  fi

  log "INFO" "正在停止 sing-box 进程 (PID: $pid)..."

  if kill "$pid" 2> /dev/null; then
    count=0
    while kill -0 "$pid" 2> /dev/null && [ "$count" -lt "$KILL_TIMEOUT" ]; do
      sleep 1
      count=$((count + 1))
    done

    if kill -0 "$pid" 2> /dev/null; then
      log "WARN" "进程未响应 SIGTERM，改用 SIGKILL"
      kill -9 "$pid" 2> /dev/null || true
    fi
  fi

  cleanup_runtime_files
  log "INFO" "sing-box 进程已停止"
  log "INFO" "========== sing-box 服务停止完成 =========="
}

#######################################
# 重启服务
#######################################
do_restart() {
  log "INFO" "========== 开始重启 sing-box 服务 =========="
  do_stop
  sleep 1
  do_start
}

#######################################
# 查看状态
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
# 显示帮助
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
# 主入口
#######################################
main() {
  case "${1:-}" in
    start)
      do_start
      ;;
    stop)
      do_stop
      ;;
    restart)
      do_restart
      ;;
    status)
      do_status
      ;;
    -h | --help | help)
      show_usage
      ;;
    *)
      show_usage
      exit 1
      ;;
  esac
}

main "$@"
