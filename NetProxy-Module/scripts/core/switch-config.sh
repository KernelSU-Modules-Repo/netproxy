#!/system/bin/sh
set -e
set -u

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"
readonly STATUS_FILE="$MODDIR/config/status.conf"
readonly XRAY_BIN="$MODDIR/bin/xray"
readonly API_SERVER="127.0.0.1:8080"

#######################################
# 记录日志
#######################################
log() {
    local level="${1:-INFO}"
    local message="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" >> "$LOG_FILE"
}

#######################################
# 热切换配置
# Arguments:
#   $1 - 新配置文件路径
#######################################
hot_switch() {
    local config_file="$1"
    
    if [ ! -f "$config_file" ]; then
        log "ERROR" "配置文件不存在: $config_file"
        exit 1
    fi
    
    log "INFO" "========== 开始热切换配置 =========="
    log "INFO" "新配置: $config_file"
    
    # 1. 删除现有出站 (proxy, direct, block)
    log "INFO" "删除现有出站..."
    for tag in proxy direct block; do
        "$XRAY_BIN" api rmo --server="$API_SERVER" "$tag" 2>/dev/null || true
        log "INFO" "已删除出站: $tag"
    done
    
    # 2. 添加新出站
    log "INFO" "添加新出站..."
    if "$XRAY_BIN" api ado --server="$API_SERVER" "$config_file"; then
        log "INFO" "新出站添加成功"
    else
        log "ERROR" "新出站添加失败"
        exit 1
    fi
    
    # 3. 更新 status.conf
    local current_status
    current_status=$(grep '^status=' "$STATUS_FILE" | head -1 || echo 'status="running"')
    {
        echo "$current_status"
        echo "config=\"$config_file\""
    } > "$STATUS_FILE"
    
    log "INFO" "状态文件已更新"
    log "INFO" "========== 热切换完成 =========="
}

# 主流程
if [ -z "${1:-}" ]; then
    echo "用法: $0 <config_file>"
    echo "  config_file - 新配置文件的完整路径"
    exit 1
fi

hot_switch "$1"
