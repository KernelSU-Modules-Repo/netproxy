<p align="center">
  <img src="image/logo.png" alt="NetProxy Logo" width="120" />
</p>

<h1 align="center">NetProxy</h1>

<p align="center">
  <strong>Android 系统级 Xray 透明代理模块</strong><br>
  支持 TPROXY、UDP、IPv6、分应用代理、订阅管理
</p>

<p align="center">
  <a href="https://github.com/Fanju6/NetProxy-Magisk/releases">
    <img src="https://img.shields.io/github/v/release/Fanju6/NetProxy-Magisk?style=flat-square&label=Release&color=blue" alt="Latest Release" />
  </a>
  <a href="https://github.com/Fanju6/NetProxy-Magisk/releases">
    <img src="https://img.shields.io/github/downloads/Fanju6/NetProxy-Magisk/total?style=flat-square&color=green" alt="Downloads" />
  </a>
  <img src="https://img.shields.io/badge/Xray-Core-blueviolet?style=flat-square" alt="Xray Core" />
</p>

<p align="center">
  中文 | <a href="README_EN.md">English</a>
</p>

---

## 功能特性

| 功能 | 描述 |
|------|------|
| **WebUI 管理** | Material Design 3 现代化界面，支持莫奈取色 |
| **透明代理** | 支持 TPROXY / REDIRECT 两种模式，TCP + UDP 全接管 |
| **分应用代理** | 黑名单 / 白名单模式，精准控制代理范围 |
| **路由设置** | 自定义域名、IP、端口等路由规则 |
| **DNS 设置** | 自定义 DNS 服务器和静态 Hosts 映射 |
| **订阅管理** | 在线添加、更新订阅，自动解析节点 |
| **热点共享** | 支持代理 WiFi 热点和 USB 共享的流量 |
| **热切换配置** | 无需重启即可切换节点 |

---

## 界面预览

<div align="center">
  <img src="image/Screenshot1.jpg" width="24%" alt="状态页面" />
  <img src="image/Screenshot2.jpg" width="24%" alt="节点管理" />
  <img src="image/Screenshot3.jpg" width="24%" alt="应用控制" />
  <img src="image/Screenshot4.jpg" width="24%" alt="设置页面" />
</div>

---

## 安装

1. 从 [Releases](https://github.com/Fanju6/NetProxy-Magisk/releases) 下载最新版 ZIP
2. 在 **Magisk / KernelSU / APatch** 中刷入模块
3. 重启设备
4. 打开模块管理器的 WebUI 进行配置

---

## 目录结构

```
/data/adb/modules/netproxy/
├── bin/                      # Xray 二进制文件
├── config/
│   ├── xray/
│   │   ├── confdir/          # Xray 核心配置
│   │   │   ├── routing/      # 路由分流配置
│   │   │   │   ├── internal/ # 内部系统配置
│   │   │   │   ├── direct.json
│   │   │   │   ├── global.json
│   │   │   │   ├── rule.json
│   │   │   │   └── routing_rules.json
│   │   │   ├── 00_log.json
│   │   │   ├── 01_api.json
│   │   │   ├── 02_dns.json
│   │   │   ├── 03_inbounds.json
│   │   │   ├── 04_outbounds.json
│   │   │   └── 05_policy.json
│   │   └── outbounds/        # 出站节点分组目录
│   │       ├── default/      # 默认节点分组
│   │       └── sub_xxx/      # 订阅分组目录
│   ├── tproxy/
│   │   └── tproxy.conf       # 透明代理配置
│   └── module.conf           # 模块设置（开机自启等）
├── logs/                     # 运行日志
├── scripts/                  # 启动、停止、订阅等脚本
├── webroot/                  # WebUI 静态资源
└── service.sh                # 模块启动入口
```

---

## 快速开始

### 方式一：节点链接导入（推荐）

在 WebUI 配置页面点击 **添加 → 添加节点**，直接粘贴节点链接：

```
vless://... 或 vmess://... 或 trojan://... 等
```

### 方式二：订阅导入

点击 **添加 → 添加订阅**，输入订阅名称和地址，自动解析全部节点。

### 方式三：手动配置

 在 `outbounds/default` 目录创建 JSON 配置文件，格式示例：

```json
{
  "outbounds": [
    {
      "tag": "proxy",
      "protocol": "vless",
      "settings": { ... }
    }
  ]
}
```



## 交流群组

<p align="center">
  <a href="https://t.me/NetProxy_Magisk">
    <img src="https://img.shields.io/badge/Telegram-加入群组-blue?style=for-the-badge&logo=telegram" alt="Telegram Group" />
  </a>
</p>

---

## 贡献

欢迎参与项目！

- 提交 Issue 反馈 BUG
- 提出功能建议
- 提交 Pull Request
- Star 支持项目！

---

## 鸣谢

本项目的开发离不开以下优秀的开源项目：

| 项目 | 说明 |
|------|------|
| [Xray-core](https://github.com/XTLS/Xray-core) | 核心代理引擎，支持 VLESS、XTLS、REALITY 等先进协议 |
| [v2rayNG](https://github.com/2dust/v2rayNG) | 节点链接解析逻辑参考 |
| [AndroidTProxyShell](https://github.com/CHIZI-0618/AndroidTProxyShell) | Android TProxy 透明代理实现参考 |
| [KsuWebUIStandalone](https://github.com/KOWX712/KsuWebUIStandalone) | WebUI 独立运行方案参考 |
| [Proxylink](https://github.com/Fanju6/Proxylink) | 代理链接解析器，用于订阅解析和配置生成 |

---

## 许可证

[GPL-3.0 License](LICENSE)


## Star

[![Star History Chart](https://api.star-history.com/svg?repos=Fanju6/NetProxy-Magisk&type=date&legend=top-left)](https://www.star-history.com/#Fanju6/NetProxy-Magisk&type=date&legend=top-left)
