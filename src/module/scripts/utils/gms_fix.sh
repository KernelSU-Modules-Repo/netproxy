#!/system/bin/sh
# 设备兼容性修复脚本

set -u

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"

. "$MODDIR/scripts/utils/common.sh"

#######################################
# 删除链中的拦截规则
#######################################
remove_block_rules_from_chain() {
  local cmd="$1"
  local chain="$2"
  local line_numbers line_num count=0

  line_numbers="$(
    $cmd -t filter -nvL "$chain" --line-numbers 2> /dev/null \
      | awk '/REJECT|DROP/ {print $1}' \
      | sort -rn
  )"

  if [ -z "$line_numbers" ]; then
    log "INFO" "$cmd: $chain 链中未发现 REJECT 或 DROP 规则"
    return 0
  fi

  for line_num in $line_numbers; do
    if $cmd -t filter -D "$chain" "$line_num" 2> /dev/null; then
      count=$((count + 1))
      log "INFO" "已删除 $cmd $chain 链中的第 $line_num 条拦截规则"
    else
      log "WARN" "删除失败: $cmd $chain 第 $line_num 条规则"
    fi
  done

  log "INFO" "$cmd: $chain 链共删除 $count 条拦截规则"
}

#######################################
# 执行设备兼容性修复
#######################################
fix_by_device() {
  local has_iptables=0
  local has_ip6tables=0
  local is_oneplus=0
  local is_redmagic=0
  local chain

  command_exists iptables && has_iptables=1
  command_exists ip6tables && has_ip6tables=1

  if [ "$has_iptables" -eq 0 ] && [ "$has_ip6tables" -eq 0 ]; then
    log "ERROR" "iptables 和 ip6tables 均不存在"
    return 1
  fi

  if iptables -t filter -L zte_fw_gms > /dev/null 2>&1; then
    is_redmagic=1
  elif iptables -t filter -L fw_INPUT > /dev/null 2>&1; then
    is_oneplus=1
  fi

  if [ "$is_redmagic" -eq 1 ]; then
    log "INFO" "检测到红魔 / ZTE 规则，开始清理 zte_fw_gms"
    [ "$has_iptables" -eq 1 ] && remove_block_rules_from_chain "iptables" "zte_fw_gms"
    [ "$has_ip6tables" -eq 1 ] && remove_block_rules_from_chain "ip6tables" "zte_fw_gms"
  fi

  if [ "$is_oneplus" -eq 1 ]; then
    log "INFO" "检测到 OnePlus / ColorOS 规则，开始清理 fw_INPUT 与 fw_OUTPUT"
    for chain in fw_INPUT fw_OUTPUT; do
      [ "$has_iptables" -eq 1 ] && remove_block_rules_from_chain "iptables" "$chain"
      [ "$has_ip6tables" -eq 1 ] && remove_block_rules_from_chain "ip6tables" "$chain"
    done
  fi

  if [ "$is_redmagic" -eq 0 ] && [ "$is_oneplus" -eq 0 ]; then
    log "INFO" "未检测到需要修复的设备规则"
  fi
}

#######################################
# 显示帮助
#######################################
show_usage() {
  cat << EOF
用法: $(basename "$0") [run]

命令:
  run      执行设备兼容性修复
EOF
}

#######################################
# 主入口
#######################################
main() {
  case "${1:-run}" in
    run)
      log "INFO" "========== 开始执行设备兼容性修复 =========="
      fix_by_device
      log "INFO" "========== 设备兼容性修复完成 =========="
      ;;
    -h | --help | help)
      show_usage
      ;;
    *)
      show_usage
      exit 1
      ;;
  esac
}

main "$@"
