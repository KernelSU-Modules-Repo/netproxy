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

# 运行时上下文（由 initialize_runtime_context 填充）
CUR_OUTBOUND_CONFIG=""
CUR_OUTBOUND_DIR=""
CUR_OUTBOUND_MODE=""
CUR_SELECTOR_MODE=""

# 节点扫描结果（由 write_runtime_outbounds 填充）
SCAN_NODE_ARGS=""
SCAN_NODE_COUNT=0
SCAN_SKIPPED_COUNT=0

#######################################
# 初始化启动环境与基础配置
#######################################
initialize_runtime_context() {
  # 基础环境检查
  [ -x "${SING_BOX_BIN:-}" ] || die "sing-box 二进制不存在或不可执行"
  [ -f "${MODULE_CONF:-}" ] || die "模块配置文件不存在"
  [ -f "${TPROXY_CONF_DIR:-}/tproxy.conf" ] || die "透明代理配置文件不存在"

  # 加载模块与透明代理配置
  . "$MODULE_CONF"
  . "$TPROXY_CONF_DIR/tproxy.conf"

  # 提取并验证当前节点路径
  CUR_OUTBOUND_CONFIG="$(strip_quotes "${CURRENT_CONFIG:-}")"
  [ -n "$CUR_OUTBOUND_CONFIG" ] || die "CURRENT_CONFIG 未定义，请先选择节点"
  [ -f "$CUR_OUTBOUND_CONFIG" ] || die "指定的节点配置文件不存在: $CUR_OUTBOUND_CONFIG"

  # 确定运行模式与选择器模式
  CUR_OUTBOUND_MODE="${OUTBOUND_MODE:-rule}"
  CUR_SELECTOR_MODE="${SELECTOR_MODE:-urltest}"
  
  # 获取当前节点目录
  CUR_OUTBOUND_DIR="$(get_current_outbounds_dir "$CUR_OUTBOUND_CONFIG")" || return 1
}

#######################################
# 扫描节点并生成运行时出站配置
#######################################
write_runtime_outbounds() {
  local output="${RUNTIME_DIR:?RUNTIME_DIR 未定义}/outbounds.json"
  local current_config="${1:-$CUR_OUTBOUND_CONFIG}"
  local current_dir="${CUR_OUTBOUND_DIR:-$(get_current_outbounds_dir "$current_config")}"
  local selector_mode="${2:-$CUR_SELECTOR_MODE}"
  local current_tag current_tag_json tags="" f tag

  SCAN_NODE_ARGS=""
  SCAN_NODE_COUNT=0
  SCAN_SKIPPED_COUNT=0

  current_tag="$(detect_outbound_tag "$current_config")"
  [ -n "$current_tag" ] || die "无法从当前出站配置读取标签: $current_config"
  current_tag_json="$(json_escape "$current_tag")"

  mkdir -p "$RUNTIME_DIR" || die "无法创建运行时配置目录: $RUNTIME_DIR"

  log "INFO" "正在扫描节点目录: $current_dir"

  # 扫描当前节点目录
  for f in "$current_dir"/*.json; do
    is_node_config_file "$f" || continue
    tag="$(detect_outbound_tag "$f")"
    
    if [ -z "$tag" ]; then
      SCAN_SKIPPED_COUNT=$((SCAN_SKIPPED_COUNT + 1))
      continue
    fi

    # 收集启动参数（所有节点都加载）
    SCAN_NODE_ARGS="$SCAN_NODE_ARGS -c \"$f\""
    SCAN_NODE_COUNT=$((SCAN_NODE_COUNT + 1))

    # 收集可切换标签（过滤掉 default 以防止抢占测速组）
    if [ "$tag" != "default" ]; then
      tags="$(append_selector_tag "$tags" "$tag")"
    fi
  done

  # 未发现可切换节点时，至少保留当前节点供测速/选择
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
