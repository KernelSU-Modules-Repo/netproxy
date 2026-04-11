#!/system/bin/sh
# sing-box 出站切换脚本
# 用法: switch.sh {config|mode} <参数>

set -u

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly MODULE_CONF="$MODDIR/config/module.conf"
readonly CLASH_API="127.0.0.1:9999"
readonly CLASH_SECRET="singbox"

# 导入工具库
. "$MODDIR/scripts/utils/log.sh"
. "$MODDIR/scripts/utils/common.sh"

#######################################
# 显示帮助
#######################################
show_usage() {
  cat << EOF
用法: $(basename "$0") {config|mode} <参数>

命令:
  config <配置文件>           切换当前节点配置
  mode <rule|global|direct>   切换出站运行模式
EOF
}

#######################################
# 更新模块配置项
#######################################
set_module_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$MODULE_CONF" 2> /dev/null; then
    sed -i "s|^${key}=.*|${key}=\"$value\"|" "$MODULE_CONF"
  else
    echo "${key}=\"$value\"" >> "$MODULE_CONF"
  fi
}

#######################################
# 将模块模式转换为控制接口模式
#######################################
control_mode_for_module_mode() {
  case "$1" in
    global) echo "Global" ;;
    direct) echo "Direct" ;;
    rule) echo "Rule" ;;
    *) return 1 ;;
  esac
}

#######################################
# 通过控制接口切换选择器节点
#######################################
apply_control_node() {
  local node_tag="$1"
  command -v curl > /dev/null 2>&1 || return 1

  curl -fsS -X PUT \
    -H "Authorization: Bearer $CLASH_SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$node_tag\"}" \
    "http://$CLASH_API/proxies/Proxy" > /dev/null 2>&1
}

#######################################
# 通过控制接口切换运行模式
#######################################
apply_control_mode() {
  command -v curl > /dev/null 2>&1 || return 1

  local control_mode
  control_mode="$(control_mode_for_module_mode "$1")" || return 1

  curl -fsS -X PATCH \
    -H "Authorization: Bearer $CLASH_SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"mode\":\"$control_mode\"}" \
    "http://$CLASH_API/configs" > /dev/null 2>&1
}

#######################################
# 切换节点配置
#######################################
switch_config() {
  local config_file="$1"

  [ -f "$config_file" ] || die "配置文件不存在: $config_file"

  log "INFO" "========== 正在切换 sing-box 出站配置 =========="
  log "INFO" "目标文件: $config_file"

  # 持久化当前节点路径
  set_module_value "CURRENT_CONFIG" "$config_file"

  # 服务运行中时，尝试立即切换选择器节点
  local tag
  tag="$(detect_outbound_tag "$config_file")"

  if [ -n "$tag" ] && apply_control_node "$tag"; then
    log "INFO" "已通过控制接口切换代理组至: $tag"
  else
    log "INFO" "控制接口不可用（服务未运行或节点未加载），配置将在下次启动时生效"
  fi

  log "INFO" "========== sing-box 出站配置切换完成 =========="
}

#######################################
# 切换出站模式
#######################################
switch_mode() {
  local target_mode="$1"

  case "$target_mode" in
    rule | global | direct) ;;
    *)
      echo "错误: 未知模式: $target_mode"
      exit 1
      ;;
  esac

  log "INFO" "========== 正在切换 sing-box 出站模式: $target_mode =========="

  # 持久化目标模式
  set_module_value "OUTBOUND_MODE" "$target_mode"
  log "INFO" "已更新模块配置: 出站模式=$target_mode"

  # 服务运行中时立即切换模式
  if apply_control_mode "$target_mode"; then
    log "INFO" "已通过控制接口应用新模式"
  else
    log "INFO" "控制接口调用未成功（可能服务未运行），模式将在下次启动时生效"
  fi

  log "INFO" "========== sing-box 出站模式切换完成 =========="
}

#######################################
# 主入口
#######################################
main() {
  local command="${1:-}"
  local value="${2:-}"

  case "$command" in
    config)
      [ -n "$value" ] || { show_usage; exit 1; }
      switch_config "$value"
      ;;
    mode)
      [ -n "$value" ] || { show_usage; exit 1; }
      switch_mode "$value"
      ;;
    -h | --help | help | "")
      show_usage
      [ -n "$command" ] || exit 1
      ;;
    *)
      show_usage
      exit 1
      ;;
  esac
}

main "$@"
