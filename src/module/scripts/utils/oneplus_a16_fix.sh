#!/system/bin/sh
set -e
set -u

#############################################################################
# 多机型兼容性修复脚本（OnePlus ColorOS + REDMAGIC OS / ZTE）
# 功能:
#   - OnePlus Android 16 (ColorOS 16): 清理 fw_INPUT / fw_OUTPUT 链中阻止 Google Play / GMS 工作的 REJECT 规则
#   - REDMAGIC OS (ZTE): 清理 zte_fw_gms 链中阻止 Google Play / GMS 工作的 DROP/REJECT 规则
#############################################################################

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"

# 导入工具库
. "$MODDIR/scripts/utils/log.sh"

#######################################
# 清理指定链中的 REJECT/DROP 规则
# Arguments:
#   $1 - iptables 命令 (iptables / ip6tables)
#   $2 - 链名
#######################################
remove_block_rules_from_chain() {
  local cmd="$1"
  local chain="$2"
  local table="filter"

  # 获取所有 REJECT 或 DROP 规则的行号（倒序）
  local line_numbers
  line_numbers=$(
    $cmd -t "$table" -nvL "$chain" --line-numbers 2> /dev/null \
      | awk '/REJECT|DROP/ {print $1}' \
      | sort -rn
  )

  if [ -z "$line_numbers" ]; then
    log "INFO" "$cmd: $chain 链中未发现 REJECT/DROP 规则"
    return 0
  fi

  local count=0

  for line_num in $line_numbers; do
    if $cmd -t "$table" -D "$chain" "$line_num" 2> /dev/null; then
      log "INFO" "已删除 ($cmd) $chain 第 $line_num 行 REJECT/DROP 规则"
      count=$((count + 1))
    else
      log "WARN" "删除失败 ($cmd) $chain 第 $line_num 行"
    fi
  done

  log "INFO" "$cmd: $chain 链共删除 $count 条 REJECT/DROP 规则"
}

#######################################
# 检测并执行对应机型的清理
#######################################
fix_by_device() {
  local has_iptables=0
  local has_ip6tables=0

  command -v iptables > /dev/null 2>&1 && has_iptables=1
  command -v ip6tables > /dev/null 2>&1 && has_ip6tables=1

  if [ "$has_iptables" -eq 0 ] && [ "$has_ip6tables" -eq 0 ]; then
    log "ERROR" "iptables 和 ip6tables 命令均不存在"
    return 1
  fi

  # 检测系统特征（通过链存在性）
  local is_oneplus=0
  local is_redmagic=0

  if iptables -t filter -L zte_fw_gms >/dev/null 2>&1; then
    is_redmagic=1
  elif iptables -t filter -L fw_INPUT >/dev/null 2>&1; then
    is_oneplus=1
  fi

  # 默认都尝试（如果链存在就清理，避免误判）
  local oneplus_chains="fw_INPUT fw_OUTPUT"
  local redmagic_chains="zte_fw_gms"

  log "INFO" "开始检测并修复..."

  # RedMagic 部分
  if [ "$is_redmagic" -eq 1 ]; then
    log "INFO" "检测到 REDMAGIC OS / ZTE 特征，开始清理 zte_fw_gms"
    for chain in $redmagic_chains; do
      [ "$has_iptables" -eq 1 ] && remove_block_rules_from_chain "iptables" "$chain"
      [ "$has_ip6tables" -eq 1 ] && remove_block_rules_from_chain "ip6tables" "$chain"
    done
  fi

  # OnePlus 部分
  if [ "$is_oneplus" -eq 1 ]; then
    log "INFO" "检测到 OnePlus/ColorOS 特征，开始清理 fw_INPUT/fw_OUTPUT"
    for chain in $oneplus_chains; do
      [ "$has_iptables" -eq 1 ] && remove_block_rules_from_chain "iptables" "$chain"
      [ "$has_ip6tables" -eq 1 ] && remove_block_rules_from_chain "ip6tables" "$chain"
    done
  fi

}

#######################################
# 主流程
#######################################
log "INFO" "========== 多机型兼容性修复：开始（OnePlus + REDMAGIC） =========="

fix_by_device

log "INFO" "========== 多机型兼容性修复：完成 =========="