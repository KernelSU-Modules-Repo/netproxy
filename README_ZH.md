<p align="center">
  <img src="image/logo.png" alt="NetProxy Logo" width="120" />
</p>

<h1 align="center">NetProxy</h1>

<p align="center">
  <strong>Android 系统级 sing-box 透明代理模块</strong><br>
  支持 Android 管理器、TPROXY / REDIRECT、TCP / UDP、Clash API、zashboard、分应用代理、订阅管理
</p>

<p align="center">
  <a href="https://github.com/Fanju6/NetProxy-Magisk/releases">
    <img src="https://img.shields.io/github/v/release/Fanju6/NetProxy-Magisk?style=flat-square&label=Release&color=blue" alt="Latest Release" />
  </a>
  <a href="https://github.com/Fanju6/NetProxy-Magisk/releases">
    <img src="https://img.shields.io/github/downloads/Fanju6/NetProxy-Magisk/total?style=flat-square&color=green" alt="Downloads" />
  </a>
  <img src="https://img.shields.io/badge/sing--box-Core-blueviolet?style=flat-square" alt="sing-box Core" />
</p>

<p align="center">
  中文 | <a href="README.md">English</a>
</p>

---

## 功能特性

| 功能 | 说明 |
|------|------|
| **APP管理** | Miuix 现代化界面，支持莫奈取色 |
| **Clash API / zashboard** | 默认启用 Clash API，内置 zashboard 面板 |
| **透明代理** | 支持 TPROXY / REDIRECT，覆盖 TCP、UDP 与 DNS 劫持 |
| **分应用代理** | 黑名单 / 白名单模式，精准控制代理范围 |
| **路由设置** | 自定义域名、IP、端口等路由规则 |
| **DNS 设置** | 自定义 DNS 服务器和静态 Hosts 映射 |
| **节点与订阅** | 支持单链接、文件、订阅三种导入方式，统一转换为 sing-box 配置 |
| **热点共享** | 支持代理 WiFi 热点和 USB 共享的流量 |
| **热切换配置** | 无需重启即可切换节点 |
| **内核兼容** | 集成 IPSET LKM |

---

## 界面预览

<div align="center">
  <img src="image/Screenshot.jpg" width="60%" alt="界面预览" />
</div>

---

## 界面与控制入口


1. **Android 管理器**
2. **CLI**
3. **Clash API + zashboard**

