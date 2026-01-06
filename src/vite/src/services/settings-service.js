import { ShellService } from './shell-service.js';
import { exec, spawn } from 'kernelsu';

/**
 * Settings Service - 设置页面相关业务逻辑
 */
export class SettingsService {
    // ===================== 模块设置 =====================

    // 获取模块设置
    static async getModuleSettings() {
        try {
            const content = await ShellService.exec(`cat ${ShellService.MODULE_PATH}/config/module.conf`);
            const settings = {};

            const autoStartMatch = content.match(/AUTO_START=(\d+)/);
            settings.auto_start = autoStartMatch ? autoStartMatch[1] === '1' : true;

            const oneplusFixMatch = content.match(/ONEPLUS_A16_FIX=(\d+)/);
            settings.oneplus_a16_fix = oneplusFixMatch ? oneplusFixMatch[1] === '1' : true;

            return settings;
        } catch (error) {
            return {
                auto_start: true,
                oneplus_a16_fix: true
            };
        }
    }

    // 设置模块选项
    static async setModuleSetting(key, value) {
        const upperKey = key.toUpperCase();
        const numValue = value ? '1' : '0';
        await ShellService.exec(`sed -i 's/${upperKey}=.*/${upperKey}=${numValue}/' ${ShellService.MODULE_PATH}/config/module.conf`);
        return { success: true };
    }

    // 执行 OnePlus A16 兼容性修复脚本
    static async executeOneplusFix() {
        await ShellService.exec(`su -c "sh ${ShellService.MODULE_PATH}/scripts/utils/oneplus_a16_fix.sh"`);
        return { success: true };
    }

    // 打开外部浏览器
    static async openExternalUrl(url) {
        await exec(`am start -a android.intent.action.VIEW -d "${url}"`);
    }

    // ===================== 代理开关设置 =====================

    // 获取代理开关设置
    static async getProxySettings() {
        try {
            const content = await ShellService.exec(`cat ${ShellService.MODULE_PATH}/config/tproxy.conf`);
            const settings = {};
            const keys = ['PROXY_MOBILE', 'PROXY_WIFI', 'PROXY_HOTSPOT', 'PROXY_USB', 'PROXY_TCP', 'PROXY_UDP', 'PROXY_IPV6'];

            for (const key of keys) {
                const match = content.match(new RegExp(`${key}=(\\d+)`));
                settings[key.toLowerCase()] = match ? match[1] === '1' : false;
            }
            return settings;
        } catch (error) {
            return {
                proxy_mobile: true,
                proxy_wifi: true,
                proxy_hotspot: false,
                proxy_usb: false,
                proxy_tcp: true,
                proxy_udp: true,
                proxy_ipv6: false
            };
        }
    }

    // 设置代理开关
    static async setProxySetting(key, value) {
        const upperKey = key.toUpperCase();
        const numValue = value ? '1' : '0';
        await ShellService.exec(`sed -i 's/${upperKey}=.*/${upperKey}=${numValue}/' ${ShellService.MODULE_PATH}/config/tproxy.conf`);
        return { success: true };
    }

    // 获取代理模式 (0=自动, 1=TPROXY, 2=REDIRECT)
    static async getProxyMode() {
        try {
            const content = await ShellService.exec(`cat ${ShellService.MODULE_PATH}/config/tproxy.conf`);
            const match = content.match(/PROXY_MODE=(\d+)/);
            return match ? parseInt(match[1]) : 0;
        } catch (error) {
            return 0;
        }
    }

    // 设置代理模式
    static async setProxyMode(value) {
        await ShellService.exec(`sed -i 's/^PROXY_MODE=.*/PROXY_MODE=${value}/' ${ShellService.MODULE_PATH}/config/tproxy.conf`);
        return { success: true };
    }

    // ===================== DNS 配置管理 =====================

