# 项目介绍

NetProxy 是一个基于 Xray-core 的 Android 透明代理模块，支持 Magisk 和 KernelSU。

## 特性

- **透明代理**：基于 TProxy 实现
- **WebUI 管理**：美观的 Web 界面，支持节点、订阅、规则管理
- **多协议支持**：VLESS、VMess、Trojan、Shadowsocks、Hysteria2 等
- **规则分流**：支持 GeoIP、GeoSite 规则，可自定义路由策略
- **分应用代理**：可设置黑白名单，按需代理指定应用

## 系统要求

- Android 8.0+
- Root (Magisk 24.0+ 或 KernelSU)
- 约 30MB 存储空间

## 项目结构

```
/data/adb/modules/netproxy/
├── bin/                     # 二进制文件
│   ├── xray                 # Xray 核心
│   ├── proxylink            # 节点链接解析工具
│   ├── geoip.dat            # GeoIP 数据库
│   └── geosite.dat          # GeoSite 数据库
├── config/                  # 配置文件
│   ├── module.conf          # 模块主配置
│   ├── tproxy.conf          # TProxy 配置
│   ├── routing_rules.json   # 路由规则
│   └── xray/                # Xray 配置目录
│       ├── confdir/         # 模块化配置
│       └── outbounds/       # 节点配置
├── scripts/                 # 脚本文件
│   ├── cli                  # 命令行工具
│   ├── core/                # 核心服务脚本
│   ├── config/              # 配置管理脚本
│   ├── network/             # 网络脚本
│   └── utils/               # 工具脚本
├── webroot/                 # WebUI 静态文件
├── logs/                    # 日志目录
│   ├── service.log          # 服务日志
│   ├── xray.log             # Xray 日志
│   └── tproxy.log           # TProxy 日志
├── service.sh               # 服务入口脚本
├── action.sh                # KernelSU Action 脚本
└── module.prop              # 模块信息
```

## 开源协议

本项目基于 [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) 协议开源。
