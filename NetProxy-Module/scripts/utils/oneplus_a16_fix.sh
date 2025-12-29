#!/system/bin/sh
set -e
set -u

#############################################################################
# OnePlus Android 16 兼容性修复脚本
# 功能: 清理 fw_INPUT/fw_OUTPUT 链中可能阻止代理工作的 REJECT 规则
# 说明: OnePlus Android 16 (ColorOS 16) 系统可能在 filter 表中添加 REJECT
#       规则，导致 TProxy 透明代理无法正常工作。此脚本用于清理这些规则。
#############################################################################

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"

#######################################
# 记录日志
# Arguments:
#   $1 - 日志级别 (INFO / WARN / ERROR)
#   $2 - 日志消息
#######################################
log() {
    local level="${1:-INFO}"
    local message="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" >> "$LOG_FILE"
}

#######################################
# 清理 REJECT iptables / ip6tables 规则
# OnePlus Android 16 可能会在这些链中添加 REJECT 规则
#######################################
remove_reject_rules() {

    local table="filter"
    local chains="fw_INPUT fw_OUTPUT"

    for chain in $chains; do
        for cmd in iptables ip6tables; do

            if ! command -v "$cmd" >/dev/null 2>&1; then
                log "WARN" "跳过：$cmd 命令不存在"
                continue
            fi

            local reject_lines
            reject_lines=$(
                $cmd -t "$table" -nvL "$chain" --line-numbers 2>/dev/null \
                | grep 'REJECT' || true
            )

            if [ -z "$reject_lines" ]; then
                log "INFO" "$cmd: $chain 链中未发现 REJECT 规则"
                continue
            fi

            echo "$reject_lines" \
            | awk '{print $1}' \
            | sort -nr \
            | while read -r line_num; do

                [ -z "$line_num" ] && continue

                local full_rule
                full_rule=$(
                    $cmd -t "$table" -nvL "$chain" --line-numbers 2>/dev/null \
                    | awk -v ln="$line_num" '$1 == ln { sub(/^[ \t]*[0-9]+[ \t]*/, ""); print }'
                )

                if $cmd -t "$table" -D "$chain" "$line_num" 2>/dev/null; then
                    log "INFO" "已删除 ($cmd) $chain 第 $line_num 行: $full_rule"
                else
                    log "WARN" "删除失败 ($cmd) $chain 第 $line_num 行: $full_rule"
                fi
            done
        done
    done
}

#######################################
# 主流程
#######################################
log "INFO" "========== OnePlus A16 兼容性修复：开始清理 REJECT 规则 =========="

remove_reject_rules

log "INFO" "========== OnePlus A16 兼容性修复：REJECT 规则清理完成 =========="
