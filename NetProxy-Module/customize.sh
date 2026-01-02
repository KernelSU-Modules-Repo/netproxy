#!/system/bin/sh

SKIPUNZIP=1

readonly CONFIG_DIR="/data/adb/modules/netproxy/config"
readonly OLD_MODULE_PROP="/data/adb/modules/netproxy/module.prop"

#######################################
# 获取已安装模块版本
#######################################
get_installed_version() {
    if [ -f "$OLD_MODULE_PROP" ]; then
        grep "^version=" "$OLD_MODULE_PROP" | cut -d'=' -f2 | tr -d ' \r\n\t'
    else
        echo ""
    fi
}

#######################################
# 备份并恢复配置文件
# Returns:
#   0 成功, 1 失败
#######################################
backup_and_restore_config() {
    if [ -d "$CONFIG_DIR" ] && [ "$(ls -A "$CONFIG_DIR" 2>/dev/null)" ]; then
        ui_print "检测到现有配置，开始备份..."
        
        # 获取已安装版本
        local installed_version=$(get_installed_version)
        ui_print "当前已安装版本: ${installed_version:-未知}"
        
        # 备份整个 config 目录
        if ! cp -r "$CONFIG_DIR" "$TMPDIR/config_backup" >/dev/null 2>&1; then
            ui_print "警告: 配置备份失败"
            return 1
        fi
        
        # 解压新文件（排除整个配置目录）
        ui_print "解压模块文件（保留现有配置）..."
        if ! unzip -o "$ZIPFILE" -x "config/*" -d "$MODPATH" >/dev/null 2>&1; then
            ui_print "错误: 解压失败"
            return 1
        fi
        
        # 创建 config 目录（如果不存在）
        mkdir -p "$MODPATH/config" >/dev/null 2>&1
        
        # 恢复整个 config 目录
        ui_print "恢复配置文件..."
        if ! cp -r "$TMPDIR/config_backup"/* "$MODPATH/config/" >/dev/null 2>&1; then
            ui_print "警告: 配置恢复失败"
            return 1
        fi
        
        ui_print "配置文件已保留"
        
        # 版本升级处理：仅从 4.0.1 升级时提示
        case "$installed_version" in
            *4.0.1*)
                handle_config_upgrade
                ;;
            *)
                ui_print "无需额外配置更新"
                ;;
        esac
    else
        ui_print "全新安装，解压完整模块..."
        if ! unzip -o "$ZIPFILE" -d "$MODPATH" >/dev/null 2>&1; then
            ui_print "错误: 解压失败"
            return 1
        fi
    fi
    
    return 0
}

#######################################
# 版本升级配置处理
# 从 4.0.1 升级到 4.0.2 需要更新的配置文件
#######################################
handle_config_upgrade() {
    ui_print ""
    ui_print "========================================="
    ui_print "   检测到版本升级"
    ui_print "   以下配置文件有重要更新："
    ui_print "   - 03_routing.json (路由规则)"
    ui_print "   - 04_policy.json (策略配置)"
    ui_print "   - 06_outbounds.json (出站配置)"
    ui_print "   - outbounds/default.json (默认节点)"
    ui_print "========================================="
    ui_print ""
    ui_print "按 [音量+] 覆盖更新这些配置文件"
    ui_print "按 [音量-] 保留现有配置（需手动合并）"
    ui_print ""
    
    # 等待用户输入
    local choice
    if timeout 30 /system/bin/getevent -lqc 1 2>/dev/null | grep -q KEY_VOLUMEUP; then
        choice="up"
    else
        choice="down"
    fi
    
    # 备用方案：使用 volume_key 检测（兼容不同环境）
    if [ -z "$choice" ]; then
        local timeout_count=0
        while [ $timeout_count -lt 30 ]; do
            local key_event=$(getevent -lqc 1 2>/dev/null)
            if echo "$key_event" | grep -q "KEY_VOLUMEUP"; then
                choice="up"
                break
            elif echo "$key_event" | grep -q "KEY_VOLUMEDOWN"; then
                choice="down"
                break
            fi
            sleep 1
            timeout_count=$((timeout_count + 1))
        done
    fi
    
    # 默认不覆盖
    if [ -z "$choice" ]; then
        choice="down"
    fi
    
    if [ "$choice" = "up" ]; then
        ui_print "正在更新配置文件..."
        
        # 解压指定的配置文件到临时目录
        unzip -o "$ZIPFILE" \
            "config/xray/confdir/03_routing.json" \
            "config/xray/confdir/04_policy.json" \
            "config/xray/confdir/06_outbounds.json" \
            "config/xray/outbounds/default.json" \
            -d "$TMPDIR/new_config" >/dev/null 2>&1
        
        # 覆盖到模块目录
        if [ -f "$TMPDIR/new_config/config/xray/confdir/03_routing.json" ]; then
            cp -f "$TMPDIR/new_config/config/xray/confdir/03_routing.json" "$MODPATH/config/xray/confdir/"
            ui_print "  ✓ 已更新 03_routing.json"
        fi
        
        if [ -f "$TMPDIR/new_config/config/xray/confdir/04_policy.json" ]; then
            cp -f "$TMPDIR/new_config/config/xray/confdir/04_policy.json" "$MODPATH/config/xray/confdir/"
            ui_print "  ✓ 已更新 04_policy.json"
        fi
        
        if [ -f "$TMPDIR/new_config/config/xray/confdir/06_outbounds.json" ]; then
            cp -f "$TMPDIR/new_config/config/xray/confdir/06_outbounds.json" "$MODPATH/config/xray/confdir/"
            ui_print "  ✓ 已更新 06_outbounds.json"
        fi
        
        if [ -f "$TMPDIR/new_config/config/xray/outbounds/default.json" ]; then
            cp -f "$TMPDIR/new_config/config/xray/outbounds/default.json" "$MODPATH/config/xray/outbounds/"
            ui_print "  ✓ 已更新 default.json"
        fi
        
        ui_print "配置文件已更新"
    else
        ui_print "保留现有配置文件"
        ui_print "请参考 changelog.md 手动合并更新"
    fi
}

#######################################
# 设置文件权限
#######################################
set_permissions() {
    ui_print "设置文件权限..."
    
    set_perm_recursive "$MODPATH/bin/xray" 0 0 0755 0755
    set_perm_recursive "$MODPATH/scripts/core/start.sh" 0 0 0755 0755
    set_perm_recursive "$MODPATH/scripts/core/stop.sh" 0 0 0755 0755
    set_perm_recursive "$MODPATH/scripts/network/tproxy.sh" 0 0 0755 0755
    set_perm_recursive "$MODPATH/scripts/core/switch-config.sh" 0 0 0755 0755
    set_perm_recursive "$MODPATH/scripts/utils/update-xray.sh" 0 0 0755 0755
    set_perm_recursive "$MODPATH/bin/proxylink" 0 0 0755 0755
    set_perm_recursive "$MODPATH/scripts/config/subscription.sh" 0 0 0755 0755
    set_perm_recursive "$MODPATH/scripts/utils/oneplus_a16_fix.sh" 0 0 0755 0755
    set_perm_recursive "$MODPATH/scripts/cli" 0 0 0755 0755
    set_perm_recursive "$MODPATH/action.sh" 0 0 0755 0755
}

# 主流程
ui_print "========================================="
ui_print "   NetProxy - Xray 透明代理模块"
ui_print "========================================="

if backup_and_restore_config && set_permissions; then
    # 安装 NetProxy.apk
    if [ -f "$MODPATH/NetProxy.apk" ]; then
        ui_print "正在安装 NetProxy 应用..."
        if pm install -r "$MODPATH/NetProxy.apk" >/dev/null 2>&1; then
            ui_print "NetProxy 应用安装成功"
        else
            ui_print "警告: NetProxy 应用安装失败"
        fi
        # 删除 APK 文件
        rm -f "$MODPATH/NetProxy.apk"
    fi
    
    ui_print "安装成功！"
    ui_print "请重启设备以使模块生效"
else
    ui_print "安装过程中出现错误"
    ui_print "请检查日志并重试"
    exit 1
fi