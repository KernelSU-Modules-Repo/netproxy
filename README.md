
# NetProxy-Magisk

**NetProxy-Magisk** 是一款基于 **Xray 核心** 的 Android 系统级透明代理模块，通过 Magisk 在系统层面接管流量，支持全局代理、白名单模式、分应用代理等高级功能。

适用于需要系统级透明代理、跨应用统一代理控制的用户与开发者。

<div style="display: flex; justify-content: space-around;">
  <img src="/Screenshots/Screenshot1.png" width="30%" />
  <img src="/Screenshots/Screenshot2.png" width="30%" />
  <img src="/Screenshots/Screenshot3.png" width="30%" />
</div>

---

## ✨ 功能特性

* **WebUI管理界面**
  通过浏览器管理代理、启动或关闭等。

* **分应用控制**
  支持黑名单模式 / **白名单模式**
  可精确指定哪些应用走代理。

* **透明代理**
  自动配置 iptables，实现系统级 TCP 流量代理。

* **自动日志管理**
  输出 Xray 运行日志，便于定位问题。

---

## 🚀 安装

1. 下载 NetProxy-Magisk 最新版本 ZIP
2. 在 **Magisk Manager** 中安装
3. 重启设备即可开始使用

---

## 📢 官方 Telegram 群组

欢迎加入讨论、交流与反馈：

👉 **[https://t.me/NetProxy_Magisk](https://t.me/NetProxy_Magisk)**

---

## ⚙️ 默认配置文件路径

```
/data/adb/modules/netproxy/xraycore/config/default.json
```

你可以根据需要自定义 inbound/outbound，或使用导入工具生成你的配置。

---

## 📘 配置文件教程（推荐方式）

如果你使用 **V2RayNG**，可直接导出完整配置，然后将其中的 `inbounds` 替换为下方推荐的透明代理 inbound。

### **推荐的 inbounds 配置（适用于透明代理）**

```json
"inbounds": [
  {
    "port": 1080,
    "protocol": "dokodemo-door",
    "settings": {
      "network": "tcp,udp",
      "followRedirect": true
    },
    "sniffing": {
      "enabled": true,
      "destOverride": ["http", "tls", "fakedns"]
    }
  }
]
```

### 使用步骤

1. 在 V2RayNG 中导出 JSON 配置
2. 打开

   ```
   /data/adb/modules/netproxy/xrayCore/config/default.json
   ```
3. 将原有 `"inbounds"` 配置替换为上述推荐内容

即可与 NetProxy 的透明代理规则完全匹配。

---

## 📝 注意事项

* 需要 Magisk + Root 环境
* 部分设备的 iptables 行为存在差异，可能需手动调整规则

---

## 🤝 贡献

欢迎参与项目：

* 提交 Issue（错误反馈 / 功能建议）
* 提交 Pull Request（功能优化 / 新增特性）

---
