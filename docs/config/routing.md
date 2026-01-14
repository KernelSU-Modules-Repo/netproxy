# 路由规则

路由规则决定流量走向，配置文件为 `/data/adb/modules/netproxy/config/routing_rules.json`。

## 规则结构

```json
{
    "name": "规则名称",
    "type": "field",
    "domain": "",
    "ip": "",
    "port": "",
    "protocol": "",
    "network": "",
    "inboundTag": "",
    "outboundTag": "direct/proxy/block",
    "enabled": true
}
```

| 字段 | 说明 |
|------|------|
| `name` | 规则名称（显示用） |
| `domain` | 域名匹配（逗号分隔） |
| `ip` | IP 匹配（逗号分隔） |
| `port` | 端口匹配 |
| `network` | 网络类型（tcp/udp） |
| `outboundTag` | 出站标签 |
| `enabled` | 是否启用 |

---

## 内置规则

| 规则 | 出站 | 说明 |
|------|------|------|
| DNS 劫持 | dns-out | 劫持 53 端口 |
| 秋风广告规则 | block | 拦截广告域名 |
| 阻断 UDP 443 | block | 阻断 QUIC |
| Google 走代理 | proxy | geosite:google |
| 绕过局域网 IP | direct | geoip:private |
| 绕过局域网域名 | direct | geosite:private |
| 绕过国内 DNS | direct | 国内 DNS 服务器 |
| 绕过中国 IP | direct | geoip:cn |
| 绕过中国域名 | direct | geosite:cn |
| 最终代理 | proxy | 其他流量 |

---

## 匹配顺序

规则按列表顺序从上到下匹配，**第一条匹配的规则生效**。

---

## 管理规则

### 通过 WebUI

1. 进入 **设置** 页面
2. 找到 **路由规则** 区域
3. 启用/禁用或拖拽排序

### GeoIP/GeoSite

支持的内置规则集：

- `geoip:cn` - 中国 IP
- `geoip:private` - 私有地址
- `geosite:cn` - 中国网站
- `geosite:google` - Google 相关
- `geosite:private` - 私有域名

---

## 示例

### 指定域名走代理

```json
{
    "name": "GitHub 代理",
    "type": "field",
    "domain": "github.com,githubusercontent.com",
    "outboundTag": "proxy",
    "enabled": true
}
```

### 指定 IP 直连

```json
{
    "name": "公司网络",
    "type": "field",
    "ip": "10.0.0.0/8",
    "outboundTag": "direct",
    "enabled": true
}
```