    // 获取 DNS 配置
    static async getDnsConfig() {
        try {
            const output = await ShellService.exec(`cat ${ShellService.MODULE_PATH}/config/xray/confdir/02_dns.json`);
            return JSON.parse(output);
        } catch (error) {
            console.error('获取 DNS 配置失败:', error);
            return { dns: { hosts: {}, servers: [] } };
        }
    }

    // 保存 DNS 配置
    static async saveDnsConfig(config) {
        try {
            const json = JSON.stringify(config, null, 4);
            const base64 = btoa(unescape(encodeURIComponent(json)));
            await ShellService.exec(`echo '${base64}' | base64 -d > ${ShellService.MODULE_PATH}/config/xray/confdir/02_dns.json`);
            return { success: true };
        } catch (error) {
            console.error('保存 DNS 配置失败:', error);
            return { success: false, error: error.message };
        }
    }

    // ===================== 路由规则管理 =====================

    // 获取路由规则列表
    static async getRoutingRules() {
        try {
            const output = await ShellService.exec(`cat ${ShellService.MODULE_PATH}/config/routing_rules.json`);
            return JSON.parse(output);
        } catch (error) {
            console.error('获取路由规则失败:', error);
            return [];
        }
    }

    // 保存路由规则列表
    static async saveRoutingRules(rules) {
        try {
            const json = JSON.stringify(rules, null, 4);
            // 使用 base64 编码避免特殊字符问题
            const base64 = btoa(unescape(encodeURIComponent(json)));
            await ShellService.exec(`echo '${base64}' | base64 -d > ${ShellService.MODULE_PATH}/config/routing_rules.json`);
            return { success: true };
        } catch (error) {
            console.error('保存路由规则失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 应用路由规则（在前端生成 routing.json）
    static async applyRoutingRules(rules) {
        try {
            // 构建路由规则数组
            const xrayRules = [];

            for (const rule of rules) {
                if (rule.enabled === false) continue;

                const xrayRule = { type: 'field' };

                // 处理 domain
                if (rule.domain) {
                    xrayRule.domain = rule.domain.split(',').map(d => {
                        d = d.trim();
                        if (d.startsWith('geosite:') || d.startsWith('domain:') || d.startsWith('full:') || d.startsWith('regexp:')) {
                            return d;
                        }
                        return `domain:${d}`;
                    });
                }

                // 处理 ip
                if (rule.ip) {
                    xrayRule.ip = rule.ip.split(',').map(i => i.trim());
                }

                // 处理 port
                if (rule.port) {
                    xrayRule.port = rule.port.trim();
                }

                // 处理 protocol
                if (rule.protocol) {
                    xrayRule.protocol = rule.protocol.split(',').map(p => p.trim());
                }

                // 处理 network
                if (rule.network) {
                    xrayRule.network = rule.network.trim();
                }

                // 设置 outboundTag
                xrayRule.outboundTag = rule.outboundTag || 'proxy';

                xrayRules.push(xrayRule);
            }

            // 添加固定的内部 DNS 规则
            xrayRules.push({
                type: 'field',
                inboundTag: ['domestic-dns'],
                outboundTag: 'direct'
            });
            xrayRules.push({
                type: 'field',
                inboundTag: ['dns-module'],
                outboundTag: 'proxy'
            });

            // 构建完整的路由配置
            const routingConfig = {
                routing: {
                    domainStrategy: 'AsIs',
                    rules: xrayRules
                }
            };

            // 使用 base64 编码写入文件
            const json = JSON.stringify(routingConfig, null, 4);
            const base64 = btoa(unescape(encodeURIComponent(json)));
            await ShellService.exec(`echo '${base64}' | base64 -d > ${ShellService.MODULE_PATH}/config/xray/confdir/03_routing.json`);

            return { success: true };
        } catch (error) {
            console.error('应用路由规则失败:', error);
            return { success: false, error: error.message };
        }
    }

    // ===================== 导出功能 =====================

    // 导出日志到 Download 目录
    static async exportLogs() {
        try {
            const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').slice(0, 15);
            const filename = `netproxy_logs_${timestamp}.tar.gz`;
            const downloadPath = '/storage/emulated/0/Download';
            const outputPath = `${downloadPath}/${filename}`;

            // 确保 Download 目录存在
            await ShellService.exec(`mkdir -p ${downloadPath}`);

            // 使用 tar 压缩 logs 文件夹
            await ShellService.exec(`cd ${ShellService.MODULE_PATH} && tar -czf ${outputPath} logs/`);

            return { success: true, path: outputPath };
        } catch (error) {
            console.error('导出日志失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 导出日志与配置到 Download 目录
    static async exportAll() {
        try {
            const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').slice(0, 15);
            const filename = `netproxy_backup_${timestamp}.tar.gz`;
            const downloadPath = '/storage/emulated/0/Download';
            const outputPath = `${downloadPath}/${filename}`;

            // 确保 Download 目录存在
            await ShellService.exec(`mkdir -p ${downloadPath}`);

            // 使用 tar 同时压缩 logs 和 config 文件夹
            await ShellService.exec(`cd ${ShellService.MODULE_PATH} && tar -czf ${outputPath} logs/ config/`);

            return { success: true, path: outputPath };
        } catch (error) {
            console.error('导出日志与配置失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 获取 Xray 版本号
    static async getXrayVersion() {
        try {
            const result = await exec(`${ShellService.MODULE_PATH}/bin/xray version`);
            if (result.errno === 0) {
                const match = result.stdout.match(/Xray\s+([\d.]+)/);
                return match ? match[1] : 'unknown';
            }
            return 'unknown';
        } catch (error) {
            console.error('Failed to get Xray version:', error);
            return 'unknown';
        }
    }

    // 检查并更新 Xray 内核
    static updateXray() {
        return new Promise((resolve) => {
            let output = '';
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve({ success: false, isLatest: false, message: '更新超时', error: '操作超时' });
                }
            }, 60000);

            try {
                const sh = spawn('su', ['-c', `sh ${ShellService.MODULE_PATH}/scripts/utils/update-xray.sh`]);

                sh.stdout.on('data', (data) => output += data);
                sh.stderr.on('data', (data) => output += data);

                sh.on('exit', (code) => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeout);

                    if (code === 0) {
                        if (output.includes('已是最新版本') || output.includes('无需更新')) {
                            resolve({ success: true, isLatest: true, message: '已是最新版本，无需更新', output });
                        } else if (output.includes('更新成功') || output.includes('========== 更新成功')) {
                            resolve({ success: true, isLatest: false, message: '更新成功', output });
                        } else {
                            resolve({ success: true, isLatest: false, message: '操作完成', output });
                        }
                    } else {
                        resolve({ success: false, isLatest: false, message: '更新失败', error: output });
                    }
                });

                sh.on('error', (err) => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeout);
                    resolve({ success: false, isLatest: false, message: '更新失败', error: err.message });
                });
            } catch (error) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve({ success: false, isLatest: false, message: '更新失败', error: error.message });
                }
            }
        });
    }

    // 获取日志
    static async getServiceLog(lines = 100) {
        try {
            return await ShellService.exec(`tail -n ${lines} ${ShellService.MODULE_PATH}/logs/service.log`);
        } catch (error) {
            return '暂无日志';
        }
    }

    static async getXrayLog(lines = 100) {
        try {
            return await ShellService.exec(`tail -n ${lines} ${ShellService.MODULE_PATH}/logs/xray.log`);
        } catch (error) {
            return '暂无日志';
        }
    }

    static async getTproxyLog(lines = 100) {
        try {
            return await ShellService.exec(`tail -n ${lines} ${ShellService.MODULE_PATH}/logs/tproxy.log`);
        } catch (error) {
            return '暂无日志';
        }
    }

    // 刷新 TProxy 规则
    static async renewTProxy() {
        try {
            const result = await exec(`su -c "sh ${ShellService.MODULE_PATH}/scripts/network/tproxy.sh restart"`);
            return { success: result.errno === 0, output: result.stdout };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}
