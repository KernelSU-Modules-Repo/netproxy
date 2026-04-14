#!/system/bin/sh
# sing-box 运行时配置辅助函数

#######################################
# 获取当前节点所在目录
#######################################
get_current_outbounds_dir() {
  local current_config="$1"
  local current_dir

  current_dir="${current_config%/*}"
  [ "$current_dir" != "$current_config" ] || die "无法解析当前节点目录: $current_config"
  [ -d "$current_dir" ] || die "当前节点目录不存在: $current_dir"

  echo "$current_dir"
}

#######################################
# 判断是否为节点配置文件
#######################################
is_node_config_file() {
  local file="$1"

  [ -f "$file" ] || return 1
  [ "${file##*/}" != "_meta.json" ] || return 1
}

#######################################
# 转义 JSON 字符串
#######################################
json_escape() {
  printf "%s" "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

#######################################
# 追加出站标签到 JSON 数组片段
#######################################
append_selector_tag() {
  local tags="$1"
  local tag="$2"
  local escaped

  escaped="$(json_escape "$tag")"
  if [ -n "$tags" ]; then
    printf "%s, \"%s\"" "$tags" "$escaped"
  else
    printf "\"%s\"" "$escaped"
  fi
}

#######################################
# 写入运行时出站配置
#######################################
write_runtime_outbounds() {
  local current_config="$1"
  local selector_mode="${2:-urltest}"
  local output="$RUNTIME_DIR/outbounds.json"
  local current_dir current_tag current_tag_json tags="" f tag

  current_dir="$(get_current_outbounds_dir "$current_config")"
  current_tag="$(detect_outbound_tag "$current_config")"
  [ -n "$current_tag" ] || die "无法从当前出站配置读取标签: $current_config"
  current_tag_json="$(json_escape "$current_tag")"

  mkdir -p "$RUNTIME_DIR" || die "无法创建运行时配置目录: $RUNTIME_DIR"

  # 扫描当前节点目录，收集可切换的出站标签
  for f in "$current_dir"/*.json; do
    is_node_config_file "$f" || continue
    tag="$(detect_outbound_tag "$f")"
    [ -n "$tag" ] && [ "$tag" != "default" ] || continue
    tags="$(append_selector_tag "$tags" "$tag")"
  done

  # 未发现节点时，至少保留当前节点
  [ -n "$tags" ] || tags="$(append_selector_tag "" "$current_tag")"

  case "$selector_mode" in
    urltest | auto | 动态测速)
      cat > "$output" << EOF
{
  "outbounds": [
    {
      "tag": "direct",
      "type": "direct"
    },
    {
      "tag": "block",
      "type": "block"
    },
    {
      "tag": "Proxy",
      "type": "selector",
      "outbounds": [
        "Auto-Fastest",
        "direct",
        $tags
      ],
      "default": "Auto-Fastest",
      "interrupt_exist_connections": true
    },
    {
      "tag": "Auto-Fastest",
      "type": "urltest",
      "outbounds": [
        $tags
      ],
      "url": "https://www.gstatic.com/generate_204",
      "interval": "3m",
      "tolerance": 50
    }
  ]
}
EOF
      ;;
    manual | selector | 手动选择 | 手动)
      cat > "$output" << EOF
{
  "outbounds": [
    {
      "tag": "direct",
      "type": "direct"
    },
    {
      "tag": "block",
      "type": "block"
    },
    {
      "tag": "Proxy",
      "type": "selector",
      "outbounds": [
        "direct",
        $tags
      ],
      "default": "$current_tag_json",
      "interrupt_exist_connections": true
    }
  ]
}
EOF
      ;;
    *)
      die "未知节点选择模式: $selector_mode"
      ;;
  esac

  echo "$output"
}
