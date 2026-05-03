# 透明代理与分应用代理

NetProxy 的透明代理层由 `tproxy.sh` 与 `tproxy.conf` 驱动，目标是在尽量少打扰用户的前提下，把需要代理的流量送进 sing-box。

## 两种代理方式

### TPROXY

- 能力更完整
- 更适合 TCP / UDP / DNS 全量接管
- 是首选方案

### REDIRECT

- 用于不支持 TPROXY 的环境回退
- 适合作为兼容模式

默认情况下：

```text
PROXY_MODE=0
```

含义是自动检测 TPROXY，并在不支持时回退到 REDIRECT。

## 默认端口

当前默认端口都为 `1536`：

- `PROXY_TCP_PORT=1536`
- `PROXY_UDP_PORT=1536`
- `DNS_PORT=1536`

如果你修改了这些端口，透明代理与 sing-box 运行时配置都必须保持一致。

## 分应用代理

当前分应用代理由 `tproxy.conf` 控制，核心项有：

- `APP_PROXY_ENABLE`
- `APP_PROXY_MODE`
- `PROXY_APPS_LIST`
- `BYPASS_APPS_LIST`

模式说明：

- `blacklist`：默认代理，列表中的应用绕过
- `whitelist`：默认不代理，列表中的应用走代理

## 接口与协议开关

常见开关包括：

- `PROXY_MOBILE`
- `PROXY_WIFI`
- `PROXY_HOTSPOT`
- `PROXY_USB`
- `PROXY_TCP`
- `PROXY_UDP`
- `PROXY_IPV6`

这部分决定哪些接口和协议会进入透明代理链。

## 常用增强项

### `BLOCK_QUIC`

- 默认值：`1`
- 作用：拦截 QUIC（UDP 443）

### `BYPASS_CN_IP`

- 默认值：`0`
- 作用：是否绕过中国大陆 IP 段

### `LOG_TIMESTAMP`

- 默认值：`0`
- 作用：是否给透明代理脚本日志附加时间戳

### `GMS_FIX`

位于 `module.conf`，主要用于部分设备上的 Google Play / GMS 联网兼容性修复。

## 什么时候优先看这部分

如果你遇到下面这些问题，优先检查透明代理层：

- 某些应用不走代理
- Wi-Fi 与移动网络表现不一致
- 热点共享代理异常
- 某些 UDP / DNS 请求行为异常
- 只有部分浏览器或系统组件访问异常
