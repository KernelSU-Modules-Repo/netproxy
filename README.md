<p align="center">
  <img src="image/logo.png" alt="NetProxy Logo" width="120" />
</p>

<h1 align="center">NetProxy</h1>

<p align="center">
  <strong>Android System-Level sing-box Transparent Proxy Module</strong><br>
  Supports Android Manager, TPROXY / REDIRECT, TCP / UDP, Clash API, zashboard, per-app proxy, and subscription management
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
  <a href="README_ZH.md">中文</a> | English
</p>

---

## Features

| Feature | Description |
|------|------|
| **Android Manager** | Native Android app with a modern interface for module management |
| **Clash API / zashboard** | Clash API enabled by default with built-in zashboard |
| **Transparent Proxy** | Supports TPROXY / REDIRECT with TCP, UDP, and DNS hijacking |
| **Per-App Proxy** | Blacklist / whitelist modes for precise app-level control |
| **Routing Rules** | Custom domain, IP, port, and traffic routing rules |
| **DNS Settings** | Configurable DNS behavior and related proxy DNS options |
| **Nodes & Subscriptions** | Import from links, files, and subscriptions, then convert to sing-box configs |
| **Hotspot Sharing** | Proxy Wi-Fi hotspot and USB tethering traffic |
| **Hot Switching** | Switch nodes without a full module reinstall |
| **Kernel Compatibility** | Integrated IPSET LKM for wider kernel compatibility |

---

## Screenshots

<div align="center">
  <img src="image/Screenshot.jpg" width="60%" alt="Interface Preview" />
</div>

---

## Interface & Control Entry Points

The old built-in module WebUI has been removed. NetProxy is now managed through:

1. **Android Manager**
2. **CLI**
3. **Clash API + zashboard**

The Android Manager is a separately maintained native Android application that provides dashboard, nodes, subscriptions, per-app proxy, logs, and module configuration management. Install it from Google Play: [`NetProxy`](https://play.google.com/store/apps/details?id=com.fanjv.netproxy)

There is no public source repository for the manager app.

Default control endpoints:

- Controller: `http://<device-ip>:9999`
- UI: `http://<device-ip>:9999/ui`
- Secret: `singbox`

---

## Installation

1. Download the latest ZIP from [Releases](https://github.com/Fanju6/NetProxy-Magisk/releases)
2. Flash the module in **Magisk / KernelSU / APatch**
3. Reboot your device
4. Finish configuration through Android Manager, CLI, or zashboard

---

## Directory Structure

```text
/data/adb/modules/netproxy/
├─ bin/
│  ├─ sing-box                 # sing-box core
│  ├─ proxylink                # node / subscription conversion tool
│  ├─ ipset                    # ipset binary
│  ├─ IPSET-LKM/               # integrated IPSET kernel modules
│  └─ zashboard/               # built-in control panel
├─ config/
│  ├─ module.conf              # module configuration
│  ├─ tproxy/
│  │  └─ tproxy.conf           # transparent proxy configuration
│  └─ singbox/
│     ├─ confdir/              # common sing-box configuration
│     ├─ outbounds/            # node directories
│     │  ├─ default/
│     │  └─ sub_xxx/
│     ├─ runtime/              # runtime-generated configuration
│     └─ source/               # routing rules and rule sets
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

## Quick Start

### 1. Check status

```sh
su -c /data/adb/modules/netproxy/scripts/cli service status
```

### 2. Start / stop the service

```sh
su -c /data/adb/modules/netproxy/scripts/cli service start
su -c /data/adb/modules/netproxy/scripts/cli service stop
su -c /data/adb/modules/netproxy/scripts/cli service restart
```

### 3. Import nodes

Single link:

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node add "vless://..."'
```

Import from file:

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node import /sdcard/clash.yaml'
```

Add and update subscriptions:

```sh
su -c '/data/adb/modules/netproxy/scripts/cli sub add MySub https://example.com/sub'
su -c '/data/adb/modules/netproxy/scripts/cli sub update-all'
```

### 4. Switch nodes

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node list'
su -c '/data/adb/modules/netproxy/scripts/cli node use NodeName'
```

### 5. Switch mode

```sh
su -c '/data/adb/modules/netproxy/scripts/cli mode'
su -c '/data/adb/modules/netproxy/scripts/cli mode rule'
su -c '/data/adb/modules/netproxy/scripts/cli mode global'
su -c '/data/adb/modules/netproxy/scripts/cli mode direct'
```

### 6. Show panel endpoints

```sh
su -c /data/adb/modules/netproxy/scripts/cli api ui
```

---

## CLI Overview

```text
cli service {status|start|stop|restart|logs}
cli node {list|current|use|add|import|export|show|remove|delay}
cli mode [rule|global|direct]
cli sub {list|add|update|update-all|remove}
cli api {groups|conns|close|close-all|ui}
cli app {list|mode|add|remove|enable|disable}
cli tproxy {status|reload|quic|cnip}
```

Full help:

```sh
su -c /data/adb/modules/netproxy/scripts/cli help
```

---

## Default Configuration Notes

Default values in `module.conf`:

- `AUTO_START=1`
- `OUTBOUND_MODE=rule`
- `SELECTOR_MODE=urltest`
- `GMS_FIX=0`
- `CURRENT_CONFIG=/data/adb/modules/netproxy/config/singbox/outbounds/default/default.json`

Common defaults in `tproxy.conf`:

- `PROXY_TCP_PORT=1536`
- `PROXY_UDP_PORT=1536`
- `DNS_PORT=1536`
- `PROXY_MODE=0`
- `BLOCK_QUIC=1`
- `BYPASS_CN_IP=0`
- `LOG_TIMESTAMP=0`

Notes:

- `PROXY_MODE=0` means auto-detect TPROXY and fall back to REDIRECT when unavailable
- `LOG_TIMESTAMP=0` disables timestamp output in transparent proxy script logs by default

---

## Compatibility

- Supports **Magisk / KernelSU / APatch**
- Transparent proxy scripts retain automatic TPROXY detection with REDIRECT fallback
- Integrated IPSET LKM improves compatibility across more devices and kernel versions
- Includes compatibility handling for some OnePlus / ColorOS environments

---

## Community

<p align="center">
  <a href="https://t.me/NetProxy_Magisk">
    <img src="https://img.shields.io/badge/Telegram-Join%20Group-blue?style=for-the-badge&logo=telegram" alt="Telegram Group" />
  </a>
</p>

---

## Contributing

Contributions are welcome:

- Submit Issues to report problems
- Suggest new features
- Submit Pull Requests
- Star the project to support it

---

## Acknowledgments

This project builds on the following open-source projects:

| Project | Description |
|------|------|
| [sing-box](https://github.com/SagerNet/sing-box) | Current core proxy engine |
| [Proxylink](https://github.com/Fanju6/Proxylink) | Node links, subscriptions, and config conversion |
| [AndroidTProxyShell](https://github.com/CHIZI-0618/AndroidTProxyShell) | Reference for Android transparent proxy implementation |
| [IPSET_LKM](https://github.com/TanakaLun/IPSET_LKM) | Reference for IPSET kernel modules and compatibility support |
| [zashboard](https://github.com/Zephyruso/zashboard) | Frontend panel for Clash API |
| [v2rayNG](https://github.com/2dust/v2rayNG) | Reference for parts of node parsing logic |

---

## License

[GPL-3.0 License](LICENSE)

## Star

[![Star History Chart](https://api.star-history.com/svg?repos=Fanju6/NetProxy-Magisk&type=date&legend=top-left)](https://www.star-history.com/#Fanju6/NetProxy-Magisk&type=date&legend=top-left)
