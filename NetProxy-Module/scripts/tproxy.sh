#!/system/bin/sh
set -e
set -u

readonly MODDIR="$(cd "$(dirname "$0")/.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"
readonly PROXY_CONF="$MODDIR/config/proxy.conf"
readonly APPS_LIST="$MODDIR/config/proxy_apps.list"

# TProxy 配置
readonly TPROXY_PORT=12345
readonly BIN_NAME="xray"
readonly MARK_ID="33554432/33554432"
readonly TABLE_ID="100"

# 内网地址段（跳过代理）
readonly INTRANET="
0.0.0.0/8
10.0.0.0/8
100.0.0.0/8
127.0.0.0/8
169.254.0.0/16
172.16.0.0/12
192.0.0.0/24
192.0.2.0/24
192.88.99.0/24
192.168.0.0/16
198.51.100.0/24
203.0.113.0/24
224.0.0.0/4
240.0.0.0/4
255.255.255.255/32
"

readonly INTRANET6="
::/128
::1/128
::ffff:0:0/96
100::/64
64:ff9b::/96
2001::/32
2001:10::/28
2001:20::/28
2001:db8::/32
2002::/16
fe80::/10
ff00::/8
"

# 运行时变量
xray_user="root"
xray_group="net_admin"
proxy_mode="blacklist"
uid_list=""

#######################################
# 记录日志
#######################################
log() {
    local level="${1:-INFO}"
    local message="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" >> "$LOG_FILE"
}

#######################################
# 错误退出
#######################################
die() {
    log "ERROR" "$1"
    exit "${2:-1}"
}

#######################################
# 读取代理模式配置
#######################################
load_proxy_config() {
    if [ -f "$PROXY_CONF" ]; then
        proxy_mode=$(grep -E "^proxy_mode=" "$PROXY_CONF" | cut -d'=' -f2 | tr -d ' \r')
        [ -z "$proxy_mode" ] && proxy_mode="blacklist"
        log "INFO" "代理模式: $proxy_mode"
    else
        proxy_mode="blacklist"
        log "WARN" "配置文件不存在，使用默认黑名单模式"
    fi
}

