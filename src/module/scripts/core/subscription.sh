#!/system/bin/sh
# sing-box 节点来源导入脚本

set -e
set -u

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly OUTBOUNDS_DIR="$MODDIR/config/singbox/outbounds"
readonly DEFAULT_DIR="$OUTBOUNDS_DIR/default"
readonly PROXYLINK_BIN="$MODDIR/bin/proxylink"
readonly LOG_FILE="$MODDIR/logs/subscription.log"

. "$MODDIR/scripts/utils/common.sh"

#######################################
# 显示帮助
#######################################
show_help() {
  cat << EOF
用法: $(basename "$0") <命令> [参数]

导入节点:
  parse <节点链接> [目录]       单个链接转 sing-box 节点
  file <文件> [目录]           文件节点或 Clash YAML 转 sing-box 节点
  sub <订阅链接> [目录]        订阅转 sing-box 节点，每个节点一个文件

订阅管理:
  add <名称> <订阅链接>        添加订阅并导入节点
  update <名称>                更新指定订阅
  update-all                   更新所有订阅
  remove <名称>                删除订阅
  list                         列出订阅

示例:
  $(basename "$0") parse "vless://..."
  $(basename "$0") file "/sdcard/clash.yaml"
  $(basename "$0") sub "https://example.com/sub" "$OUTBOUNDS_DIR/sub_demo"
EOF
}

#######################################
# 检查 proxylink 环境
#######################################
check_proxylink() {
  [ -x "$PROXYLINK_BIN" ] || die "proxylink 不存在或不可执行: $PROXYLINK_BIN"
}

#######################################
# 清理文件名
#######################################
sanitize_name() {
  echo "$1" | sed 's/[\/\\:*?"<>| ]/_/g'
}

