#!/system/bin/sh
# IPSET 驱动加载脚本

set -u

readonly MODDIR="$(cd "$(dirname "$0")/../.." && pwd)"
readonly LOG_FILE="$MODDIR/logs/service.log"
readonly NETFILTER_DIR="/data/adb/netfilter"
readonly KO_LOADER="$MODDIR/bin/IPSET-LKM/ko-loader"

. "$MODDIR/scripts/utils/common.sh"

#######################################
# 加载内核驱动
#######################################
load_drivers() {
  local module

  if [ ! -d "$NETFILTER_DIR" ]; then
    log "INFO" "未检测到集成的 IPSET 驱动目录，跳过加载"
    return 0
  fi

  if [ -d /sys/module/ip_set ]; then
    log "INFO" "内核已内置或已加载 IPSET 模块"
    return 0
  fi

  [ -x "$KO_LOADER" ] || chmod 0755 "$KO_LOADER"

  log "INFO" "开始加载集成 IPSET 内核驱动..."
  cd "$NETFILTER_DIR" || die "无法进入驱动目录: $NETFILTER_DIR"

  load_module() {
    "$KO_LOADER" "$@"
  }

  [ -f "iptables/ip6table_nat.ko" ] && load_module "iptables/ip6table_nat.ko"
  [ -f "ip_set.ko" ] && load_module "ip_set.ko"
  [ -f "ipset/ip_set.ko" ] && load_module "ipset/ip_set.ko"

  for module in bitmap_ip bitmap_ipmac bitmap_port; do
    [ -f "ipset/ip_set_$module.ko" ] && load_module "ipset/ip_set_$module.ko"
  done

  for module in ip ipmac ipmark ipport ipportip ipportnet mac net netiface netnet netport netportnet; do
    [ -f "ipset/ip_set_hash_$module.ko" ] && load_module "ipset/ip_set_hash_$module.ko"
  done

  [ -f "ipset/ip_set_list_set.ko" ] && load_module "ipset/ip_set_list_set.ko"
  [ -f "xt_set.ko" ] && load_module "xt_set.ko"
  [ -f "xt_addrtype.ko" ] && load_module "xt_addrtype.ko"

  log "INFO" "IPSET 驱动加载流程执行完成"
}

#######################################
# 显示帮助
#######################################
show_usage() {
  cat << EOF
用法: $(basename "$0") load

命令:
  load      加载集成的 IPSET 驱动
EOF
}

#######################################
# 主入口
#######################################
main() {
  case "${1:-}" in
    load)
      load_drivers
      ;;
    -h | --help | help)
      show_usage
      ;;
    *)
      show_usage
      exit 1
      ;;
  esac
}

main "$@"
