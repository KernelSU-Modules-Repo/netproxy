#!/system/bin/sh
set -e

readonly MODDIR="${0%/*}"
readonly START_SCRIPT="$MODDIR/scripts/core/start.sh"
readonly STOP_SCRIPT="$MODDIR/scripts/core/stop.sh"
readonly LOG_FILE="$MODDIR/logs/service.log"
readonly XRAY_BIN="$MODDIR/bin/xray"

#######################################
# 记录日志
# Arguments:
#   $1 - 日志级别
#   $2 - 日志消息
#######################################
log() {
    local level="${1:-INFO}"
    local message="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" >> "$LOG_FILE"
}

#######################################
# 检查 Xray 是否运行
# Returns:
#   0 运行中, 1 未运行
#######################################
is_xray_running() {
    pgrep -f "^$XRAY_BIN" >/dev/null 2>&1
}

# 主流程
if is_xray_running; then
    log "INFO" "检测到 Xray 正在运行，执行停止操作"
    sh "$STOP_SCRIPT"
else
    log "INFO" "检测到 Xray 未运行，执行启动操作"
    sh "$START_SCRIPT"
fi