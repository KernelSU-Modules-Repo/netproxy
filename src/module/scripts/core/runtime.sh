#!/system/bin/sh
# sing-box 运行时配置辅助函数

CUR_OUTBOUND_CONFIG=""
CUR_OUTBOUND_DIR=""
CUR_OUTBOUND_MODE=""
CUR_SELECTOR_MODE=""
CUR_CURRENT_TAG=""

RUNTIME_OUTBOUNDS_FILE=""
RUNTIME_NODE_PATHS=""
RUNTIME_NODE_TAGS_JSON=""
RUNTIME_NODE_COUNT=0
RUNTIME_SKIPPED_COUNT=0

#######################################
# 初始化运行时上下文
#######################################
initialize_runtime_context() {
  require_file "${MODULE_CONF:-}" "模块配置文件不存在: ${MODULE_CONF:-未定义}"
  require_dir "${SINGBOX_DIR:-}" "sing-box 配置目录不存在: ${SINGBOX_DIR:-未定义}"
  require_dir "${CONFDIR:-}" "通用配置目录不存在: ${CONFDIR:-未定义}"
  require_dir "${RUNTIME_DIR:-}" "运行时目录不存在: ${RUNTIME_DIR:-未定义}"

  CUR_OUTBOUND_CONFIG="$(read_conf "$MODULE_CONF" "CURRENT_CONFIG" "")"
  CUR_OUTBOUND_MODE="$(read_conf "$MODULE_CONF" "OUTBOUND_MODE" "rule")"
  CUR_SELECTOR_MODE="$(read_conf "$MODULE_CONF" "SELECTOR_MODE" "urltest")"

  [ -n "$CUR_OUTBOUND_CONFIG" ] || die "CURRENT_CONFIG 未定义，请先选择节点"
  require_file "$CUR_OUTBOUND_CONFIG" "当前节点配置文件不存在: $CUR_OUTBOUND_CONFIG"

  CUR_OUTBOUND_DIR="${CUR_OUTBOUND_CONFIG%/*}"
  [ "$CUR_OUTBOUND_DIR" != "$CUR_OUTBOUND_CONFIG" ] || die "无法解析当前节点目录: $CUR_OUTBOUND_CONFIG"
  require_dir "$CUR_OUTBOUND_DIR" "当前节点目录不存在: $CUR_OUTBOUND_DIR"

  CUR_CURRENT_TAG="$(detect_outbound_tag "$CUR_OUTBOUND_CONFIG" || true)"
  [ -n "$CUR_CURRENT_TAG" ] || die "无法读取当前节点标签: $CUR_OUTBOUND_CONFIG"

  RUNTIME_OUTBOUNDS_FILE="$RUNTIME_DIR/outbounds.json"
}

#######################################
# 清空运行时节点缓存
#######################################
reset_runtime_nodes() {
  RUNTIME_NODE_PATHS=""
  RUNTIME_NODE_TAGS_JSON=""
  RUNTIME_NODE_COUNT=0
  RUNTIME_SKIPPED_COUNT=0
}

#######################################
# 追加运行时节点缓存
#######################################
append_runtime_node() {
  local file="$1"
  local tag="$2"
  local escaped_tag

  if [ -n "$RUNTIME_NODE_PATHS" ]; then
    RUNTIME_NODE_PATHS="${RUNTIME_NODE_PATHS}
$file"
  else
    RUNTIME_NODE_PATHS="$file"
  fi

  if ! is_reserved_outbound_tag "$tag"; then
    escaped_tag="$(json_escape "$tag")"
    if [ -n "$RUNTIME_NODE_TAGS_JSON" ]; then
      RUNTIME_NODE_TAGS_JSON="$RUNTIME_NODE_TAGS_JSON, \"$escaped_tag\""
    else
      RUNTIME_NODE_TAGS_JSON="\"$escaped_tag\""
    fi
  fi

  RUNTIME_NODE_COUNT=$((RUNTIME_NODE_COUNT + 1))
}

#######################################
# 扫描当前节点目录
#######################################
scan_runtime_nodes() {
  local current_dir="${1:-$CUR_OUTBOUND_DIR}"
  local file tag

  require_dir "$current_dir" "节点目录不存在: $current_dir"
  reset_runtime_nodes

  for file in "$current_dir"/*.json; do
    is_node_config_file "$file" || continue
    tag="$(detect_outbound_tag "$file" || true)"

    if [ -z "$tag" ]; then
      RUNTIME_SKIPPED_COUNT=$((RUNTIME_SKIPPED_COUNT + 1))
      continue
    fi

    append_runtime_node "$file" "$tag"
  done
}

#######################################
# 生成运行时出站配置
#######################################
write_runtime_outbounds() {
  local current_config="${1:-$CUR_OUTBOUND_CONFIG}"
  local selector_mode="${2:-$CUR_SELECTOR_MODE}"
  local tags="$RUNTIME_NODE_TAGS_JSON"

  [ -n "$current_config" ] || die "当前节点配置未初始化"
  [ -n "$selector_mode" ] || selector_mode="urltest"

  if [ "$RUNTIME_NODE_COUNT" -eq 0 ] && [ -z "$RUNTIME_NODE_PATHS" ]; then
    scan_runtime_nodes "$CUR_OUTBOUND_DIR"
    tags="$RUNTIME_NODE_TAGS_JSON"
  fi

  if [ -z "$tags" ] && ! is_reserved_outbound_tag "$CUR_CURRENT_TAG"; then
    tags="\"$(json_escape "$CUR_CURRENT_TAG")\""
  fi

  [ -n "$tags" ] || die "当前节点目录没有可用的出站标签: $CUR_OUTBOUND_DIR"

  case "$selector_mode" in
    urltest | auto | 动态测速)
      cat > "$RUNTIME_OUTBOUNDS_FILE" << EOF
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
      cat > "$RUNTIME_OUTBOUNDS_FILE" << EOF
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
      "default": "$(json_escape "$CUR_CURRENT_TAG")",
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

  printf "%s\n" "$RUNTIME_OUTBOUNDS_FILE"
}
