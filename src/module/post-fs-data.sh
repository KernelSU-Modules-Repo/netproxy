#!/system/bin/sh
set -e

readonly MODDIR="${0%/*}"
readonly MODULE_CONF="$MODDIR/config/module.conf"
readonly LOG_FILE="$MODDIR/logs/service.log"

. "$MODDIR/scripts/utils/common.sh"

log "INFO" "post-fs-data阶段"

sh "$MODDIR/scripts/utils/ipset.sh" load
