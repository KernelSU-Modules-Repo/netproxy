#!/system/bin/sh
# NetProxy 模块操作脚本
# 用于模块管理器中的操作按钮

readonly MODDIR="${0%/*}"
readonly SERVICE_SCRIPT="$MODDIR/scripts/core/service.sh"
readonly LOG_FILE="$MODDIR/logs/service.log"
readonly SING_BOX_BIN="$MODDIR/bin/sing-box"

. "$MODDIR/scripts/utils/log.sh"

#######################################
# 检查 sing-box 是否运行
#######################################
is_sing_box_running() {
  pidof -s "$SING_BOX_BIN" > /dev/null 2>&1
}

# 将输出交给模块管理器显示
exec 2>&1

echo "==================================="
echo "        NetProxy 模块操作         "
echo "==================================="

# 根据当前状态执行启动或停止
if is_sing_box_running; then
  log "INFO" "检测到 sing-box 正在运行，准备执行停止操作..."
  sh "$SERVICE_SCRIPT" stop
  echo "==================================="
  echo " 操作结果: NetProxy 服务已停止"
  echo "==================================="
else
  log "INFO" "检测到 sing-box 未运行，准备执行启动操作..."
  sh "$SERVICE_SCRIPT" start
  echo "==================================="
  echo " 操作结果: NetProxy 服务已启动"
  echo "==================================="
fi

# 短暂休眠以确保日志显示完整再退出
sleep 1
