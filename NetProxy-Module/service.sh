#!/system/bin/sh
set -e

readonly MAX_WAIT=60
readonly MODDIR="${0%/*}"

#######################################
# 等待系统启动完成
# Returns:
#   0 成功, 1 超时
#######################################
wait_for_boot() {
    local count=0
    
    # 等待系统开机完成
    while [ "$(getprop sys.boot_completed)" != "1" ]; do
        sleep 1
        count=$((count + 1))
        [ "$count" -ge "$MAX_WAIT" ] && return 1
    done
    
    # 等待存储挂载完成
    count=0
    while [ ! -d "/sdcard/Android" ]; do
        sleep 1
        count=$((count + 1))
        [ "$count" -ge "$MAX_WAIT" ] && return 1
    done
    
    return 0
}

#######################################
# 检测设备并执行特定脚本
#######################################
check_device_specific() {
    local brand=$(getprop ro.product.brand)
    local android_version=$(getprop ro.build.version.release)
    
    # OnePlus + Android 16 需要清理 REJECT 规则
    if [ "$brand" = "OnePlus" ] && [ "$android_version" = "16" ]; then
        echo "检测到 OnePlus Android 16，执行 clean_reject.sh" >> /dev/kmsg
        if [ -f "$MODDIR/scripts/clean_reject.sh" ]; then
            sh "$MODDIR/scripts/clean_reject.sh"
        fi
    fi
}

# 主流程
if wait_for_boot; then
    # 启动服务
    sh "$MODDIR/scripts/start.sh"
    
    # 执行设备特定脚本
    check_device_specific
else
    echo "系统启动超时，无法启动 NetProxy" >> /dev/kmsg
    exit 1
fi