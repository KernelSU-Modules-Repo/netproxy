<p align="center">
  <strong>系统级 Xray 透明代理模块（Android）</strong><br>
  接管 Android 系统流量，支持全局 / 分应用 / 白名单 / 透明代理等功能
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

---

## 📖 目录

* [✨ 功能特性](#-功能特性)
* [🖼 界面预览](#-界面预览)
* [🚀 安装](#-安装)
* [📢 Telegram 群组](#-telegram-群组)
* [📁 默认配置路径](#-默认配置路径)
* [📘 配置文件教程（推荐方式）](#-配置文件教程推荐方式)
* [📝 注意事项](#-注意事项)
* [🤝 贡献](#-贡献)

---

## ✨ 功能特性

| 功能               | 描述                                          |
| ---------------- | ------------------------------------------- |
| **WebUI 管理界面**   | 通过浏览器管理代理状态 —— 启动 / 停止 / 配置                 |
| **分应用控制**        | 支持白名单模式，可精准指定哪些 App 使用代理              |
| **透明代理** | 自动配置 iptables，实现系统级 TCP 流量代理，将所有数据包转发到 Xray |
| **日志输出**         | 模块日志，Xray 运行日志，方便调试与问题排查                    |

---

## 🖼 界面预览

<div style="display: flex; justify-content: space-around;">
  <img src="/Screenshots/Screenshot1.png" width="30%" alt="NetProxy UI 1" />
  <img src="/Screenshots/Screenshot2.png" width="30%" alt="NetProxy UI 2" />
  <img src="/Screenshots/Screenshot3.png" width="30%" alt="NetProxy UI 3" />
</div>

---

## 🚀 安装

1. 下载最新版本 ZIP（见 Releases）
2. 在 **Magisk Manager → 模块** 中安装 ZIP
3. 重启设备
4. 打开 WebUI 进行配置

---

## 📢 Telegram 群组

<p align="center">
  <a href="https://t.me/NetProxy_Magisk">
    <img src="https://img.shields.io/badge/Telegram-加入群组-blue?style=for-the-badge&logo=telegram" alt="Telegram Group" />
  </a>
</p>

欢迎加入讨论 / 提问 / 反馈

---

## 📁 默认配置路径

```
/data/adb/modules/netproxy/xraycore/config/default.json
```

你可以参考这里的 `inbounds`配置。

---

## 📘 配置文件教程（推荐方式）

如果你使用 V2RayNG，可按以下步骤操作：

1. 在 V2RayNG 中导出完整 JSON 配置
2. 将原有的 `"inbounds"` 替换为下面内容：

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
3.导入NetProxy并运行即可

这样就可以让 NetProxy 的透明代理规则生效。

---

## 🤝 贡献

欢迎参与项目！你可以：

* 提交 Issue —— BUG / 功能建议
* 提交 Pull Request —— 优化 / 新功能
* Star ⭐ 表示支持！

---
