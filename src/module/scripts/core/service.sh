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

readonly KILL_TIMEOUT=5

. "$MODDIR/scripts/utils/common.sh"
. "$MODDIR/scripts/core/runtime.sh"

export PATH="$MODDIR/bin:$PATH"


readonly BUSYBOX="$(detect_busybox)"

#######################################
# 环境与配置校验
#######################################
verify_environment() {
  [ -x "$SING_BOX_BIN" ] || die "sing-box 二进制不存在或不可执行: $SING_BOX_BIN"
  [ -f "$MODULE_CONF" ] || die "模块配置文件不存在: $MODULE_CONF"
  [ -f "$TPROXY_CONF_DIR/tproxy.conf" ] || die "透明代理配置文件不存在: $TPROXY_CONF_DIR/tproxy.conf"
  
  . "$MODULE_CONF"
  . "$TPROXY_CONF_DIR/tproxy.conf"

  local outbound_config
  outbound_config="$(strip_quotes "${CURRENT_CONFIG:-}")"
  [ -n "$outbound_config" ] || die "CURRENT_CONFIG 未定义，请先选择节点"
  [ -f "$outbound_config" ] || die "指定的节点配置文件不存在: $outbound_config"
  
  echo "$outbound_config"
}

#######################################
# 启动服务
#######################################
do_start() {
  log "INFO" "========== 开始启动 sing-box 服务 =========="

  # 检查当前服务状态
  local pid
  pid="$(get_pid "$SING_BOX_BIN")"
  if [ -n "$pid" ]; then
    log "WARN" "sing-box 已在运行中 (PID: $pid)"
    return 0
  fi

  # 准备节点与运行时出站配置
  local outbound_config outbound_dir outbound_mode selector_mode runtime_outbounds
  outbound_config="$(verify_environment)" || exit 1
  . "$MODULE_CONF"
  outbound_mode="${OUTBOUND_MODE:-rule}"
  selector_mode="${SELECTOR_MODE:-urltest}"
  outbound_dir="$(get_current_outbounds_dir "$outbound_config")" || exit 1
  runtime_outbounds="$(write_runtime_outbounds "$outbound_config" "$selector_mode")" || exit 1

  log "INFO" "路由模式: $outbound_mode"

  # 构造启动参数
  local f tag node_count=0 skipped_count=0
  set -- run -C "$CONFDIR"

  for f in "$outbound_dir"/*.json; do
    is_node_config_file "$f" || continue
    tag="$(detect_outbound_tag "$f")"
    if [ -z "$tag" ]; then
      skipped_count=$((skipped_count + 1))
      continue
    fi

    set -- "$@" -c "$f"
    node_count=$((node_count + 1))
  done

  [ "$node_count" -gt 0 ] || die "当前节点目录没有可加载的节点配置: $outbound_dir"
  log "INFO" "节点目录: $outbound_dir"
  log "INFO" "已加载节点: $node_count，跳过无效节点: $skipped_count"
  [ -n "$runtime_outbounds" ] && set -- "$@" -c "$runtime_outbounds"

  # 启动 sing-box 进程
  log "INFO" "正在启动 sing-box 进程..."
  cd "$SINGBOX_DIR" || die "无法进入配置目录: $SINGBOX_DIR"
  nohup "$BUSYBOX" setuidgid root:net_admin "$SING_BOX_BIN" "$@" > "$SINGBOX_LOG_FILE" 2>&1 &
  
  local new_pid=$!
  sleep 1

  # 确认进程已稳定运行
  if kill -0 "$new_pid" 2> /dev/null; then
    log "INFO" "sing-box 启动成功 (PID: $new_pid)"
  else
    die "sing-box 启动失败，请检查日志: $SINGBOX_LOG_FILE"
  fi

  # 同步运行模式并载入透明代理规则
  sh "$MODDIR/scripts/core/switch.sh" mode "$outbound_mode" >> "$LOG_FILE" 2>&1 || log "WARN" "控制接口失败"
  log "INFO" "载入透明代理规则..."
  "$MODDIR/scripts/network/tproxy.sh" start -d "$TPROXY_CONF_DIR" >> "$LOG_FILE" 2>&1

  log "INFO" "========== sing-box 服务启动完成 =========="
}

#######################################
# 停止服务
#######################################
do_stop() {
  log "INFO" "========== 开始停止 sing-box 服务 =========="

  log "INFO" "清理 TProxy 规则..."
  "$MODDIR/scripts/network/tproxy.sh" stop -d "$TPROXY_CONF_DIR" >> "$LOG_FILE" 2>&1 || true

  local pid
  pid="$(get_pid "$SING_BOX_BIN")"

  if [ -z "$pid" ]; then
    log "INFO" "未发现运行中的 sing-box 进程"
  else
    log "INFO" "正在终止 sing-box 进程 (PID: $pid)..."

    if kill "$pid" 2> /dev/null; then
      local count=0
      while kill -0 "$pid" 2> /dev/null && [ "$count" -lt "$KILL_TIMEOUT" ]; do
        sleep 1
        count=$((count + 1))
      done

      if kill -0 "$pid" 2> /dev/null; then
        log "WARN" "进程未响应 SIGTERM，发送 SIGKILL"
        kill -9 "$pid" 2> /dev/null || true
      fi
    fi

    log "INFO" "sing-box 进程已终止"
  fi

  rm -f "$RUNTIME_DIR/outbounds.json" 2> /dev/null || true

  log "INFO" "========== sing-box 服务停止完成 =========="
}

#######################################
# 重启服务
#######################################
do_restart() {
  log "INFO" "========== 重启 sing-box 服务 =========="
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
    echo "sing-box 运行中 (PID: $pid)"
    uptime="$(get_process_uptime "$pid")"
    if [ "$uptime" -gt 0 ]; then
      echo "运行时间: ${uptime} 秒"
    fi
    return 0
  else
    echo "sing-box 未运行"
    return 1
  fi
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
