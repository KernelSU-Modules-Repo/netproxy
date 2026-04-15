#!/system/bin/sh
# NetProxy Magisk 模块安装脚本

SKIPUNZIP=1

################################################################################
# 常量定义
################################################################################

readonly MODULE_ID="netproxy"
readonly LIVE_DIR="/data/adb/modules/$MODULE_ID"
readonly CONFIG_DIR="$LIVE_DIR/config"
readonly BACKUP_DIR="$TMPDIR/netproxy_backup"
readonly LEGACY_CORE_NAME="x""ray"
readonly LEGACY_WEB_DIR_NAME="web""root"

# 全局状态: 代理服务是否在运行
PROXY_WAS_RUNNING=false

# 需要保留的配置文件/目录 (相对于 config/)
readonly PRESERVE_CONFIGS="
    module.conf
    tproxy/
    singbox/
"

# 需要设置可执行权限的文件
readonly EXECUTABLE_FILES="
    bin/sing-box
    bin/proxylink
    bin/IPSET-LKM/ko-loader
    bin/IPSET-LKM/ipset
    action.sh
    scripts/cli
    scripts/core/service.sh
    scripts/core/switch.sh
    scripts/network/tproxy.sh
    scripts/core/subscription.sh
    scripts/utils/ipset.sh
    scripts/utils/gms_fix.sh
"

################################################################################
# 工具函数
################################################################################