其中 Android 管理器为独立维护的原生应用，提供仪表盘、节点、订阅、分应用代理、日志与模块配置等图形化管理能力。可通过 Google Play 安装：[`NetProxy`](https://play.google.com/store/apps/details?id=com.fanjv.netproxy)

当前不提供公开源码仓库。

默认控制入口：

- Controller: `http://<设备IP>:9999`
- UI: `http://<设备IP>:9999/ui`
- Secret: `singbox`

---

## 安装

1. 从 [Releases](https://github.com/Fanju6/NetProxy-Magisk/releases) 下载最新 ZIP
2. 在 **Magisk / KernelSU / APatch** 中刷入模块
3. 重启设备
4. 通过 Android 管理器、CLI 或 zashboard 完成后续配置

---

## 目录结构

```text
/data/adb/modules/netproxy/
├─ bin/
│  ├─ sing-box                 # sing-box 内核
│  ├─ proxylink                # 节点 / 订阅转换工具
│  ├─ ipset                    # ipset 工具
│  ├─ IPSET-LKM/               # 集成 IPSET 内核驱动
│  └─ zashboard/               # 内置控制面板
├─ config/
│  ├─ module.conf              # 模块配置
│  ├─ tproxy/
│  │  └─ tproxy.conf           # 透明代理配置
│  └─ singbox/
│     ├─ confdir/              # 通用 sing-box 配置
│     ├─ outbounds/            # 节点目录
│     │  ├─ default/
│     │  └─ sub_xxx/
│     ├─ runtime/              # 运行时生成配置
│     └─ source/               # 路由规则与规则集
├─ logs/
│  ├─ service.log
│  ├─ sing-box.log
│  └─ subscription.log
├─ scripts/
│  ├─ cli
│  ├─ core/
│  ├─ network/
│  └─ utils/
├─ post-fs-data.sh
└─ service.sh
```

---

## 快速开始

### 1. 查看状态

```sh
su -c /data/adb/modules/netproxy/scripts/cli service status
```

### 2. 启动 / 停止服务

```sh
su -c /data/adb/modules/netproxy/scripts/cli service start
su -c /data/adb/modules/netproxy/scripts/cli service stop
su -c /data/adb/modules/netproxy/scripts/cli service restart
```

### 3. 导入节点

单个链接：

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node add "vless://..."'
```

导入文件：

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node import /sdcard/clash.yaml'
```

添加订阅：

```sh
su -c '/data/adb/modules/netproxy/scripts/cli sub add 我的订阅 https://example.com/sub'
su -c '/data/adb/modules/netproxy/scripts/cli sub update-all'
```

### 4. 切换节点

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node list'
su -c '/data/adb/modules/netproxy/scripts/cli node use 节点名称'
```

### 5. 切换模式

```sh
su -c '/data/adb/modules/netproxy/scripts/cli mode'
su -c '/data/adb/modules/netproxy/scripts/cli mode rule'
su -c '/data/adb/modules/netproxy/scripts/cli mode global'
su -c '/data/adb/modules/netproxy/scripts/cli mode direct'
```

### 6. 查看面板地址

```sh
su -c /data/adb/modules/netproxy/scripts/cli api ui
```

---

## CLI 概览

```text
cli service {status|start|stop|restart|logs}
cli node {list|current|use|add|import|export|show|remove|delay}
cli mode [rule|global|direct]
cli sub {list|add|update|update-all|remove}
cli api {groups|conns|close|close-all|ui}
cli app {list|mode|add|remove|enable|disable}
cli tproxy {status|reload|quic|cnip}
```

完整帮助：

```sh
su -c /data/adb/modules/netproxy/scripts/cli help
```

---

## 默认配置说明

`module.conf` 默认项：

- `AUTO_START=1`
- `OUTBOUND_MODE=rule`
- `SELECTOR_MODE=urltest`
- `GMS_FIX=0`
- `CURRENT_CONFIG=/data/adb/modules/netproxy/config/singbox/outbounds/default/default.json`

`tproxy.conf` 默认项中较常用的部分：

- `PROXY_TCP_PORT=1536`
- `PROXY_UDP_PORT=1536`
- `DNS_PORT=1536`
- `PROXY_MODE=0`
- `BLOCK_QUIC=1`
- `BYPASS_CN_IP=0`
- `LOG_TIMESTAMP=0`

其中：

- `PROXY_MODE=0` 表示自动检测 TPROXY，不支持时回退为 REDIRECT
- `LOG_TIMESTAMP=0` 表示默认关闭透明代理脚本日志时间戳

---

## 兼容性说明

- 支持 **Magisk / KernelSU / APatch**
- 透明代理脚本保留 TPROXY 自动检测与 REDIRECT 回退能力
- 模块内集成 IPSET LKM，用于增强部分设备与内核版本下的兼容性
- 已包含针对部分 OnePlus / ColorOS 等环境的兼容性修复逻辑

---

## 交流

<p align="center">
  <a href="https://t.me/NetProxy_Magisk">
    <img src="https://img.shields.io/badge/Telegram-加入群组-blue?style=for-the-badge&logo=telegram" alt="Telegram Group" />
  </a>
</p>

---

## 贡献

欢迎参与项目：

- 提交 Issue 反馈问题
- 提出功能建议
- 提交 Pull Request
- Star 支持项目

---

## 鸣谢

本项目离不开以下开源项目：

| 项目 | 说明 |
|------|------|
| [sing-box](https://github.com/SagerNet/sing-box) | 当前核心代理引擎 |
| [Proxylink](https://github.com/Fanju6/Proxylink) | 节点链接、订阅与配置转换 |
| [AndroidTProxyShell](https://github.com/CHIZI-0618/AndroidTProxyShell) | Android 透明代理实现参考 |
| [IPSET_LKM](https://github.com/TanakaLun/IPSET_LKM) | IPSET 内核模块与兼容性支持参考 |
| [zashboard](https://github.com/Zephyruso/zashboard) | Clash API 前端面板 |
| [v2rayNG](https://github.com/2dust/v2rayNG) | 部分节点解析逻辑参考 |

---

## 许可证

[GPL-3.0 License](LICENSE)

## Star

[![Star History Chart](https://api.star-history.com/svg?repos=Fanju6/NetProxy-Magisk&type=date&legend=top-left)](https://www.star-history.com/#Fanju6/NetProxy-Magisk&type=date&legend=top-left)
