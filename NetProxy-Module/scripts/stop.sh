#!/system/bin/sh
set -e
set -u

readonly MODDIR="$(cd "$(dirname "$0")/.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"
readonly XRAY_BIN="$MODDIR/bin/xray"
readonly STATUS_FILE="$MODDIR/config/status.yaml"
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
# 清理 iptables 规则
#######################################
cleanup_iptables() {
    log "INFO" "清理 iptables NAT 规则..."
    
    # 删除 OUTPUT -> XRAY
    iptables -t nat -D OUTPUT -p tcp -j XRAY 2>/dev/null || true
    
    # 删除 root UID 规则
    iptables -t nat -D OUTPUT -p tcp -m owner --uid-owner 0 -j RETURN 2>/dev/null || true
    
    # 删除所有 RETURN 规则（UID 白名单）
    while iptables -t nat -C OUTPUT -j RETURN >/dev/null 2>&1; do
        iptables -t nat -D OUTPUT -j RETURN >/dev/null 2>&1 || break
    done
    
    # 清空并删除 XRAY 链
    iptables -t nat -F XRAY 2>/dev/null || true
    iptables -t nat -X XRAY 2>/dev/null || true
    
    log "INFO" "iptables 规则清理完成"
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
    config_path=$(awk -F'"' '/^config:/ {print $2}' "$STATUS_FILE" 2>/dev/null || echo "")
    
    {
        echo "status: \"stopped\""
        if [ -n "$config_path" ]; then
            echo "config: \"$config_path\""
        fi
    } > "$STATUS_FILE"
    
    log "INFO" "状态已更新: stopped"
}

#######################################
# 停止 Xray 服务
#######################################
stop_xray() {
    log "INFO" "========== 开始停止 Xray 服务 =========="
    
    # 终止进程
    kill_xray_process
    
    # 清理 iptables
    cleanup_iptables
    
    # 更新状态
    update_status
    
    log "INFO" "========== Xray 服务停止完成 =========="
}

# 主流程
stop_xray
