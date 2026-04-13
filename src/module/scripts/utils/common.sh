#!/system/bin/sh
# 通用辅助函数

#######################################
# 写入标准日志
#######################################
log() {
  local level="INFO"
  local message="$1"

  if [ $# -ge 2 ]; then
    level="$1"
    message="$2"
  fi

  local timestamp log_content
  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  log_content="[$timestamp] [$level] $message"

  [ -n "${LOG_FILE:-}" ] && echo "$log_content" >> "$LOG_FILE"
  echo "$log_content" >&2
}

#######################################
# 记录错误并退出
#######################################
die() {
  log "ERROR" "$1"
  exit "${2:-1}"
}

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

  grep -m 1 -E '"tag"[[:space:]]*:' "$config_file" 2> /dev/null \
    | sed -n 's/.*"tag"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

#######################################
# 获取指定进程的 PID
#######################################
get_pid() {
  local bin="$1"
  [ -z "$bin" ] && return 1

  pidof -s "$bin" 2> /dev/null || pgrep -f "^$bin" 2> /dev/null | head -1 || true
}

#######################################
# 获取指定 PID 的运行时间
#######################################
get_process_uptime() {
  local pid="$1"
  [ -z "$pid" ] || [ ! -d "/proc/$pid" ] && { echo 0; return 1; }

  local start_time now_ticks
  start_time="$(awk '{print $22}' "/proc/$pid/stat" 2> /dev/null || echo 0)"
  now_ticks="$(awk '{print int($1 * 100)}' /proc/uptime 2> /dev/null || echo 0)"

  if [ "$start_time" -gt 0 ] && [ "$now_ticks" -gt 0 ]; then
    echo "$(( (now_ticks - start_time) / 100 ))"
  else
    echo 0
  fi
}
