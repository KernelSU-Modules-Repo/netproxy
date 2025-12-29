#!/system/bin/sh
set -e

readonly MAX_WAIT=60
readonly MODDIR="${0%/*}"
readonly MODULE_CONF="$MODDIR/config/module.conf"

#######################################
# 加载模块配置
#######################################
load_module_config() {
    # 默认值
    AUTO_START=1
    ONEPLUS_A16_FIX=1
    
    if [ -f "$MODULE_CONF" ]; then
        . "$MODULE_CONF"
    fi
}

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
    # 检查是否启用 OnePlus A16 修复
    if [ "$ONEPLUS_A16_FIX" != "1" ]; then
        return 0
    fi
    
    local brand=$(getprop ro.product.brand)
    local android_version=$(getprop ro.build.version.release)
    
    # OnePlus + Android 16 需要清理 REJECT 规则
    if [ "$brand" = "OnePlus" ] && [ "$android_version" = "16" ]; then
        echo "检测到 OnePlus Android 16，执行 oneplus_a16_fix.sh" >> /dev/kmsg
        if [ -f "$MODDIR/scripts/utils/oneplus_a16_fix.sh" ]; then
            sh "$MODDIR/scripts/utils/oneplus_a16_fix.sh"
        fi
    fi
}

# 主流程
load_module_config

if wait_for_boot; then
    # 检查是否启用开机自启
    if [ "$AUTO_START" = "1" ]; then
        # 启动服务
        sh "$MODDIR/scripts/core/start.sh"
    else
        echo "NetProxy 开机自启已禁用" >> /dev/kmsg
    fi
    
    # 执行设备特定脚本
    check_device_specific
else
    echo "系统启动超时，无法启动 NetProxy" >> /dev/kmsg
    exit 1
fi