#!/system/bin/sh
# IPSET 内核驱动加载

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
NETFILTER_DIR="/data/adb/netfilter"
. "$MODDIR/scripts/utils/common.sh"

load_drivers() {
  # 检查驱动目录是否存在
  if [ ! -d "$NETFILTER_DIR" ]; then
    log "INFO" "未检测到集成的 IPSET 驱动，跳过加载"
    return 0
  fi

  # 检查内核是否已经加载了 ip_set
  if [ -d /sys/module/ip_set ]; then
    log "INFO" "内核已内置或已加载 IPSET 模块"
    return 0
  fi

  log "INFO" "加载集成 IPSET 内核驱动..."
  cd "$NETFILTER_DIR" || return 1

  # 加载器定义
  local loader="$MODDIR/bin/IPSET-LKM/ko-loader"
  [ -x "$loader" ] || chmod 0755 "$loader"

  i() { "$loader" "$@"; }

  # 1. 基础网络模块
  [ -f "iptables/ip6table_nat.ko" ] && i iptables/ip6table_nat.ko
  [ -f "ip_set.ko" ] && i ip_set.ko
  [ -f "ipset/ip_set.ko" ] && i ipset/ip_set.ko

  # 2. 算法模块
  for m in bitmap_ip bitmap_ipmac bitmap_port; do
    [ -f "ipset/ip_set_$m.ko" ] && i "ipset/ip_set_$m.ko"
  done

  for m in ip ipmac ipmark ipport ipportip ipportnet mac net netiface netnet netport netportnet; do
    [ -f "ipset/ip_set_hash_$m.ko" ] && i "ipset/ip_set_hash_$m.ko"
  done

  [ -f "ipset/ip_set_list_set.ko" ] && i "ipset/ip_set_list_set.ko"

  # 3. 扩展匹配模块
  [ -f "xt_set.ko" ] && i xt_set.ko
  [ -f "xt_addrtype.ko" ] && i xt_addrtype.ko

  log "INFO" "驱动加载流程执行完毕"
}

case "$1" in
  load) load_drivers ;;
  *) echo "用法: $0 load" ;;
esac
