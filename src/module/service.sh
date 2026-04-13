#!/system/bin/sh
set -e

readonly MODDIR="${0%/*}"
readonly MODULE_CONF="$MODDIR/config/module.conf"
readonly LOG_FILE="$MODDIR/logs/service.log"

. "$MODDIR/scripts/utils/common.sh"

#######################################
# 加载模块配置
#######################################
load_module_config() {
  # 设置开机服务默认值
  AUTO_START=1
  GMS_FIX=1

  if [ -f "$MODULE_CONF" ]; then
    . "$MODULE_CONF"
    log "INFO" "模块配置已加载"
  else
    log "WARN" "模块配置文件不存在，使用默认值"
  fi
}

#######################################
# 等待系统启动完成
#######################################
wait_for_boot() {
  log "INFO" "等待系统启动完成..."

  # 等待系统开机完成
  while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 1
  done
  log "INFO" "系统启动完成"

  # 等待存储挂载完成
  while [ ! -d "/sdcard/Android" ]; do
    sleep 1
  done
  log "INFO" "存储挂载完成"
}

#######################################
# 执行设备特定修复脚本
#######################################
check_device_specific() {
  # 启用时执行设备兼容性修复
  if [ "$GMS_FIX" = "1" ]; then
    log "INFO" "GMS 修复已启用，执行修复脚本"
    sh "$MODDIR/scripts/utils/gms_fix.sh"
  fi
}

# 确保日志目录存在
mkdir -p "$MODDIR/logs"

#######################################
# 记录环境信息
#######################################
log_env_info() {
  log "INFO" "========== 环境信息检测 =========="

  # KernelSU 环境
  if [ "$KSU" = "true" ]; then
    log "INFO" "环境: KernelSU"
    log "INFO" "KernelSU 版本: ${KSU_VER:-未知}"
    log "INFO" "KernelSU 版本号: ${KSU_VER_CODE:-未知}"
    log "INFO" "KernelSU 内核版本号: ${KSU_KERNEL_VER_CODE:-未知}"
  fi

  # APatch / KernelPatch 环境
  if [ "$APATCH" = "true" ] || [ "$KERNELPATCH" = "true" ]; then
    log "INFO" "环境: APatch / KernelPatch"
    log "INFO" "APatch 版本: ${APATCH_VER:-未知}"
    log "INFO" "APatch 版本号: ${APATCH_VER_CODE:-未知}"
    log "INFO" "内核版本: ${KERNEL_VERSION:-未知}"
    log "INFO" "KernelPatch 版本: ${KERNELPATCH_VERSION:-未知}"
  fi

  # Magisk 环境
  if [ -n "$MAGISK_VER" ]; then
    log "INFO" "环境: Magisk"
    log "INFO" "Magisk 版本: $MAGISK_VER"
    log "INFO" "Magisk 版本号: $MAGISK_VER_CODE"
  fi

  # 模块版本信息
  if [ -f "$MODDIR/module.prop" ]; then
    local version line
    line=$(grep "^version=" "$MODDIR/module.prop")
    version="${line#*=}"
    line=$(grep "^versionCode=" "$MODDIR/module.prop")
    local versionCode="${line#*=}"
    log "INFO" "模块版本: ${version:-未知}"
    log "INFO" "模块版本号: ${versionCode:-未知}"
  fi

  log "INFO" "=================================="
}

# 主流程
log "INFO" "========== NetProxy 服务启动 =========="
log_env_info
load_module_config

wait_for_boot

# 检查是否启用开机自启
if [ "$AUTO_START" = "1" ]; then
  log "INFO" "开始启动服务..."
  sh "$MODDIR/scripts/core/service.sh" start
  log "INFO" "服务启动完成"
else
  log "INFO" "开机自启已禁用，跳过启动"
fi

# 执行设备兼容性修复
check_device_specific

log "INFO" "========== 服务启动流程结束 =========="
