# 模块配置

## 配置文件位置

模块配置文件位于 `/data/adb/modules/netproxy/config/` 目录下：

```
config/
├── module.conf          # 模块主配置
├── tproxy.conf          # TProxy 透明代理配置
├── routing_rules.json   # 路由规则配置
└── xray/                # Xray 配置目录
    ├── confdir/         # Xray 模块化配置
    └── outbounds/       # 节点配置
```

---

## module.conf

模块主配置文件，控制基本行为。

```bash
# NetProxy 模块设置

# 开机自动启动服务 (1=启用, 0=禁用)
AUTO_START=1

# 出站模式 (rule=规则分流, global=全局代理, direct=全局直连)
OUTBOUND_MODE=rule

# OnePlus Android 16 修复 (1=启用, 0=禁用)
ONEPLUS_A16_FIX=0

# 当前使用的配置文件路径
CURRENT_CONFIG="/data/adb/modules/netproxy/config/xray/outbounds/default.json"
```

| 配置项 | 说明 | 可选值 |
|--------|------|--------|
| `AUTO_START` | 开机自启 | `1` / `0` |
| `OUTBOUND_MODE` | 出站模式 | `rule` / `global` / `direct` |
| `ONEPLUS_A16_FIX` | 一加 A16 修复 | `1` / `0` |
| `CURRENT_CONFIG` | 当前节点配置路径 | 文件路径 |

---

## tproxy.conf

TProxy 透明代理详细配置。

### 代理核心配置

```bash
# 代理进程运行用户和组
CORE_USER_GROUP="root:net_admin"

# 透明代理监听端口
PROXY_TCP_PORT="12345"
PROXY_UDP_PORT="12345"

# 代理模式: 0=自动检测, 1=强制TPROXY, 2=强制REDIRECT
PROXY_MODE=0
```

### DNS 配置

```bash
# DNS 劫持方式 (0: 禁用, 1: tproxy, 2: redirect)
DNS_HIJACK_ENABLE=1

# DNS 监听端口
DNS_PORT="1053"
```

### 网络接口

```bash
# 移动数据接口
MOBILE_INTERFACE="rmnet_data+"

# WiFi 接口
WIFI_INTERFACE="wlan0"

# 热点接口
HOTSPOT_INTERFACE="wlan2"

# USB 共享接口
USB_INTERFACE="rndis+"
```

### 代理开关

```bash
PROXY_MOBILE=1    # 代理移动数据
PROXY_WIFI=1      # 代理 WiFi
PROXY_HOTSPOT=0   # 代理热点
PROXY_USB=0       # 代理 USB 共享
PROXY_TCP=1       # 代理 TCP
PROXY_UDP=1       # 代理 UDP
PROXY_IPV6=0      # 代理 IPv6
```

### 分应用代理

```bash
# 启用分应用代理 (0: 禁用, 1: 启用)
APP_PROXY_ENABLE=1

# 代理应用列表 (空格分隔)
PROXY_APPS_LIST=""

# 绕过应用列表 (空格分隔)
BYPASS_APPS_LIST=""

# 分应用模式
APP_PROXY_MODE="blacklist"  # blacklist 或 whitelist
```

### 中国 IP 绕过

```bash
BYPASS_CN_IP=0
CN_IP_FILE=""
CN_IPV6_FILE=""
CN_IP_URL="https://raw.githubusercontent.com/Hackl0us/GeoIP2-CN/release/CN-ip-cidr.txt"
```

---

## 修改配置

### 通过 WebUI

大部分配置可通过 WebUI 的 **设置** 页面修改。