#######################################
# 转义 JSON 字符串
#######################################
escape_json() {
  printf "%s" "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

#######################################
# 准备输出目录
#######################################
prepare_output_dir() {
  local target_dir="${1:-$DEFAULT_DIR}"

  mkdir -p "$target_dir" || die "无法创建输出目录: $target_dir"
  echo "$target_dir"
}

#######################################
# 单个链接转 sing-box
#######################################
import_parse() {
  local link="$1"
  local target_dir
  local old_pwd

  [ -n "$link" ] || die "用法: $(basename "$0") parse <节点链接> [目录]"
  check_proxylink
  target_dir="$(prepare_output_dir "${2:-}")"

  log "INFO" "导入单个节点到: $target_dir"
  old_pwd="$(pwd)"
  cd "$target_dir" || die "Cannot enter output directory: $target_dir"
  "$PROXYLINK_BIN" -parse "$link" -insecure -dns -format singbox -auto >> "$LOG_FILE" 2>&1
  cd "$old_pwd" || true
  log "INFO" "单个节点导入完成"
}

#######################################
# 文件节点转 sing-box
#######################################
import_file() {
  local file="$1"
  local target_dir

  [ -n "$file" ] || die "用法: $(basename "$0") file <文件> [目录]"
  [ -f "$file" ] || die "文件不存在: $file"
  check_proxylink
  target_dir="$(prepare_output_dir "${2:-}")"

  log "INFO" "导入文件节点到: $target_dir"
  "$PROXYLINK_BIN" -file "$file" -insecure -dns -format singbox -dir "$target_dir" >> "$LOG_FILE" 2>&1
  log "INFO" "文件节点导入完成"
}

#######################################
# 订阅转 sing-box
#######################################
import_sub() {
  local url="$1"
  local target_dir

  [ -n "$url" ] || die "用法: $(basename "$0") sub <订阅链接> [目录]"
  check_proxylink
  target_dir="$(prepare_output_dir "${2:-}")"

  log "INFO" "导入订阅节点到: $target_dir"
  "$PROXYLINK_BIN" -sub "$url" -insecure -dns -format singbox -dir "$target_dir" >> "$LOG_FILE" 2>&1
  log "INFO" "订阅节点导入完成"
}

#######################################
# 写入订阅元信息
#######################################
write_subscription_meta() {
  local name="$1"
  local url="$2"
  local target_dir="$3"

  cat > "$target_dir/_meta.json" << EOF
{
  "name": "$(escape_json "$name")",
  "url": "$(escape_json "$url")",
  "updated": "$(date -Iseconds)"
}
EOF
}

#######################################
# 添加订阅
#######################################
add_subscription() {
  local name="$1"
  local url="$2"
  local safe_name sub_dir

  [ -n "$name" ] || die "用法: $(basename "$0") add <名称> <订阅链接>"
  [ -n "$url" ] || die "用法: $(basename "$0") add <名称> <订阅链接>"

  safe_name="$(sanitize_name "$name")"
  sub_dir="$OUTBOUNDS_DIR/sub_$safe_name"

  [ ! -d "$sub_dir" ] || die "订阅已存在: $name"
  mkdir -p "$sub_dir" || die "无法创建订阅目录: $sub_dir"

  write_subscription_meta "$name" "$url" "$sub_dir"
  import_sub "$url" "$sub_dir"
  log "INFO" "订阅添加完成: $name"
}

#######################################
# 更新订阅
#######################################
update_subscription() {
  local name="$1"
  local safe_name sub_dir meta_file url

  [ -n "$name" ] || die "用法: $(basename "$0") update <名称>"

  safe_name="$(sanitize_name "$name")"
  sub_dir="$OUTBOUNDS_DIR/sub_$safe_name"
  meta_file="$sub_dir/_meta.json"

  [ -f "$meta_file" ] || die "订阅不存在: $name"
  url="$(grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' "$meta_file" | sed 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
  [ -n "$url" ] || die "无法读取订阅链接: $meta_file"

  find "$sub_dir" -name "*.json" ! -name "_meta.json" -delete
  import_sub "$url" "$sub_dir"
  write_subscription_meta "$name" "$url" "$sub_dir"
  log "INFO" "订阅更新完成: $name"
}

#######################################
# 更新所有订阅
#######################################
update_all_subscriptions() {
  local count=0 sub_dir meta_file name

  for sub_dir in "$OUTBOUNDS_DIR"/sub_*; do
    [ -d "$sub_dir" ] || continue
    meta_file="$sub_dir/_meta.json"
    [ -f "$meta_file" ] || continue

    name="$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$meta_file" | sed 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
    [ -n "$name" ] || continue

    update_subscription "$name"
    count=$((count + 1))
  done

  log "INFO" "所有订阅更新完成，共 $count 个"
}

#######################################
# 删除订阅
#######################################
remove_subscription() {
  local name="$1"
  local safe_name sub_dir

  [ -n "$name" ] || die "用法: $(basename "$0") remove <名称>"

  safe_name="$(sanitize_name "$name")"
  sub_dir="$OUTBOUNDS_DIR/sub_$safe_name"

  [ -d "$sub_dir" ] || die "订阅不存在: $name"
  rm -rf "$sub_dir"
  log "INFO" "订阅已删除: $name"
}

#######################################
# 列出订阅
#######################################
list_subscriptions() {
  local sub_dir meta_file name updated node_count count=0

  echo "订阅列表:"
  for sub_dir in "$OUTBOUNDS_DIR"/sub_*; do
    [ -d "$sub_dir" ] || continue
    meta_file="$sub_dir/_meta.json"
    [ -f "$meta_file" ] || continue

    name="$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$meta_file" | sed 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
    updated="$(grep -o '"updated"[[:space:]]*:[[:space:]]*"[^"]*"' "$meta_file" | sed 's/.*"updated"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
    node_count="$(find "$sub_dir" -name "*.json" ! -name "_meta.json" | wc -l | tr -d ' ')"

    echo "  - ${name:-$(basename "$sub_dir")} ($node_count 个节点, 更新于 ${updated:-未知})"
    count=$((count + 1))
  done

  [ "$count" -gt 0 ] || echo "  暂无订阅"
}

#######################################
# 主入口
#######################################
main() {
  local command="${1:-}"
  shift 2> /dev/null || true

  case "$command" in
    parse)
      import_parse "${1:-}" "${2:-}"
      ;;
    file | import)
      import_file "${1:-}" "${2:-}"
      ;;
    sub)
      import_sub "${1:-}" "${2:-}"
      ;;
    add)
      add_subscription "${1:-}" "${2:-}"
      ;;
    update)
      update_subscription "${1:-}"
      ;;
    update-all)
      update_all_subscriptions
      ;;
    remove | rm)
      remove_subscription "${1:-}"
      ;;
    list)
      list_subscriptions
      ;;
    -h | --help | help | "")
      show_help
      ;;
    *)
      show_help
      exit 1
      ;;
  esac
}

main "$@"
