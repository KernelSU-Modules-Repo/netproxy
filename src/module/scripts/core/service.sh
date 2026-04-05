#!/system/bin/sh
# NetProxy 服务管理脚本
# 用法: service.sh {start|stop|restart|status}

set -u

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"
readonly XRAY_BIN="$MODDIR/bin/xray"
readonly MODULE_CONF="$MODDIR/config/module.conf"
readonly XRAY_LOG_FILE="$MODDIR/logs/xray.log"
readonly CONFDIR="$MODDIR/config/xray/confdir"
readonly OUTBOUNDS_DIR="$MODDIR/config/xray/outbounds"

readonly KILL_TIMEOUT=5

# 检测 busybox 路径
detect_busybox() {
  for path in "/data/adb/ksu/bin/busybox" "/data/adb/ap/bin/busybox" "/data/adb/magisk/busybox"; do
    if [ -f "$path" ]; then
      echo "$path"
      return 0
    fi
  done
  echo "busybox"
}

readonly BUSYBOX="$(detect_busybox)"

# 导入工具库
. "$MODDIR/scripts/utils/log.sh"

export PATH="$MODDIR/bin:$PATH"


#######################################
# 获取 Xray PID
#######################################
get_pid() {
  pidof -s "$XRAY_BIN" 2> /dev/null || true
}

#######################################
# 启动服务
#######################################
do_start() {
  log "INFO" "========== 开始启动 Xray 服务 =========="

  local running_pid=$(get_pid)
  if [ -n "$running_pid" ]; then
    log "WARN" "Xray 已在运行中 (PID: $running_pid)"
    return 0
  fi

  [ -f "$MODULE_CONF" ] || die "模块配置文件不存在: $MODULE_CONF"
  . "$MODULE_CONF"

  local outbound_config="${CURRENT_CONFIG:-}"
  outbound_config="${outbound_config//\"/}"
  [ -n "$outbound_config" ] || die "无法解析出站配置路径"

  local outbound_mode="${OUTBOUND_MODE:-rule}"
  log "INFO" "当前出站模式: $outbound_mode"

  # 确定路由配置
  local routing_config="$CONFDIR/routing/rule.json"
  if [ "$outbound_mode" = "global" ]; then
    routing_config="$CONFDIR/routing/global.json"
    log "INFO" "全局模式: 使用 global.json"
  elif [ "$outbound_mode" = "direct" ]; then
    routing_config="$CONFDIR/routing/direct.json"
    log "INFO" "直连模式: 使用 direct.json"
  fi

  [ -f "$routing_config" ] || die "路由配置文件不存在: $routing_config"
  [ -f "$outbound_config" ] || die "出站配置文件不存在: $outbound_config"
  [ -d "$CONFDIR" ] || die "confdir 目录不存在: $CONFDIR"

  log "INFO" "配置目录: $CONFDIR"
  log "INFO" "路由配置: $routing_config"
  log "INFO" "出站配置: $outbound_config"

  # 启动 Xray (root:net_admin)
  nohup "$BUSYBOX" setuidgid root:net_admin "$XRAY_BIN" run \
    -confdir "$CONFDIR" \
    -config "$routing_config" \
    -config "$outbound_config" \
    > "$XRAY_LOG_FILE" 2>&1 &

  local xray_pid=$!
  log "INFO" "Xray 进程已启动, PID: $xray_pid"

  # 等待进程稳定
  sleep 1

  if ! kill -0 "$xray_pid" 2> /dev/null; then
    die "Xray 进程启动失败，请检查配置"
  fi

  # 启用 TProxy 规则
  "$MODDIR/scripts/network/tproxy.sh" start -d "$MODDIR/config/tproxy" >> "$LOG_FILE" 2>&1

  log "INFO" "========== Xray 服务启动完成 =========="
}

#######################################
# 停止服务
#######################################
do_stop() {
  log "INFO" "========== 开始停止 Xray 服务 =========="

  # 先清理 TProxy 规则（避免断网）
  log "INFO" "清理 TProxy 规则..."
  "$MODDIR/scripts/network/tproxy.sh" stop -d "$MODDIR/config/tproxy" >> "$LOG_FILE" 2>&1

  # 终止 Xray 进程
  local pid
  pid=$(get_pid)

  if [ -z "$pid" ]; then
    log "INFO" "未发现运行中的 Xray 进程"
  else
    log "INFO" "正在终止 Xray 进程 (PID: $pid)..."

    # 优雅终止
    if kill "$pid" 2> /dev/null; then
      local count=0
      while kill -0 "$pid" 2> /dev/null && [ "$count" -lt "$KILL_TIMEOUT" ]; do
        sleep 1
        count=$((count + 1))
      done

      # 强制终止
      if kill -0 "$pid" 2> /dev/null; then
        log "WARN" "进程未响应 SIGTERM，发送 SIGKILL"
        kill -9 "$pid" 2> /dev/null || true
      fi
    fi

    log "INFO" "Xray 进程已终止"
  fi

  log "INFO" "========== Xray 服务停止完成 =========="
}

#######################################
# 重启服务
#######################################
do_restart() {
  log "INFO" "========== 重启 Xray 服务 =========="
  do_stop
  sleep 1
  do_start
}

#######################################
# 查看状态
#######################################
do_status() {
  local pid
  pid=$(get_pid)

  if [ -n "$pid" ]; then
    echo "Xray 运行中 (PID: $pid)"
    # 显示运行时间
    if [ -f "/proc/$pid/stat" ]; then
      local uptime_ticks start_time now_ticks
      start_time=$(awk '{print $22}' "/proc/$pid/stat" 2> /dev/null || echo 0)
      now_ticks=$(awk '{print int($1 * 100)}' /proc/uptime 2> /dev/null || echo 0)
      if [ "$start_time" -gt 0 ] && [ "$now_ticks" -gt 0 ]; then
        uptime_ticks=$((now_ticks - start_time))
        echo "运行时间: $((uptime_ticks / 100)) 秒"
      fi
    fi
    return 0
  else
    echo "Xray 未运行"
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
  start     启动 Xray 服务
  stop      停止 Xray 服务
  restart   重启 Xray 服务
  status    查看服务状态

示例:
  $(basename "$0") start
  $(basename "$0") restart
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
