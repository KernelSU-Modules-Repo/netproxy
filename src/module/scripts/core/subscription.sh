#!/system/bin/sh
# sing-box 节点与订阅管理脚本

set -e
set -u

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly OUTBOUNDS_DIR="$MODDIR/config/singbox/outbounds"
readonly DEFAULT_DIR="$OUTBOUNDS_DIR/default"
readonly PROXYLINK_BIN="$MODDIR/bin/proxylink"
readonly LOG_FILE="$MODDIR/logs/subscription.log"

. "$MODDIR/scripts/utils/common.sh"
. "$MODDIR/scripts/utils/nodes.sh"

#######################################
# 显示帮助
#######################################
show_help() {
  cat << EOF
用法: $(basename "$0") <命令> [参数]

节点导入:
  parse <节点链接> [目录]        单个链接转 sing-box 节点
  file <文件> [目录]            文件节点或 Clash YAML 转 sing-box 节点
  sub <订阅链接> [目录]         订阅转 sing-box 节点，每个节点一个文件
  convert <节点文件>            sing-box 节点转链接

订阅管理:
  add <名称> <订阅链接>         添加订阅并导入节点
  update <名称>                 更新指定订阅
  update-all                    更新全部订阅
  remove <名称>                 删除订阅
  list                          列出订阅

示例:
  $(basename "$0") parse "vless://..."
  $(basename "$0") file "/sdcard/clash.yaml"
  $(basename "$0") sub "https://example.com/sub" "$OUTBOUNDS_DIR/sub_demo"
  $(basename "$0") convert "$OUTBOUNDS_DIR/default/default.json"
EOF
}

#######################################
# 检查 proxylink 环境
#######################################
check_proxylink() {
  require_file "$PROXYLINK_BIN" "proxylink 不存在: $PROXYLINK_BIN"
  [ -x "$PROXYLINK_BIN" ] || die "proxylink 不可执行: $PROXYLINK_BIN"
}

#######################################
# 准备输出目录
#######################################
prepare_output_dir() {
  local target_dir="${1:-$DEFAULT_DIR}"

  ensure_dir "$target_dir" "无法创建输出目录: $target_dir"
  printf "%s\n" "$target_dir"
}

#######################################
# 统一执行 proxylink
#######################################
run_proxylink() {
  local action="$1"
  local value="$2"
  local target_dir="${3:-}"

  check_proxylink

  case "$action" in
    parse)
      (
        cd "$target_dir" || exit 1
        "$PROXYLINK_BIN" -parse "$value" -insecure -format singbox -auto
      ) >> "$LOG_FILE" 2>&1
      ;;
    file)
      "$PROXYLINK_BIN" -file "$value" -insecure -format singbox -dir "$target_dir" >> "$LOG_FILE" 2>&1
      ;;
    sub)
      "$PROXYLINK_BIN" -sub "$value" -insecure -format singbox -dir "$target_dir" >> "$LOG_FILE" 2>&1
      ;;
    convert)
      "$PROXYLINK_BIN" -singbox "$value" -format uri
      ;;
    *)
      die "未知 proxylink 操作: $action"
      ;;
  esac
}

#######################################
# 单个链接转 sing-box
#######################################
import_parse() {
  local link="$1"
  local target_dir

  [ -n "$link" ] || die "用法: $(basename "$0") parse <节点链接> [目录]"
  target_dir="$(prepare_output_dir "${2:-}")"

  log "INFO" "开始导入单个节点: $target_dir"
  run_proxylink parse "$link" "$target_dir" || die "单个节点导入失败"
  log "INFO" "单个节点导入完成"
}

#######################################
# 文件节点转 sing-box
#######################################
import_file() {
  local file="$1"
  local target_dir

  [ -n "$file" ] || die "用法: $(basename "$0") file <文件> [目录]"
  require_file "$file" "文件不存在: $file"
  target_dir="$(prepare_output_dir "${2:-}")"

  log "INFO" "开始导入文件节点: $target_dir"
  run_proxylink file "$file" "$target_dir" || die "文件节点导入失败"
  log "INFO" "文件节点导入完成"
}

#######################################
# 订阅转 sing-box
#######################################
import_sub() {
  local url="$1"
  local target_dir

  [ -n "$url" ] || die "用法: $(basename "$0") sub <订阅链接> [目录]"
  target_dir="$(prepare_output_dir "${2:-}")"

  log "INFO" "开始导入订阅节点: $target_dir"
  run_proxylink sub "$url" "$target_dir" || die "订阅节点导入失败"
  log "INFO" "订阅节点导入完成"
}

