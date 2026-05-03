## 版本 7.0.0（2026-05-03）

### 核心更新

* NetProxy 正式完成从 **Xray** 到 **sing-box** 的整体迁移，核心架构、配置结构、运行时生成逻辑、节点与订阅管理均已围绕 sing-box 重构。
* 本次为 **6.0.1 -> 7.0.0** 的大版本升级，包含核心切换、脚本体系重构、CLI 重写、透明代理优化以及设备兼容性改进。

### 主要变更


1. 核心全面迁移至 sing-box：
   * 移除 Xray 相关核心、配置目录与旧更新逻辑，模块运行核心统一切换为 sing-box。
   * 配置主目录从 `config/xray` 迁移为 `config/singbox`。
   * 新增 Clash API 支持，并内置 zashboard 控制面板。

2. 节点、订阅与配置生成能力重构：
   * 订阅管理迁移至 `core/subscription.sh`，统一单链接、节点文件、订阅链接三种输入方式。
   * 全面适配 sing-box 配置生成，增强多协议与多传输方式支持。
   * 支持将 sing-box 节点配置重新导出为节点分享链接。

3. CLI 与脚本架构重构：
   * CLI 按 sing-box 架构全面重写，统一服务管理、节点切换、订阅更新、模式切换、Clash API、应用分流与透明代理控制入口。
   * 新增 `common / config / api / nodes` 公共工具层，减少重复实现。
   * `service / switch / runtime / subscription` 编排层重构，整体结构更清晰，后续维护成本更低。
   * 移除旧的 `switch-config.sh`、`switch-mode.sh` 等分散逻辑，统一收敛为新的切换流程。

4. 运行时与出站逻辑优化：
   * 删除静态 `05_outbounds.json`，改为由运行时动态生成 `runtime/outbounds.json`。
   * 支持手动选择与动态测速两种节点选择模式。

5. 透明代理与底层性能优化：
   * 优化 shell 执行性能，尽量减少不必要的进程 fork。
   * 改进 POSIX 兼容性与脚本结构一致性。

6. IPSET 与内核兼容增强：
   * 集成 IPSET LKM 驱动，覆盖 `5.10 / 5.15 / 6.1 / 6.6 / 6.12` 多个内核版本。

* * *
