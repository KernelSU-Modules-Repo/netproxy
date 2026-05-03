# 路由与 DNS

NetProxy 的分流行为由三层共同决定：

1. `OUTBOUND_MODE`
2. sing-box 路由规则与规则集
3. 透明代理层的 IP / 接口 / 分应用代理过滤

## 出站模式

### `rule`

默认模式。
由 sing-box 的路由规则决定哪些流量直连、哪些流量代理、哪些流量拦截或交给特定出站。

### `global`

尽量全局走代理，适合测试节点或快速确认是否为规则问题。

### `direct`

全局直连，常用于临时停用代理但保留模块与规则结构。

## 规则集位置

```text
/data/adb/modules/netproxy/config/singbox/source/
```

这里存放规则集和相关资源，`rule` 模式下会被 sing-box 路由配置引用。

## 与透明代理层的关系

透明代理层先决定“哪些流量会进入代理链”，sing-box 再决定“进入后的流量如何分流”。

典型例子：

- `APP_PROXY_ENABLE` 控制是否启用分应用代理
- `BYPASS_CN_IP` 控制是否在透明代理层直接绕过中国大陆 IP
- `PROXY_IPv4_LIST / PROXY_IPv6_LIST` 可强制指定流量进入代理
- `BYPASS_IPv4_LIST / BYPASS_IPv6_LIST` 可强制绕过

## DNS 相关

`tproxy.conf` 中的：

- `DNS_HIJACK_ENABLE`
- `DNS_PORT`

决定透明代理层是否接管 DNS 流量；而 sing-box 侧的 DNS 行为由 `confdir/` 中的通用配置控制。

如果出现域名能解析但分流异常，请同时检查：

1. 当前 `OUTBOUND_MODE`
2. `source/` 中的规则集是否正确
3. DNS 劫持开关与端口
4. 当前节点和代理组是否正常
