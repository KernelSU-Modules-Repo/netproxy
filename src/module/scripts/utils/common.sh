#!/system/bin/sh
# 通用辅助函数

#######################################
# 写入标准日志
#######################################
log() {
  local level="INFO"
  local message="$1"
  local timestamp log_content

  if [ $# -ge 2 ]; then
    level="$1"
    message="$2"
  fi

  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  log_content="[$timestamp] [$level] $message"

  [ -n "${LOG_FILE:-}" ] && printf "%s\n" "$log_content" >> "$LOG_FILE"
  [ "${LOG_STDERR:-1}" = "0" ] || printf "%s\n" "$log_content" >&2
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
  local path

  for path in "/data/adb/ksu/bin/busybox" "/data/adb/ap/bin/busybox" "/data/adb/magisk/busybox"; do
    if [ -x "$path" ]; then
      printf "%s\n" "$path"
      return 0
    fi
  done

  printf "%s\n" "busybox"
}

#######################################
# 判断命令是否存在
#######################################
command_exists() {
  command -v "$1" > /dev/null 2>&1
}

#######################################
# 检查文件是否存在
#######################################
require_file() {
  local file="$1"
  local message="${2:-文件不存在: $file}"

  [ -f "$file" ] || die "$message"
}

#######################################
# 检查目录是否存在
#######################################
require_dir() {
  local dir="$1"
  local message="${2:-目录不存在: $dir}"

  [ -d "$dir" ] || die "$message"
}

#######################################
# 创建目录
#######################################
ensure_dir() {
  local dir="$1"
  local message="${2:-无法创建目录: $dir}"

  [ -d "$dir" ] || mkdir -p "$dir" || die "$message"
}

#######################################
# 转义 JSON 字符串
#######################################
json_escape() {
  printf "%s" "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

#######################################
# 获取指定进程的 PID
#######################################
get_pid() {
  local bin="$1"

  [ -n "$bin" ] || return 1
  pidof -s "$bin" 2> /dev/null || pgrep -f "^$bin" 2> /dev/null | head -1 || true
}

#######################################
# 获取指定 PID 的运行时间
#######################################
get_process_uptime() {
  local pid="$1"
  local start_time now_ticks

  [ -n "$pid" ] || { printf "0\n"; return 1; }
  [ -d "/proc/$pid" ] || { printf "0\n"; return 1; }

  start_time="$(awk '{print $22}' "/proc/$pid/stat" 2> /dev/null || echo 0)"
  now_ticks="$(awk '{print int($1 * 100)}' /proc/uptime 2> /dev/null || echo 0)"

  if [ "$start_time" -gt 0 ] && [ "$now_ticks" -gt 0 ]; then
    printf "%s\n" "$(( (now_ticks - start_time) / 100 ))"
  else
    printf "0\n"
  fi
}

#######################################
# 检测设备主要 IPv4 地址
#######################################
detect_primary_ipv4() {
  ip route get 1.1.1.1 2> /dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1
}
