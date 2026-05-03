# 节点与订阅

NetProxy 统一将节点转换为 **sing-box** 配置，并按目录组织。

## 节点目录结构

```text
/data/adb/modules/netproxy/config/singbox/outbounds/
├── default/
└── sub_xxx/
```

- `default/`：手动导入节点的默认目录
- `sub_xxx/`：每个订阅各自的目录

当前节点文件路径保存在 `module.conf` 的 `CURRENT_CONFIG` 中。

## 支持的导入方式

### 单链接

适合快速添加一个节点：

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node add "vless://..."'
```

### 文件导入

适合导入 Clash YAML 或本地节点文件：

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node import /sdcard/clash.yaml'
```

### 订阅导入

适合长期维护一组节点：

```sh
su -c '/data/adb/modules/netproxy/scripts/cli sub add 我的订阅 https://example.com/sub'
su -c '/data/adb/modules/netproxy/scripts/cli sub update-all'
```

## 切换节点

### 查看节点列表

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node list'
```

### 切换到目标节点

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node use 节点名称'
```

NetProxy 会优先尝试通过控制接口热切换；如果目标节点不在当前运行实例已加载范围内，则会自动回退到重启服务。

## 动态测速与手动选择

由 `module.conf` 中的 `SELECTOR_MODE` 决定：

- `manual`：更偏向手动选节点
- `urltest`：生成动态测速组，默认优先更低延迟节点

当你启用 `urltest` 时，运行时会生成 `Auto-Fastest` 一类测速组，并通过 `Proxy` 选择器统一切换。

## 延迟测试

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node delay 当前节点'
su -c '/data/adb/modules/netproxy/scripts/cli node delay all'
```

## 导出链接

已生成的 sing-box 节点也可以重新导出为分享链接：

```sh
su -c '/data/adb/modules/netproxy/scripts/cli node export /data/adb/modules/netproxy/config/singbox/outbounds/default/default.json'
```

## 常见建议

- `default/` 适合放你手动维护的节点
- 订阅建议一订阅一目录，便于切换与清理
- 出现异常节点时，优先删除无效节点并重新更新订阅
- 同时结合 Android 管理器和 zashboard 观察当前真实代理组状态
