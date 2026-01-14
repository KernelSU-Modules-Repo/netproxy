# Xray 配置

NetProxy 使用 Xray-core 作为代理核心，配置文件采用模块化设计。

## 配置目录

```
/data/adb/modules/netproxy/config/xray/
├── confdir/               # 模块化配置（按顺序加载）
│   ├── 00_log.json        # 日志配置
│   ├── 01_inbounds.json   # 入站配置
│   ├── 02_dns.json        # DNS 配置
│   ├── 03_routing.json    # 路由配置
│   ├── 04_policy.json     # 策略配置
│   ├── 05_api.json        # API 配置
│   └── 06_outbounds.json  # 出站配置
└── outbounds/             # 节点配置目录
    ├── default.json       # 默认节点
    └── sub_订阅名/        # 订阅节点目录
        ├── _meta.json     # 订阅元信息
        └── 节点.json
```

## 配置加载

Xray 启动时按文件名顺序加载 `confdir/` 下的所有 JSON 文件并合并。

---

## 核心配置说明

### DNS 配置 (02_dns.json)

```json
{
    "dns": {
        "hosts": {
            "dns.alidns.com": ["223.5.5.5", "223.6.6.6"],
            "cloudflare-dns.com": ["104.16.249.249", "104.16.248.249"]
        },
        "servers": [
            {
                "address": "https://dns.alidns.com/dns-query",
                "domains": ["geosite:cn"],
                "skipFallback": true
            },
            {
                "address": "https://cloudflare-dns.com/dns-query",
                "domains": ["geosite:google"],
                "skipFallback": true
            },
            "https://cloudflare-dns.com/dns-query"
        ]
    }
}
```

**说明**：
- `hosts`: 静态 DNS 映射，避免 DNS 污染
- `servers`: DNS 服务器列表，按域名分流

### 入站配置 (01_inbounds.json)

定义 TProxy 监听端口和 DNS 入站。

### 路由配置 (03_routing.json)

由 `routing_rules.json` 自动生成，建议通过 WebUI 管理。

---

## 自定义配置

如需添加自定义配置：

1. 在 `confdir/` 创建新的 JSON 文件
2. 使用数字前缀控制加载顺序（如 `07_custom.json`）
3. 重启服务生效

::: warning 注意
`01_inbounds.json` 和 `06_outbounds.json` 由模块自动管理，不建议手动修改。
:::
