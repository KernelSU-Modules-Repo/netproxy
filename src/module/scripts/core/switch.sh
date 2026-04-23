#!/system/bin/sh
# sing-box 出站切换脚本
# 用法: switch.sh {config|mode} <参数>

set -u

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly MODULE_CONF="$MODDIR/config/module.conf"
readonly SERVICE_SCRIPT="$MODDIR/scripts/core/service.sh"
readonly SING_BOX_BIN="$MODDIR/bin/sing-box"
readonly LOG_FILE="$MODDIR/logs/service.log"
readonly SWITCH_ALLOW_RESTART="${SWITCH_ALLOW_RESTART:-1}"

. "$MODDIR/scripts/utils/common.sh"
. "$MODDIR/scripts/utils/config.sh"
. "$MODDIR/scripts/utils/api.sh"
. "$MODDIR/scripts/utils/nodes.sh"

#######################################
# 判断 sing-box 是否在运行
#######################################
is_service_running() {
  [ -n "$(get_pid "$SING_BOX_BIN")" ]
}

#######################################
# 重启服务使配置生效
#######################################
restart_service_if_allowed() {
  if [ "$SWITCH_ALLOW_RESTART" = "1" ]; then
    log "INFO" "正在重启 sing-box 服务以应用配置..."
    LOG_STDERR=0 sh "$SERVICE_SCRIPT" restart || die "重启 sing-box 服务失败"
  else
    log "WARN" "当前阶段不允许通过重启应用配置"
    return 1
  fi
}

#######################################
# 切换节点配置
#######################################
switch_config() {
  local config_file="$1"
  local target_tag

  require_file "$MODULE_CONF" "模块配置文件不存在: $MODULE_CONF"
  require_file "$config_file" "节点配置文件不存在: $config_file"

  log "INFO" "========== 开始切换 sing-box 节点配置 =========="
  log "INFO" "目标节点文件: $config_file"

  set_conf "$MODULE_CONF" "CURRENT_CONFIG" "$(quote_conf "$config_file")"
  target_tag="$(detect_outbound_tag "$config_file" || true)"

  if ! is_service_running; then
    log "INFO" "sing-box 未运行，新的节点配置将在下次启动时生效"
    log "INFO" "========== 节点配置切换完成 =========="
    return 0
  fi

  if [ -n "$target_tag" ]; then
    if api_select_proxy "$target_tag"; then
      log "INFO" "已通过控制接口切换到节点: $target_tag"
      log "INFO" "========== 节点配置切换完成 =========="
      return 0
    fi
    log "INFO" "当前运行实例未加载目标节点或控制接口切换失败，准备重启服务"
  else
    log "INFO" "无法读取目标节点标签，准备重启服务"
  fi

  restart_service_if_allowed || {
    log "WARN" "本次仅完成配置持久化，等待下次服务重启生效"
    return 1
  }

  log "INFO" "========== 节点配置切换完成 =========="
}

#######################################
# 切换出站模式
#######################################
switch_mode() {
  local target_mode="$1"

  case "$target_mode" in
    rule | global | direct) ;;
    *)
      die "未知模式: $target_mode"
      ;;
  esac

  require_file "$MODULE_CONF" "模块配置文件不存在: $MODULE_CONF"

  log "INFO" "========== 开始切换 sing-box 出站模式: $target_mode =========="
  set_conf "$MODULE_CONF" "OUTBOUND_MODE" "$target_mode"

  if ! is_service_running; then
    log "INFO" "sing-box 未运行，新的出站模式将在下次启动时生效"
    log "INFO" "========== 出站模式切换完成 =========="
    return 0
  fi

  if api_set_mode "$target_mode"; then
    log "INFO" "已通过控制接口切换出站模式"
    log "INFO" "========== 出站模式切换完成 =========="
    return 0
  fi

  log "WARN" "控制接口切换模式失败，准备重启服务"
  restart_service_if_allowed || {
    log "WARN" "本次仅完成模式持久化，等待下次服务重启生效"
    return 1
  }

  log "INFO" "========== 出站模式切换完成 =========="
}

#######################################
# 显示帮助
#######################################
show_usage() {
  cat << EOF
用法: $(basename "$0") {config|mode} <参数>

命令:
  config <配置文件>              切换当前节点配置
  mode <rule|global|direct>     切换出站模式
EOF
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
