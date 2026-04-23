#!/system/bin/sh
# Clash API 辅助函数

#######################################
# 读取控制器地址
#######################################
api_controller() {
  printf "%s" "${CLASH_API:-127.0.0.1:9999}"
}

#######################################
# 读取控制器密钥
#######################################
api_secret() {
  printf "%s" "${CLASH_SECRET:-singbox}"
}

#######################################
# 读取主选择器名称
#######################################
api_selector_group() {
  printf "%s" "${SELECTOR_GROUP:-Proxy}"
}

#######################################
# 读取测速地址
#######################################
api_delay_url() {
  printf "%s" "${DELAY_URL:-https://www.gstatic.com/generate_204}"
}

#######################################
# 简单 URL 编码
#######################################
url_encode_simple() {
  printf "%s" "$1" | sed 's/%/%25/g; s/ /%20/g; s/#/%23/g; s/?/%3F/g; s/&/%26/g; s/\//%2F/g; s/+/%2B/g'
}

#######################################
# 提取 JSON 字符串字段
#######################################
json_get_string() {
  local text="$1"
  local key="$2"

  printf "%s" "$text" | tr ',{}' '\n' | grep -m 1 "\"$key\"" | sed -n 's/.*"'"$key"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

#######################################
# 发起 Clash API 请求
#######################################
api_request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local controller secret

  command_exists curl || return 1

  controller="$(api_controller)"
  secret="$(api_secret)"

  if [ -n "$data" ]; then
    curl -fsS --connect-timeout 3 --max-time 10 \
      -X "$method" \
      -H "Authorization: Bearer $secret" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "http://$controller$path"
  else
    curl -fsS --connect-timeout 3 --max-time 10 \
      -X "$method" \
      -H "Authorization: Bearer $secret" \
      "http://$controller$path"
  fi
}

#######################################
# 判断控制接口是否可用
#######################################
api_is_available() {
  api_request GET "/configs" > /dev/null 2>&1
}

#######################################
# 等待控制接口就绪
#######################################
api_wait_available() {
  local retries="${1:-5}"
  local delay="${2:-1}"
  local i=0

  while [ "$i" -lt "$retries" ]; do
    api_is_available && return 0
    sleep "$delay"
    i=$((i + 1))
  done

  return 1
}

#######################################
# 模块模式转 Clash 模式
#######################################
module_mode_to_clash_mode() {
  case "$1" in
    rule) printf "%s" "Rule" ;;
    global) printf "%s" "Global" ;;
    direct) printf "%s" "Direct" ;;
    *) return 1 ;;
  esac
}

#######################################
# 读取当前运行模式
#######################################
api_get_mode() {
  local result

  result="$(api_request GET "/configs" 2> /dev/null)" || return 1
  json_get_string "$result" "mode"
}

#######################################
# 设置当前运行模式
#######################################
api_set_mode() {
  local mode="$1"
  local clash_mode payload

  clash_mode="$(module_mode_to_clash_mode "$mode")" || return 1
  payload="{\"mode\":\"$(json_escape "$clash_mode")\"}"

  api_request PATCH "/configs" "$payload" > /dev/null 2>&1
}

#######################################
# 读取代理组数据
#######################################
api_get_proxies() {
  api_request GET "/proxies"
}

#######################################
# 提取代理组原始片段
#######################################
api_selector_block() {
  local text="$1"
  local group="${2:-$(api_selector_group)}"
  local compact

  compact="$(printf "%s" "$text" | tr -d '\n')"
  printf "%s" "$compact" | sed -n 's/.*"'"$group"'":{\([^}]*\)}.*/\1/p'
}

#######################################
# 读取代理组当前节点
#######################################
api_selector_current() {
  local text="$1"
  local group="${2:-$(api_selector_group)}"
  local block

  block="$(api_selector_block "$text" "$group")"
  [ -n "$block" ] || return 1
  printf "%s" "$block" | sed -n 's/.*"now":"\([^"]*\)".*/\1/p'
}

#######################################
# 列出代理组可选节点
#######################################
api_selector_options() {
  local text="$1"
  local group="${2:-$(api_selector_group)}"
  local block list

  block="$(api_selector_block "$text" "$group")"
  [ -n "$block" ] || return 1

  list="$(printf "%s" "$block" | sed -n 's/.*"all":\[\([^]]*\)\].*/\1/p')"
  [ -n "$list" ] || return 1

  printf "%s" "$list" | sed 's/^"//; s/"$//; s/","/\n/g'
}

#######################################
# 判断代理组是否包含指定节点
#######################################
api_selector_has_option() {
  local tag="$1"
  local group="${2:-$(api_selector_group)}"
  local json options

  json="$(api_get_proxies 2> /dev/null)" || return 1
  options="$(api_selector_options "$json" "$group")" || return 1
  printf "%s\n" "$options" | grep -Fx -- "$tag" > /dev/null 2>&1
}

#######################################
# 通过控制接口切换节点
#######################################
api_select_proxy() {
  local tag="$1"
  local group="${2:-$(api_selector_group)}"
  local payload

  payload="{\"name\":\"$(json_escape "$tag")\"}"
  api_request PUT "/proxies/$(url_encode_simple "$group")" "$payload" > /dev/null 2>&1
}

#######################################
# 测试节点延迟
#######################################
api_test_delay() {
  local tag="$1"
  local url="${2:-$(api_delay_url)}"
  local timeout="${3:-5000}"

  api_request GET "/proxies/$(url_encode_simple "$tag")/delay?timeout=$timeout&url=$(url_encode_simple "$url")"
}

#######################################
# 获取连接信息
#######################################
api_get_connections() {
  api_request GET "/connections"
}

#######################################
# 关闭指定连接
#######################################
api_close_connection() {
  local connection_id="$1"

  api_request DELETE "/connections/$(url_encode_simple "$connection_id")" > /dev/null 2>&1
}

#######################################
# 关闭全部连接
#######################################
api_close_all_connections() {
  api_request DELETE "/connections" > /dev/null 2>&1
}