# 打印带分隔线的标题
print_title() {
  ui_print ""
  ui_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ui_print "  $1"
  ui_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# 打印步骤
print_step() {
  ui_print "▶ $1"
}

# 打印成功
print_ok() {
  ui_print "  ✓ $1"
}

# 打印警告
print_warn() {
  ui_print "  ⚠ $1"
}

# 打印错误
print_error() {
  ui_print "  ✗ $1"
}

# 检查目录是否非空
dir_not_empty() {
  [ -d "$1" ] && [ "$(ls -A "$1" 2> /dev/null)" ]
}

################################################################################
# 核心函数
################################################################################

# 备份现有配置
backup_config() {
  print_step "检查现有配置..."

  if ! dir_not_empty "$CONFIG_DIR"; then
    print_ok "全新安装，无需备份"
    return 0
  fi

  print_step "备份现有配置..."
  mkdir -p "$BACKUP_DIR"

  local config_item
  for config_item in $PRESERVE_CONFIGS; do
    local src="$CONFIG_DIR/$config_item"
    local dst="$BACKUP_DIR/$config_item"

    if [ -e "$src" ]; then
      mkdir -p "$(dirname "$dst")"
      if cp -r "$src" "$dst" 2> /dev/null; then
        print_ok "已备份: $config_item"
      else
        print_warn "备份失败: $config_item"
      fi
    fi
  done

  return 0
}

# 解压模块文件
extract_module() {
  print_step "解压模块文件..."

  # 解压到安装临时目录，排除 META-INF 目录
  if ! unzip -o "$ZIPFILE" -x "META-INF/*" -d "$MODPATH" > /dev/null 2>&1; then
    print_error "解压失败"
    return 1
  fi

  print_ok "模块文件已解压"
  return 0
}

# 恢复配置文件
restore_config() {
  if ! dir_not_empty "$BACKUP_DIR"; then
    return 0
  fi

  print_step "恢复配置文件..."

  local config_item
  for config_item in $PRESERVE_CONFIGS; do
    local src="$BACKUP_DIR/$config_item"
    local dst="$MODPATH/config/$config_item"

    if [ -e "$src" ]; then
      # 创建父目录
      mkdir -p "$(dirname "$dst")"
      # 删除目标 (防止目录嵌套)
      rm -rf "$dst" 2> /dev/null
      # 复制
      if cp -r "$src" "$dst" 2> /dev/null; then
        print_ok "已恢复: $config_item"
      else
        print_warn "恢复失败: $config_item"
      fi
    fi
  done

  return 0
}

# 停止代理服务 (如果运行中)
stop_proxy_if_running() {
  # 如果 LIVE_DIR 不存在，无需停止
  if [ ! -d "$LIVE_DIR" ]; then
    return 0
  fi

  if pidof -s "$LIVE_DIR/bin/sing-box" > /dev/null 2>&1 || pidof -s "$LIVE_DIR/bin/$LEGACY_CORE_NAME" > /dev/null 2>&1; then
    PROXY_WAS_RUNNING=true
    print_step "检测到代理服务正在运行，停止服务..."
    sh "$LIVE_DIR/scripts/core/service.sh" stop > /dev/null 2>&1
    print_ok "服务已停止"
  fi

  return 0
}

# 同步到运行时目录 (热更新支持)
sync_to_live() {
  print_step "同步到运行时目录..."

  # 如果 LIVE_DIR 不存在，首次安装无需同步
  if [ ! -d "$LIVE_DIR" ]; then
    print_ok "首次安装，跳过同步"
    return 0
  fi


  # 同步程序文件和脚本
  local sync_dirs="bin scripts action.sh service.sh module.prop"

  for item in $sync_dirs; do
    local src="$MODPATH/$item"
    local dst="$LIVE_DIR/$item"

    if [ -e "$src" ]; then
      rm -rf "$dst" 2> /dev/null
      if cp -r "$src" "$dst" 2> /dev/null; then
        print_ok "已同步: $item"
      else
        print_warn "同步失败: $item"
      fi
    fi
  done

  # 同步配置目录中的新文件 (增量更新)
  if [ -d "$MODPATH/config" ]; then
    print_step "增量更新配置..."

    # 复制新增的配置文件 (不覆盖已存在的)
    cp -rn "$MODPATH/config/"* "$LIVE_DIR/config/" 2> /dev/null
    print_ok "配置目录已增量更新"
  fi

  return 0
}

# 重新启动代理服务 (如果之前在运行)
restart_proxy_if_needed() {
  if [ "$PROXY_WAS_RUNNING" = true ]; then
    print_step "重新启动代理服务..."
    sh "$LIVE_DIR/scripts/core/service.sh" start > /dev/null 2>&1
    print_ok "服务已启动"
  fi

  return 0
}

# 设置文件权限
set_permissions() {
  print_step "设置文件权限..."

  local file
  for file in $EXECUTABLE_FILES; do
    local path="$MODPATH/$file"
    if [ -e "$path" ]; then
      chmod 0755 "$path" 2> /dev/null
      # 同步设置运行时目录中的权限
      [ -e "$LIVE_DIR/$file" ] && chmod 0755 "$LIVE_DIR/$file" 2> /dev/null
    fi
  done

  # 设置目录权限
  set_perm_recursive "$MODPATH" 0 0 0755 0755

  print_ok "权限设置完成"
  return 0
}

# 询问用户是否安装配套应用
ask_install_app() {
  ui_print ""
  ui_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ui_print "  是否安装 NetProxy 配套应用？"
  ui_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ui_print ""
  ui_print "  [音量+] 安装 (打开 Google Play)"
  ui_print "  [音量-] 跳过"
  ui_print ""

  local timeout=10
  local choice=""

  while [ $timeout -gt 0 ]; do
    # 读取音量键
    local key=$(getevent -lqc 1 2> /dev/null | grep -E "KEY_VOLUME(UP|DOWN)" | head -1)

    if echo "$key" | grep -q "VOLUMEUP"; then
      choice="install"
      break
    elif echo "$key" | grep -q "VOLUMEDOWN"; then
      choice="skip"
      break
    fi

    sleep 1
    timeout=$((timeout - 1))
  done

  if [ "$choice" = "install" ]; then
    print_step "正在打开 Google Play..."
    am start -a android.intent.action.VIEW -d "https://play.google.com/store/apps/details?id=com.fanjv.netproxy" > /dev/null 2>&1
    print_ok "已打开 Google Play"
  else
    print_step "已跳过安装"
  fi

  return 0
}

# 集成 IPSET LKM 驱动安装
install_ipset_lkm() {
  print_title "集成 IPSET 驱动安装"

  # 如果安装包中不包含 IPSET 组件，跳过整个流程
  if [ ! -d "$MODPATH/bin/IPSET-LKM" ] && [ ! -f "$MODPATH/bin/ipset" ]; then
      print_ok "安装包未包含 IPSET 组件，跳过"
      return 0
  fi

  local skip_lkm=false

  # 1. 检查内核是否已内置 IP_SET 支持
  print_step "正在检查系统 IPSET 状态..."
  if [ -f /proc/config.gz ] && zcat /proc/config.gz | grep -q "CONFIG_IP_SET=y"; then
      skip_lkm=true
  fi

  if [ "$skip_lkm" = "true" ]; then
      if command -v ipset >/dev/null 2>&1; then
          print_ok "内核支持与工具均已完备，无需安装。"
          # 清理防止占用空间
          rm -rf "$MODPATH/bin/IPSET-LKM/netfilter"
          return 0
      else
          print_ok "内核已内置支持，将仅安装二进制工具。"
      fi
  fi

  # 2. 检测内核版本并选择驱动
  if [ "$skip_lkm" = "false" ]; then
      local kernel_ver=$(uname -r | cut -d. -f1,2)
      print_step "检测到内核版本: $kernel_ver"

      local src=""
      case "$kernel_ver" in
          5.10) src="5.10" ;;
          5.15) src="5.15" ;;
          6.1)  src="6.1" ;;
          6.6)  src="6.6" ;;
          6.12) src="6.12" ;;
          *) 
              print_warn "不支持的内核版本: $kernel_ver"
              print_warn "将跳过 IPSET 驱动安装"
              skip_lkm=true
              ;;
      esac

      if [ "$skip_lkm" = "false" ]; then
          local driver_source="$MODPATH/bin/IPSET-LKM/netfilter/$src"
          if [ -d "$driver_source" ]; then
              print_step "正在安装适用于内核 $src 的驱动..."
              rm -rf "/data/adb/netfilter"
              mkdir -p "/data/adb/netfilter"
              if cp -rf "$driver_source/"* "/data/adb/netfilter/" 2> /dev/null; then
                  set_perm_recursive "/data/adb/netfilter" 0 0 0755 0755
                  print_ok "IPSET LKM 驱动已部署到 /data/adb/netfilter"
              else
                  print_error "驱动部署失败"
              fi
          else
              print_warn "模块中缺少内核 $src 的驱动文件"
          fi
      fi
  fi

  # 3. 配置 IPSET 二进制工具环境
  if [ -f "$MODPATH/bin/ipset" ]; then
      print_step "配置 IPSET 二进制工具环境..."

      if [ "$KSU" ] || [ "$APATCH" ]; then
          print_ok "检测到 KernelSU/APatch 环境"
          local ksu_bin="/data/adb/ksu/bin"
          [ "$APATCH" ] && ksu_bin="/data/adb/ap/bin"

          mkdir -p "$ksu_bin"
          rm -f "$ksu_bin/ipset"
          ln -s "/data/adb/modules/netproxy/bin/ipset" "$ksu_bin/ipset"
          print_ok "已创建符号链接: $ksu_bin/ipset"

      elif [ "$MAGISK_VER_CODE" ]; then
          print_ok "检测到 Magisk 环境"
          mkdir -p "$MODPATH/system/bin"
          cp -f "$MODPATH/bin/ipset" "$MODPATH/system/bin/ipset"
          set_perm "$MODPATH/system/bin/ipset" 0 0 0755
          print_ok "ipset 已挂载至 /system/bin"
      fi
  fi

  # 4. 清理驱动源码以减小模块体积
  rm -rf "$MODPATH/bin/IPSET-LKM/netfilter"

  return 0
}

# 清理临时文件
cleanup() {
  rm -rf "$BACKUP_DIR" 2> /dev/null
}

################################################################################
# 主流程
################################################################################

print_title "NetProxy - sing-box 透明代理"
ui_print "  版本: $(grep_prop version "$TMPDIR/module.prop" 2> /dev/null || echo "未知")"

# 解压 module.prop 读取版本
unzip -o "$ZIPFILE" "module.prop" -d "$TMPDIR" > /dev/null 2>&1

# 执行安装步骤
if backup_config \
  && extract_module \
  && restore_config \
  && stop_proxy_if_running \
  && install_ipset_lkm \
  && sync_to_live \
  && set_permissions \
  && restart_proxy_if_needed; then

  cleanup

  print_title "安装完成，请重启设备"

  # 询问是否安装配套应用
  ask_install_app
else
  cleanup
  print_title "安装失败"
  ui_print ""
  ui_print "  请检查上述错误信息"
  ui_print "  并在 GitHub Issues 反馈"
  ui_print ""
  exit 1
fi
