#!/system/bin/sh
set -e
set -u

readonly MODDIR="$(cd "$(dirname "$0")/.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"
readonly XRAY_BIN="$MODDIR/bin/xray"
readonly STATUS_FILE="$MODDIR/config/status.yaml"
readonly XRAY_LOG_FILE="$MODDIR/logs/xray.log"
readonly UID_LIST_FILE="$MODDIR/config/uid_list.conf"
readonly DEFAULT_PORT=1080

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
# 错误退出
# Arguments:
#   $1 - 错误消息
#   $2 - 退出码（可选，默认1）
#######################################
die() {
    log "ERROR" "$1"
    exit "${2:-1}"
}

#######################################
# 从状态文件获取配置路径
# Returns:
#   配置文件路径
#######################################
get_config_path() {
    if [ ! -f "$STATUS_FILE" ]; then
        die "状态文件不存在: $STATUS_FILE" 1
    fi
    
    local config_path
    config_path=$(awk -F'"' '/^config:/ {print $2}' "$STATUS_FILE")
    
    if [ -z "$config_path" ]; then
        die "无法从状态文件解析配置路径" 1
    fi
    
    echo "$config_path"
}

#######################################
# 从配置文件提取 inbound 端口
# Arguments:
#   $1 - 配置文件路径
# Returns:
#   端口号
#######################################
get_inbound_port() {
    local config_file="$1"
    
    if [ ! -f "$config_file" ]; then
        log "WARN" "配置文件不存在: $config_file，使用默认端口 $DEFAULT_PORT"
        echo "$DEFAULT_PORT"
        return
    fi
    
    local port
    port=$(sed -n '/\"inbounds\"/,/]/p' "$config_file" | \
           grep -o '\"port\"[[:space:]]*:[[:space:]]*[0-9]*' | \
           head -n 1 | \
           grep -o '[0-9]*')
    
    if [ -z "$port" ]; then
        log "WARN" "无法解析端口，使用默认 $DEFAULT_PORT"
        echo "$DEFAULT_PORT"
    else
        log "INFO" "解析到 inbound 端口: $port"
        echo "$port"
    fi
}

#######################################
# 清理 iptables 规则（防止重复）
#######################################
cleanup_iptables() {
    log "INFO" "清理旧的 iptables 规则..."
    
    # 删除 OUTPUT -> XRAY 规则
    iptables -t nat -D OUTPUT -p tcp -j XRAY 2>/dev/null || true
    
    # 清空并删除 XRAY 链
    iptables -t nat -F XRAY 2>/dev/null || true
    iptables -t nat -X XRAY 2>/dev/null || true
}

#######################################
# 应用 iptables NAT 规则
# Arguments:
#   $1 - NAT 端口
#######################################
apply_iptables() {
    local nat_port="$1"
    
    log "INFO" "配置 iptables NAT 规则 (端口: $nat_port)..."
    
    # 创建 XRAY 链
    if ! iptables -t nat -N XRAY 2>/dev/null; then
        log "WARN" "XRAY 链已存在，清空后重用"
        iptables -t nat -F XRAY
    fi
    
    # root UID 直连
    iptables -t nat -I OUTPUT -p tcp -m owner --uid-owner 0 -j RETURN
    log "INFO" "已添加 root UID 直连规则"
    
    # 处理 UID 白名单
    if [ -f "$UID_LIST_FILE" ] && [ -s "$UID_LIST_FILE" ]; then
        log "INFO" "读取 UID 白名单: $UID_LIST_FILE"
        
        while IFS= read -r line || [ -n "$line" ]; do
            # 移除空格和回车
            line=$(echo "$line" | tr -d '\r' | tr -d ' ')
            
            # 跳过空行
            [ -z "$line" ] && continue
            
            # 跳过注释行（以 # 或 // 开头）
            case "$line" in
                \#*|//*) continue ;;
            esac
            
            # 验证是纯数字
            case "$line" in
                *[!0-9]*) 
                    log "WARN" "跳过无效 UID: $line"
                    continue 
                    ;;
            esac
            
            # 添加 iptables 规则
            iptables -t nat -I OUTPUT -p tcp -m owner --uid-owner "$line" -j RETURN
            log "INFO" "已添加 UID 白名单: $line"
        done < "$UID_LIST_FILE"
        
        log "INFO" "UID 白名单处理完成"
    else
        log "INFO" "UID 白名单文件为空或不存在，跳过"
    fi
    
    # XRAY 链规则：重定向到 Xray 端口
    iptables -t nat -A XRAY -p tcp -j REDIRECT --to-ports "$nat_port"
    log "INFO" "已添加重定向规则: -> $nat_port"
    
    # 将 OUTPUT 链接到 XRAY
    iptables -t nat -A OUTPUT -p tcp -j XRAY
    log "INFO" "已挂接 OUTPUT -> XRAY 链"
}

#######################################
# 更新状态文件
# Arguments:
#   $1 - 配置文件路径
#######################################
update_status() {
    local config_path="$1"
    
    {
        echo "status: \"running\""
        echo "config: \"$config_path\""
    } > "$STATUS_FILE"
    
    log "INFO" "状态已更新: running, config: $config_path"
}

#######################################
# 检查 Xray 是否已运行
# Returns:
#   0 运行中, 1 未运行
#######################################
is_xray_running() {
    pgrep -f "^$XRAY_BIN" >/dev/null 2>&1
}

#######################################
# 启动 Xray 服务
#######################################
start_xray() {
    local config_path
    local nat_port
    
    log "INFO" "========== 开始启动 Xray 服务 =========="
    
    # 获取配置文件路径
    config_path=$(get_config_path)
    
    if [ ! -f "$config_path" ]; then
        die "配置文件不存在: $config_path" 1
    fi
    
    log "INFO" "使用配置文件: $config_path"
    
    # 清理旧规则
    cleanup_iptables
    
    # 启动 Xray 进程
    nohup "$XRAY_BIN" -config "$config_path" > "$XRAY_LOG_FILE" 2>&1 &
    local xray_pid=$!
    
    log "INFO" "Xray 进程已启动, PID: $xray_pid"
    
    # 等待进程稳定
    sleep 1
    
    # 验证进程是否仍在运行
    if ! kill -0 "$xray_pid" 2>/dev/null; then
        die "Xray 进程启动后立即退出，请检查配置" 1
    fi
    
    # 获取端口并配置 iptables
    nat_port=$(get_inbound_port "$config_path")
    apply_iptables "$nat_port"
    
    # 更新状态
    update_status "$config_path"
    
    log "INFO" "========== Xray 服务启动完成 =========="
}

# 主流程
if is_xray_running; then
    log "WARN" "Xray 已在运行，跳过启动"
    exit 0
fi

start_xray