#######################################
# sing-box 节点转链接
#######################################
export_link() {
  local file="$1"

  [ -n "$file" ] || die "用法: $(basename "$0") convert <节点文件>"
  require_file "$file" "节点文件不存在: $file"
  check_proxylink
  run_proxylink convert "$file"
}

#######################################
# 清理订阅目录中的节点
#######################################
clear_subscription_nodes() {
  local sub_dir="$1"
  local file

  for file in "$sub_dir"/*.json; do
    is_node_config_file "$file" || continue
    rm -f "$file"
  done
}

#######################################
# 刷新订阅目录
#######################################
refresh_subscription_dir() {
  local name="$1"
  local url="$2"
  local sub_dir="$3"

  clear_subscription_nodes "$sub_dir"
  import_sub "$url" "$sub_dir"
  write_subscription_meta "$sub_dir" "$name" "$url"
}

#######################################
# 添加订阅
#######################################
add_subscription() {
  local name="$1"
  local url="$2"
  local sub_dir

  [ -n "$name" ] || die "用法: $(basename "$0") add <名称> <订阅链接>"
  [ -n "$url" ] || die "用法: $(basename "$0") add <名称> <订阅链接>"

  sub_dir="$(subscription_dir_from_name "$OUTBOUNDS_DIR" "$name")"
  [ ! -d "$sub_dir" ] || die "订阅已存在: $name"

  ensure_dir "$sub_dir" "无法创建订阅目录: $sub_dir"
  refresh_subscription_dir "$name" "$url" "$sub_dir"
  log "INFO" "订阅添加完成: $name"
}

#######################################
# 更新订阅
#######################################
update_subscription() {
  local name="$1"
  local sub_dir meta_file url saved_name

  [ -n "$name" ] || die "用法: $(basename "$0") update <名称>"

  sub_dir="$(subscription_dir_from_name "$OUTBOUNDS_DIR" "$name")"
  meta_file="$sub_dir/_meta.json"

  require_file "$meta_file" "订阅不存在: $name"
  saved_name="$(read_subscription_meta_value "$meta_file" "name" || true)"
  url="$(read_subscription_meta_value "$meta_file" "url" || true)"

  [ -n "$url" ] || die "无法读取订阅链接: $meta_file"
  [ -n "$saved_name" ] || saved_name="$name"

  refresh_subscription_dir "$saved_name" "$url" "$sub_dir"
  log "INFO" "订阅更新完成: $saved_name"
}

#######################################
# 更新全部订阅
#######################################
update_all_subscriptions() {
  local sub_dir meta_file name url count=0

  for sub_dir in "$OUTBOUNDS_DIR"/sub_*; do
    [ -d "$sub_dir" ] || continue
    meta_file="$sub_dir/_meta.json"
    [ -f "$meta_file" ] || continue

    name="$(read_subscription_meta_value "$meta_file" "name" || true)"
    url="$(read_subscription_meta_value "$meta_file" "url" || true)"
    [ -n "$url" ] || continue
    [ -n "$name" ] || name="$(basename "$sub_dir")"

    refresh_subscription_dir "$name" "$url" "$sub_dir"
    count=$((count + 1))
  done

  log "INFO" "全部订阅更新完成，共 $count 个"
}

#######################################
# 删除订阅
#######################################
remove_subscription() {
  local name="$1"
  local sub_dir

  [ -n "$name" ] || die "用法: $(basename "$0") remove <名称>"

  sub_dir="$(subscription_dir_from_name "$OUTBOUNDS_DIR" "$name")"
  [ -d "$sub_dir" ] || die "订阅不存在: $name"

  rm -rf "$sub_dir"
  log "INFO" "订阅已删除: $name"
}

#######################################
# 列出订阅
#######################################
list_subscriptions() {
  local sub_dir meta_file name updated node_count file count=0

  printf "订阅列表:\n"

  for sub_dir in "$OUTBOUNDS_DIR"/sub_*; do
    [ -d "$sub_dir" ] || continue
    meta_file="$sub_dir/_meta.json"
    [ -f "$meta_file" ] || continue

    name="$(read_subscription_meta_value "$meta_file" "name" || true)"
    updated="$(read_subscription_meta_value "$meta_file" "updated" || true)"
    [ -n "$name" ] || name="$(basename "$sub_dir")"

    node_count=0
    for file in "$sub_dir"/*.json; do
      is_node_config_file "$file" || continue
      node_count=$((node_count + 1))
    done

    printf "  - %s (%s 个节点，更新于 %s)\n" "$name" "$node_count" "${updated:-未知}"
    count=$((count + 1))
  done

  [ "$count" -gt 0 ] || printf "  暂无订阅\n"
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
    convert)
      export_link "${1:-}"
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
