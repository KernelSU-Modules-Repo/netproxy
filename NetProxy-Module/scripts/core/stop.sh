#!/system/bin/sh
set -e
set -u

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"
readonly XRAY_BIN="$MODDIR/bin/xray"
readonly STATUS_FILE="$MODDIR/config/status.conf"
readonly KILL_TIMEOUT=5

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
# 终止 Xray 进程
# Returns:
#   0 成功, 1 失败
#######################################
kill_xray_process() {
    local pid
    pid=$(pgrep -f "^$XRAY_BIN" | head -n 1)
    
    if [ -z "$pid" ]; then
        log "INFO" "未发现运行中的 Xray 进程"
        return 0
    fi
    
    log "INFO" "正在终止 Xray 进程 (PID: $pid)..."
    
    # 尝试优雅终止
    if kill "$pid" 2>/dev/null; then
        # 等待进程退出
        local count=0
        while kill -0 "$pid" 2>/dev/null && [ "$count" -lt "$KILL_TIMEOUT" ]; do
            sleep 1
            count=$((count + 1))
        done
        
        # 如果仍在运行，强制终止
        if kill -0 "$pid" 2>/dev/null; then
            log "WARN" "进程未响应 SIGTERM，发送 SIGKILL"
            kill -9 "$pid" 2>/dev/null || true
        fi
    fi
    
    log "INFO" "Xray 进程已终止"
    return 0
}

#######################################
# 清理 TProxy 规则
#######################################
cleanup_tproxy() {
    log "INFO" "清理 TProxy 规则..."
    "$MODDIR/scripts/network/tproxy.sh" stop || true
    log "INFO" "TProxy 规则清理完成"
}

#######################################
# 更新状态文件
#######################################
update_status() {
    if [ ! -f "$STATUS_FILE" ]; then
        log "WARN" "状态文件不存在: $STATUS_FILE"
        return 0
    fi
    
    local config_path
    config_path=$(grep '^config=' "$STATUS_FILE" 2>/dev/null | cut -d'"' -f2 || echo "")
    
    {
        echo "status=\"stopped\""
        if [ -n "$config_path" ]; then
            echo "config=\"$config_path\""
        fi
    } > "$STATUS_FILE"
    
    log "INFO" "状态已更新: stopped"
}

#######################################
# 停止 Xray 服务
#######################################
stop_xray() {
    log "INFO" "========== 开始停止 Xray 服务 =========="
    
    # 清理 TProxy（先清理规则避免断网）
    cleanup_tproxy
    
    # 终止进程
    kill_xray_process
    
    # 更新状态
    update_status
    
    log "INFO" "========== Xray 服务停止完成 =========="
}

# 主流程
stop_xray
