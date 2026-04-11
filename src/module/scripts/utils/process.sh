#!/system/bin/sh
# 进程管理通用工具函数

#######################################
# 获取指定进程的 PID
# 参数: 1 - 二进制完整路径或名称
#######################################
get_pid() {
  local bin="$1"
  [ -z "$bin" ] && return 1
  pidof -s "$bin" 2> /dev/null || pgrep -f "^$bin" 2> /dev/null | head -1 || true
}

#######################################
# 获取指定 PID 的进程运行时间 (秒)
# 参数: 1 - PID
#######################################
get_process_uptime() {
  local pid="$1"
  [ -z "$pid" ] || [ ! -d "/proc/$pid" ] && { echo 0; return 1; }

  local uptime_ticks start_time now_ticks
  start_time="$(awk '{print $22}' "/proc/$pid/stat" 2> /dev/null || echo 0)"
  now_ticks="$(awk '{print int($1 * 100)}' /proc/uptime 2> /dev/null || echo 0)"
  
  if [ "$start_time" -gt 0 ] && [ "$now_ticks" -gt 0 ]; then
    echo "$(( (now_ticks - start_time) / 100 ))"
  else
    echo 0
  fi
}
