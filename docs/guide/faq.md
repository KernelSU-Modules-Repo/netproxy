# 常见问题

## 安装问题

### Q: 安装后模块未生效

**A:** 请确保：
1. 已完成重启
2. 在 Magisk/KernelSU 模块页面确认模块已启用
3. 检查模块日志：`/data/adb/modules/netproxy/logs/`

### Q: WebUI 无法打开

**A:** 可能原因：
1. 模块未正确安装，重新刷入
2. WebUI 文件缺失，检查 `/data/adb/modules/netproxy/webroot/` 目录

---

## 使用问题

### Q: 代理启动失败

**A:** 常见原因：
1. **未添加节点**：请先添加代理节点
2. **配置错误**：检查节点配置是否正确
3. **端口冲突**：其他 VPN 或代理应用可能占用端口

查看详细错误：
```bash
cat /data/adb/modules/netproxy/logs/xray.log
```

### Q: 部分应用无法联网

**A:** 可能原因：
1. 检查分应用代理设置，是否误将应用加入黑名单
2. 检查路由规则，是否有规则阻断了该应用的流量

### Q: DNS 解析失败

**A:** 尝试：
1. 确保 DNS 配置正确
2. 检查 DNS 服务器是否可达
3. 清除系统 DNS 缓存

---

## 性能问题

### Q: 网络速度慢

**A:** 建议：
1. 切换到延迟更低的节点
2. 使用 WebUI 的延迟测试功能筛选节点

---

## 其他问题

### Q: 如何查看日志

**A:** 日志位于 `/data/adb/modules/netproxy/logs/` 目录：
- `service.log` - 服务启停日志
- `xray.log` - Xray 核心日志
- `subscription.log` - 订阅更新日志

### Q: 如何完全卸载

**A:** 
1. 停止代理服务
2. 在 Magisk/KernelSU 中删除模块
3. 重启设备
4. (可选) 删除残留数据：`rm -rf /data/adb/modules/netproxy`
