#!/system/bin/sh
# 节点与订阅辅助函数

readonly NODE_RECORD_DELIM="$(printf '\t')"
NODE_SCAN_VALID_COUNT=0
NODE_SCAN_SKIPPED_COUNT=0

#######################################
# 判断是否为节点配置文件
#######################################
is_node_config_file() {
  local file="$1"

  [ -f "$file" ] || return 1
  [ "${file##*/}" != "_meta.json" ] || return 1
}

#######################################
# 读取出站标签
#######################################
detect_outbound_tag() {
  local config_file="$1"

  [ -f "$config_file" ] || return 1
  grep -m 1 -E '"tag"[[:space:]]*:' "$config_file" 2> /dev/null | sed -n 's/.*"tag"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

#######################################
# 判断是否为选择器保留标签
#######################################
is_reserved_outbound_tag() {
  case "$1" in
    direct | block | Proxy | Auto-Fastest | default) return 0 ;;
    *) return 1 ;;
  esac
}

#######################################
# 清理订阅名称
#######################################
sanitize_subscription_name() {
  printf "%s" "$1" | sed 's/[\/\\:*?"<>| ]/_/g'
}

#######################################
# 获取订阅目录路径
#######################################
subscription_dir_from_name() {
  local outbounds_dir="$1"
  local name="$2"

  printf "%s/sub_%s\n" "$outbounds_dir" "$(sanitize_subscription_name "$name")"
}

#######################################
# 读取订阅元数据字段
#######################################
read_subscription_meta_value() {
  local meta_file="$1"
  local key="$2"

  [ -f "$meta_file" ] || return 1
  grep -o '"'$key'"[[:space:]]*:[[:space:]]*"[^"]*"' "$meta_file" 2> /dev/null | sed -n 's/.*"'"$key"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

#######################################
# 写入订阅元数据
#######################################
write_subscription_meta() {
  local target_dir="$1"
  local name="$2"
  local url="$3"

  cat > "$target_dir/_meta.json" << EOF
{
  "name": "$(json_escape "$name")",
  "url": "$(json_escape "$url")",
  "updated": "$(date -Iseconds)"
}
EOF
}

#######################################
# 获取订阅显示名称
#######################################
subscription_display_name() {
  local sub_dir="$1"
  local meta_file="$sub_dir/_meta.json"
  local name

  name="$(read_subscription_meta_value "$meta_file" "name" 2> /dev/null || true)"
  if [ -n "$name" ]; then
    printf "%s\n" "$name"
  else
    printf "%s\n" "$(basename "$sub_dir")"
  fi
}

#######################################
# 重置节点扫描计数
#######################################
reset_node_scan_counters() {
  NODE_SCAN_VALID_COUNT=0
  NODE_SCAN_SKIPPED_COUNT=0
}

#######################################
# 写入一条节点扫描记录
#######################################
append_node_record() {
  local output_file="$1"
  local file="$2"
  local tag="$3"
  local source="$4"
  local is_current="$5"

  printf "%s\t%s\t%s\t%s\t%s\n" "$file" "$(basename "$file")" "$tag" "$source" "$is_current" >> "$output_file"
}

#######################################
# 扫描单个目录中的节点
#######################################
scan_nodes_in_dir() {
  local dir="$1"
  local current_config="$2"
  local source="$3"
  local output_file="$4"
  local append_mode="${5:-0}"
  local file tag is_current

  if [ "$append_mode" != "1" ]; then
    : > "$output_file"
    reset_node_scan_counters
  fi

  for file in "$dir"/*.json; do
    is_node_config_file "$file" || continue
    tag="$(detect_outbound_tag "$file" || true)"

    if [ -z "$tag" ]; then
      NODE_SCAN_SKIPPED_COUNT=$((NODE_SCAN_SKIPPED_COUNT + 1))
      continue
    fi

    is_current=0
    [ "$file" = "$current_config" ] && is_current=1
    append_node_record "$output_file" "$file" "$tag" "$source" "$is_current"
    NODE_SCAN_VALID_COUNT=$((NODE_SCAN_VALID_COUNT + 1))
  done
}

#######################################
# 扫描全部节点
#######################################
scan_all_nodes() {
  local outbounds_dir="$1"
  local current_config="$2"
  local output_file="$3"
  local sub_dir source

  : > "$output_file"
  reset_node_scan_counters

  scan_nodes_in_dir "$outbounds_dir/default" "$current_config" "默认节点" "$output_file" 1

  for sub_dir in "$outbounds_dir"/sub_*; do
    [ -d "$sub_dir" ] || continue
    source="订阅: $(subscription_display_name "$sub_dir")"
    scan_nodes_in_dir "$sub_dir" "$current_config" "$source" "$output_file" 1
  done
}

#######################################
# 读取当前节点记录
#######################################
find_current_node_from_scan() {
  local scan_file="$1"
  local path name tag source is_current

  while IFS="$NODE_RECORD_DELIM" read -r path name tag source is_current; do
    [ "$is_current" = "1" ] || continue
    printf "%s\n" "$path"
    return 0
  done < "$scan_file"

  return 1
}

#######################################
# 解析节点
#######################################
resolve_node_from_scan() {
  local scan_file="$1"
  local query="$2"
  local match_count=0
  local first_match=""
  local path name tag source is_current base

  [ -n "$query" ] || die "请指定节点名称、标签或路径"

  if [ -f "$query" ]; then
    printf "%s\n" "$query"
    return 0
  fi

  while IFS="$NODE_RECORD_DELIM" read -r path name tag source is_current; do
    base="${name%.json}"

    if [ "$query" = "$path" ] || [ "$query" = "$name" ] || [ "$query" = "$base" ] || [ "$query" = "$tag" ]; then
      match_count=$((match_count + 1))
      [ "$match_count" -eq 1 ] && first_match="$path"
    fi
  done < "$scan_file"

  case "$match_count" in
    0)
      die "未找到节点: $query"
      ;;
    1)
      printf "%s\n" "$first_match"
      ;;
    *)
      die "找到多个同名节点，请使用更精确的文件名或完整路径"
      ;;
  esac
}