#######################################
# 从包名列表解析 UID
#######################################
parse_packages_uid() {
    uid_list=""
    
    if [ ! -f "$APPS_LIST" ]; then
        log "INFO" "应用列表文件不存在，跳过分应用代理"
        return
    fi
    
    while IFS= read -r line || [ -n "$line" ]; do
        # 移除空格和回车
        line=$(echo "$line" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        
        # 跳过空行和注释
        [ -z "$line" ] && continue
        case "$line" in
            \#*) continue ;;
        esac
        
        # 从 packages.list 查找 UID
        local uid
        uid=$(awk -v pkg="$line" '$1==pkg {print $2}' /data/system/packages.list 2>/dev/null)
        
        if [ -n "$uid" ]; then
            uid_list="$uid_list $uid"
            log "INFO" "解析应用 $line -> UID $uid"
        else
            log "WARN" "未找到应用 $line 的 UID"
        fi
    done < "$APPS_LIST"
    
    uid_list=$(echo "$uid_list" | sed 's/^[[:space:]]*//')
    log "INFO" "UID 列表: $uid_list"
}

#######################################
# 检测 Xray 进程的用户和组
#######################################
probe_user_group() {
    local bin_pid
    
    if bin_pid=$(busybox pidof ${BIN_NAME} 2>/dev/null || pidof ${BIN_NAME} 2>/dev/null); then
        xray_user=$(stat -c %U /proc/${bin_pid})
        xray_group=$(stat -c %G /proc/${bin_pid})
        log "INFO" "检测到 ${BIN_NAME} 运行中，用户: ${xray_user}:${xray_group} (PID: ${bin_pid})"
        return 0
    else
        xray_user="root"
        xray_group="net_admin"
        log "WARN" "${BIN_NAME} 未运行，使用默认值: ${xray_user}:${xray_group}"
        return 1
    fi
}

#######################################
# 检查内核是否支持 TPROXY
#######################################
check_tproxy_support() {
    if zcat /proc/config.gz 2>/dev/null | grep -q TPROXY; then
        return 0
    elif [ -f /proc/net/ip_tables_matches ] && grep -q TPROXY /proc/net/ip_tables_matches; then
        return 0
    else
        return 1
    fi
}

#######################################
# 获取本机 IP 地址
#######################################
get_local_ips() {
    ip -4 a 2>/dev/null | awk '/inet/ {print $2}' | grep -vE "^127.0.0.1" || true
}

#######################################
# 启动 TProxy 规则
#######################################
start_tproxy() {
    local iptables="$1"
    local ip_cmd="$2"
    local is_ipv6="$3"
    local subnet_list
    
    log "INFO" "配置 TProxy 路由规则..."
    
    # 添加策略路由
    ${ip_cmd} rule add fwmark ${MARK_ID} table ${TABLE_ID} pref ${TABLE_ID} 2>/dev/null || true
    ${ip_cmd} route add local default dev lo table ${TABLE_ID} 2>/dev/null || true
    
    # 创建 XRAY_EXTERNAL 链（处理入站流量）
    ${iptables} -t mangle -N XRAY_EXTERNAL 2>/dev/null || true
    ${iptables} -t mangle -F XRAY_EXTERNAL
    
    # DNS 流量特殊处理
    ${iptables} -t mangle -A XRAY_EXTERNAL -p tcp --dport 53 -j TPROXY --on-port ${TPROXY_PORT} --tproxy-mark ${MARK_ID}
    ${iptables} -t mangle -A XRAY_EXTERNAL -p udp --dport 53 -j TPROXY --on-port ${TPROXY_PORT} --tproxy-mark ${MARK_ID}
    
    # 已建立连接的透明标记
    ${iptables} -t mangle -A XRAY_EXTERNAL -p tcp -m socket --transparent -j MARK --set-xmark ${MARK_ID}
    ${iptables} -t mangle -A XRAY_EXTERNAL -p udp -m socket --transparent -j MARK --set-xmark ${MARK_ID}
    ${iptables} -t mangle -A XRAY_EXTERNAL -m socket -j RETURN
    
    # 跳过内网地址
    if [ "$is_ipv6" = "1" ]; then
        subnet_list="$INTRANET6"
    else
        subnet_list="$INTRANET"
        local local_ips
        local_ips=$(get_local_ips)
        subnet_list="$subnet_list $local_ips"
    fi
    
    for subnet in $subnet_list; do
        [ -z "$subnet" ] && continue
        ${iptables} -t mangle -A XRAY_EXTERNAL -d ${subnet} -j RETURN
    done
    
    # 本地回环流量代理
    ${iptables} -t mangle -A XRAY_EXTERNAL -p tcp -i lo -j TPROXY --on-port ${TPROXY_PORT} --tproxy-mark ${MARK_ID}
    ${iptables} -t mangle -A XRAY_EXTERNAL -p udp -i lo -j TPROXY --on-port ${TPROXY_PORT} --tproxy-mark ${MARK_ID}
    
    # 挂接到 PREROUTING
    ${iptables} -t mangle -I PREROUTING -j XRAY_EXTERNAL
    
    log "INFO" "配置 TProxy 本地出站规则..."
    
    # 创建 XRAY_LOCAL 链（处理本地出站）
    ${iptables} -t mangle -N XRAY_LOCAL 2>/dev/null || true
    ${iptables} -t mangle -F XRAY_LOCAL
    
    # Xray 进程流量直连（避免回环）
    ${iptables} -t mangle -A XRAY_LOCAL -m owner --uid-owner ${xray_user} --gid-owner ${xray_group} -j RETURN
    
    # DNS 流量标记
    ${iptables} -t mangle -A XRAY_LOCAL -p tcp --dport 53 -j MARK --set-xmark ${MARK_ID}
    ${iptables} -t mangle -A XRAY_LOCAL -p udp --dport 53 -j MARK --set-xmark ${MARK_ID}
    
    # 跳过内网地址
    for subnet in $subnet_list; do
        [ -z "$subnet" ] && continue
        ${iptables} -t mangle -A XRAY_LOCAL -d ${subnet} -j RETURN
    done
    
    #######################################
    # 分应用代理规则
    #######################################
    if [ "$proxy_mode" = "blacklist" ]; then
        # 黑名单模式：跳过指定应用，代理其他所有
        if [ -n "$uid_list" ]; then
            for uid in $uid_list; do
                ${iptables} -t mangle -A XRAY_LOCAL -m owner --uid-owner ${uid} -j RETURN
                log "INFO" "黑名单: UID $uid 不走代理"
            done
        fi
        # 代理所有其他流量
        ${iptables} -t mangle -A XRAY_LOCAL -p tcp -j MARK --set-xmark ${MARK_ID}
        ${iptables} -t mangle -A XRAY_LOCAL -p udp -j MARK --set-xmark ${MARK_ID}
        log "INFO" "黑名单模式: 代理所有应用（排除 ${uid_list:-无}）"
        
    elif [ "$proxy_mode" = "whitelist" ]; then
        # 白名单模式：仅代理指定应用
        if [ -n "$uid_list" ]; then
            for uid in $uid_list; do
                ${iptables} -t mangle -A XRAY_LOCAL -p tcp -m owner --uid-owner ${uid} -j MARK --set-xmark ${MARK_ID}
                ${iptables} -t mangle -A XRAY_LOCAL -p udp -m owner --uid-owner ${uid} -j MARK --set-xmark ${MARK_ID}
                log "INFO" "白名单: UID $uid 走代理"
            done
        fi
        # 始终代理 root (UID 0) 确保系统功能正常
        ${iptables} -t mangle -A XRAY_LOCAL -p tcp -m owner --uid-owner 0 -j MARK --set-xmark ${MARK_ID}
        ${iptables} -t mangle -A XRAY_LOCAL -p udp -m owner --uid-owner 0 -j MARK --set-xmark ${MARK_ID}
        # 代理 dnsmasq (UID 1052) 确保 DNS 正常
        ${iptables} -t mangle -A XRAY_LOCAL -p tcp -m owner --uid-owner 1052 -j MARK --set-xmark ${MARK_ID}
        ${iptables} -t mangle -A XRAY_LOCAL -p udp -m owner --uid-owner 1052 -j MARK --set-xmark ${MARK_ID}
        log "INFO" "白名单模式: 仅代理 ${uid_list:-无} + root + dnsmasq"
    else
        # 默认代理所有
        ${iptables} -t mangle -A XRAY_LOCAL -p tcp -j MARK --set-xmark ${MARK_ID}
        ${iptables} -t mangle -A XRAY_LOCAL -p udp -j MARK --set-xmark ${MARK_ID}
        log "INFO" "默认模式: 代理所有应用"
    fi
    
    # 挂接到 OUTPUT
    ${iptables} -t mangle -I OUTPUT -j XRAY_LOCAL
    
    # 防止 Xray 回环连接自己
    if [ "$is_ipv6" = "1" ]; then
        ${iptables} -A OUTPUT -d ::1 -p tcp -m owner --uid-owner ${xray_user} --gid-owner ${xray_group} -m tcp --dport ${TPROXY_PORT} -j REJECT
    else
        ${iptables} -A OUTPUT -d 127.0.0.1 -p tcp -m owner --uid-owner ${xray_user} --gid-owner ${xray_group} -m tcp --dport ${TPROXY_PORT} -j REJECT
    fi
    
    log "INFO" "TProxy 规则配置完成"
}

#######################################
# 停止 TProxy 规则
#######################################
stop_tproxy() {
    local iptables="$1"
    local ip_cmd="$2"
    local is_ipv6="$3"
    
    log "INFO" "清理 TProxy 规则..."
    
    # 删除策略路由
    ${ip_cmd} rule del fwmark ${MARK_ID} table ${TABLE_ID} pref ${TABLE_ID} 2>/dev/null || true
    ${ip_cmd} route flush table ${TABLE_ID} 2>/dev/null || true
    
    # 删除链挂接
    ${iptables} -t mangle -D PREROUTING -j XRAY_EXTERNAL 2>/dev/null || true
    ${iptables} -t mangle -D OUTPUT -j XRAY_LOCAL 2>/dev/null || true
    
    # 清空并删除链
    ${iptables} -t mangle -F XRAY_EXTERNAL 2>/dev/null || true
    ${iptables} -t mangle -X XRAY_EXTERNAL 2>/dev/null || true
    ${iptables} -t mangle -F XRAY_LOCAL 2>/dev/null || true
    ${iptables} -t mangle -X XRAY_LOCAL 2>/dev/null || true
    
    # 删除回环保护规则
    if [ "$is_ipv6" = "1" ]; then
        ${iptables} -D OUTPUT -d ::1 -p tcp -m owner --uid-owner ${xray_user} --gid-owner ${xray_group} -m tcp --dport ${TPROXY_PORT} -j REJECT 2>/dev/null || true
    else
        ${iptables} -D OUTPUT -d 127.0.0.1 -p tcp -m owner --uid-owner ${xray_user} --gid-owner ${xray_group} -m tcp --dport ${TPROXY_PORT} -j REJECT 2>/dev/null || true
    fi
    
    log "INFO" "TProxy 规则清理完成"
}

#######################################
# 主流程
#######################################
case "${1:-}" in
    enable)
        log "INFO" "========== 启用 TProxy 透明代理 (端口: $TPROXY_PORT) =========="
        
        # 加载配置
        load_proxy_config
        parse_packages_uid
        
        # 先清理旧规则
        probe_user_group || true
        stop_tproxy "iptables -w 100" "ip" "0" 2>/dev/null || true
        stop_tproxy "ip6tables -w 100" "ip -6" "1" 2>/dev/null || true
        
        # 检查 Xray 是否运行
        if ! probe_user_group; then
            die "请先启动 ${BIN_NAME}！" 1
        fi
        
        # 检查内核支持
        if ! check_tproxy_support; then
            die "内核不支持 TPROXY！" 1
        fi
        
        # 配置 IPv4 规则
        log "INFO" "正在创建 IPv4 TPROXY 规则..."
        start_tproxy "iptables -w 100" "ip" "0"
        
        log "INFO" "========== TProxy 透明代理已启用 =========="
        ;;
    disable)
        log "INFO" "========== 禁用 TProxy 透明代理 =========="
        
        probe_user_group || true
        stop_tproxy "iptables -w 100" "ip" "0"
        stop_tproxy "ip6tables -w 100" "ip -6" "1"
        
        log "INFO" "========== TProxy 透明代理已禁用 =========="
        ;;
    renew)
        log "INFO" "========== 刷新 TProxy 规则 =========="
        
        # 接收端口参数（可选）
        if [ -n "${2:-}" ]; then
            TPROXY_PORT="$2"
        fi
        
        # 加载配置
        load_proxy_config
        parse_packages_uid
        
        # 清理旧规则
        probe_user_group || true
        stop_tproxy "iptables -w 100" "ip" "0" 2>/dev/null || true
        stop_tproxy "ip6tables -w 100" "ip -6" "1" 2>/dev/null || true
        
        # 检查 Xray 是否运行
        if ! probe_user_group; then
            die "请先启动 ${BIN_NAME}！" 1
        fi
        
        # 重新配置规则
        start_tproxy "iptables -w 100" "ip" "0"
        
        log "INFO" "========== TProxy 规则已刷新 =========="
        ;;
    *)
        echo "用法: $0 {enable|disable|renew}"
        echo "  enable   启用 TProxy"
        echo "  disable  禁用 TProxy"
        echo "  renew    刷新 TProxy 规则"
        exit 1
        ;;
esac
