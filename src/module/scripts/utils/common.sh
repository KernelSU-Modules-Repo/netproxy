#!/system/bin/sh
# 通用辅助工具函数

#######################################
# 检测 busybox 路径
#######################################
detect_busybox() {
  for path in "/data/adb/ksu/bin/busybox" "/data/adb/ap/bin/busybox" "/data/adb/magisk/busybox"; do
    if [ -f "$path" ]; then
      echo "$path"
      return 0
    fi
  done
  echo "busybox"
}

#######################################
# 去除配置值中的双引号
#######################################
strip_quotes() {
  echo "${1//\"/}"
}

#######################################
# 从出站配置中读取标签
#######################################
detect_outbound_tag() {
  local config_file="$1"
  [ -f "$config_file" ] || return 1
  # 读取第一个出站标签
  grep -m 1 -E '"tag"[[:space:]]*:' "$config_file" 2> /dev/null \
    | sed 's/.*"tag"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
}
