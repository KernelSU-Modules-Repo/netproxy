# tproxy.conf

`tproxy.conf` 是 NetProxy 的透明代理主配置，位于：

```text
/data/adb/modules/netproxy/config/tproxy/tproxy.conf
```

它负责决定哪些流量进入代理、如何打标、哪些接口参与代理，以及分应用代理、Geo-IP、QUIC、日志等行为。

## 当前默认项

### 监听端口

- `PROXY_TCP_PORT=1536`
- `PROXY_UDP_PORT=1536`
- `DNS_PORT=1536`

### 代理模式

- `PROXY_MODE=0`

含义：

- `0`：自动检测 TPROXY，不支持时回退 REDIRECT
- `1`：强制 TPROXY
- `2`：强制 REDIRECT

### 协议与接口

常见默认开关：

- `PROXY_MOBILE=1`
- `PROXY_WIFI=1`
- `PROXY_HOTSPOT=0`
- `PROXY_USB=0`
- `PROXY_TCP=1`
- `PROXY_UDP=1`
- `PROXY_IPV6=0`

### 分应用代理

- `APP_PROXY_ENABLE=1`
- `APP_PROXY_MODE="blacklist"`

辅助字段：

- `PROXY_APPS_LIST`
- `BYPASS_APPS_LIST`

### Geo-IP 与额外控制

- `BYPASS_CN_IP=0`
- `BLOCK_QUIC=1`
- `PERFORMANCE_MODE=0`
- `FORCE_MARK_BYPASS=0`

### 日志

- `LOG_TIMESTAMP=0`

默认关闭透明代理脚本日志时间戳，便于减少额外日志开销。

## 还有哪些字段值得知道

### 路由标记和表

- `MARK_VALUE=20`
- `MARK_VALUE6=25`
- `TABLE_ID=2025`

这部分用于策略路由和透明代理链标记。

### 核心运行身份

- `CORE_USER_GROUP="root:net_admin"`

### DNS 劫持

- `DNS_HIJACK_ENABLE=1`

用于决定是否接管 DNS 流量。

## 适合通过谁来改

推荐优先级：

1. Android 管理器
2. CLI
3. 手动编辑 `tproxy.conf`

如果你手动修改了大量底层项，建议随后执行一次服务重启或透明代理重载。
