import { ShellService } from './shell-service.js';
import { exec } from 'kernelsu';

/**
 * Status Service - 状态页面相关业务逻辑
 */
export class StatusService {
    // ==================== 服务控制 ====================

    // 获取服务状态
    static async getStatus() {
        try {
            // 使用 pidof 检测 xray 进程是否运行
            const pidOutput = await ShellService.exec(`pidof -s /data/adb/modules/netproxy/bin/xray 2>/dev/null || echo`);
            const isRunning = pidOutput.trim() !== '';
            const status = isRunning ? 'running' : 'stopped';

            // config 从 module.conf 读取
            const configOutput = await ShellService.exec(`cat ${ShellService.MODULE_PATH}/config/module.conf 2>/dev/null || echo`);
            const config = configOutput.match(/CURRENT_CONFIG="([^"]*)"/)?.[1] || '';

            return { status, config: config.split('/').pop() };
        } catch (error) {
            return { status: 'unknown', config: '' };
        }
    }

    // 启动服务（非阻塞）
    static async startService() {
        // 后台执行服务脚本，不等待完成
        exec(`su -c "nohup sh ${ShellService.MODULE_PATH}/scripts/core/service.sh start > /dev/null 2>&1 &"`);
        // 轮询等待服务启动
        return await this.pollServiceStatus('running', 15000);
    }

    // 停止服务（非阻塞）
    static async stopService() {
        // 后台执行服务脚本，不等待完成
        exec(`su -c "nohup sh ${ShellService.MODULE_PATH}/scripts/core/service.sh stop > /dev/null 2>&1 &"`);
        // 轮询等待服务停止
        return await this.pollServiceStatus('stopped', 10000);
    }

    // 轮询服务状态
    static async pollServiceStatus(targetStatus, timeout) {
        const start = Date.now();
        const interval = 500; // 每 500ms 检查一次

        while (Date.now() - start < timeout) {
            await new Promise(resolve => setTimeout(resolve, interval));
            try {
                const { status } = await this.getStatus();
                if (status === targetStatus) {
                    return true;
                }
            } catch (e) {
                // 忽略检查过程中的错误
            }
        }
        return false; // 超时
    }

    // ==================== 状态监控 ====================

    // 获取服务运行时间
    static async getUptime() {
        try {
            const result = await exec(`
                 pid=$(pidof xray) || exit 1
                 awk 'BEGIN {
                     getline u < "/proc/uptime"; split(u, a, " ")
                     getline s < "/proc/'"$pid"'/stat"; split(s, b, " ")
                     "getconf CLK_TCK" | getline h
                     t = int(a[1] - b[22] / h)
                     d = int(t / 86400); h = int((t % 86400) / 3600); m = int((t % 3600) / 60); s = t % 60
                     if (d > 0) printf "%d-%02d:%02d:%02d", d, h, m, s
                     else printf "%02d:%02d:%02d", h, m, s
                 }'
             `);
            return (result.errno === 0 && result.stdout.trim()) ? result.stdout.trim() : '--';
        } catch (error) {
            return '--';
        }
    }

    // 缓存上次网络数据
    static _lastNetBytes = null;
    static _lastNetTime = 0;

    // 获取实时网速（无阻塞）
    static async getNetworkSpeed() {
        try {
            const result = await exec(`awk '/:/ {rx+=$2; tx+=$10} END {print rx, tx}' /proc/net/dev`);
            if (result.errno !== 0) {
                return { download: '0 KB/s', upload: '0 KB/s' };
            }
            const [rx, tx] = result.stdout.trim().split(/\s+/).map(Number);
            const now = Date.now();

            if (this._lastNetBytes === null) {
                // 首次调用，保存数据，返回 0
                this._lastNetBytes = { rx, tx };
                this._lastNetTime = now;
                return { download: '0 KB/s', upload: '0 KB/s' };
            }

            const elapsed = (now - this._lastNetTime) / 1000; // 秒
            if (elapsed < 0.5) {
                // 间隔太短，返回上次值
                return { download: '0 KB/s', upload: '0 KB/s' };
            }

            const download = Math.max(0, Math.floor((rx - this._lastNetBytes.rx) / 1024 / elapsed));
            const upload = Math.max(0, Math.floor((tx - this._lastNetBytes.tx) / 1024 / elapsed));

            this._lastNetBytes = { rx, tx };
            this._lastNetTime = now;

            return { download: `${download} KB/s`, upload: `${upload} KB/s` };
        } catch (error) {
            return { download: '0 KB/s', upload: '0 KB/s' };
        }
    }

    // 获取流量统计 (今日累计)
    static async getTrafficStats() {
        try {
            // 获取所有接口的总流量
            const result = await exec(`awk '/:/ {rx+=$2; tx+=$10} END {print rx, tx}' /proc/net/dev`);
            if (result.errno !== 0) {
                return { rx: 0, tx: 0 };
            }
            const parts = result.stdout.trim().split(/\s+/);
            return {
                rx: parseInt(parts[0]) || 0,
                tx: parseInt(parts[1]) || 0
            };
        } catch (error) {
            return { rx: 0, tx: 0 };
        }
    }

    // ==================== IP 信息 ====================

    // 获取内网IP
    static async getInternalIP() {
        try {
            const result = await ShellService.exec(`ip -4 addr show 2>/dev/null | awk '/inet / && !/127\\.0\\.0\\.1/ {gsub(/\\/.*/, "", $2); print $2, $NF}' | head -3`);
            // 解析格式: "192.168.1.100 wlan0"
            return result.split('\n').filter(l => l.trim()).map(line => {
                const parts = line.trim().split(/\s+/);
                return { ip: parts[0], iface: parts[1] || 'unknown' };
            }).filter(item => item.ip);
        } catch (error) {
            return [];
        }
    }

    // 获取外网IP
    static async getExternalIP() {
        try {
            const result = await ShellService.exec(`curl -s --connect-timeout 3 --max-time 5 ip.sb 2>/dev/null`);
            return result.trim() || null;
        } catch (error) {
            return null;
        }
    }

    // ==================== 出站模式 ====================

    // 获取当前出站模式
    static async getOutboundMode() {
        try {
            const output = await ShellService.exec(`grep '^OUTBOUND_MODE=' ${ShellService.MODULE_PATH}/config/module.conf 2>/dev/null | cut -d'=' -f2`);
            return output.trim() || 'rule';
        } catch (error) {
            return 'rule';
        }
    }

    // 设置出站模式
    static async setOutboundMode(mode) {
        try {
            let rulesFile = '';

            if (mode === 'global') {
                const rulesJson = await this.generateGlobalRules();
                rulesFile = `${ShellService.MODULE_PATH}/logs/.mode_rules.json`;
                const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(rulesJson, null, 2))));
                await ShellService.exec(`echo '${base64}' | base64 -d > ${rulesFile}`);
            } else if (mode === 'direct') {
                const rulesJson = await this.generateDirectRules();
                rulesFile = `${ShellService.MODULE_PATH}/logs/.mode_rules.json`;
                const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(rulesJson, null, 2))));
                await ShellService.exec(`echo '${base64}' | base64 -d > ${rulesFile}`);
            }

            const result = await ShellService.exec(`sh ${ShellService.MODULE_PATH}/scripts/core/switch-mode.sh ${mode} ${rulesFile}`);

            if (rulesFile) {
                await ShellService.exec(`rm -f ${rulesFile}`).catch(() => { });
            }

            return result.includes('success');
        } catch (error) {
            console.error('设置出站模式失败:', error);
            return false;
        }
    }

    static async generateGlobalRules() {
        return {
            routing: {
                domainStrategy: 'AsIs',
                rules: [
                    { type: 'field', inboundTag: ['tproxy-in'], port: '53', outboundTag: 'dns-out' },
                    { type: 'field', port: '0-65535', outboundTag: 'proxy' },
                    { type: 'field', inboundTag: ['domestic-dns'], outboundTag: 'direct' },
                    { type: 'field', inboundTag: ['dns-module'], outboundTag: 'proxy' }
                ]
            }
        };
    }

    static async generateDirectRules() {
        return {
            routing: {
                domainStrategy: 'AsIs',
                rules: [
                    { type: 'field', inboundTag: ['tproxy-in'], port: '53', outboundTag: 'dns-out' },
                    { type: 'field', port: '0-65535', outboundTag: 'direct' },
                    { type: 'field', inboundTag: ['domestic-dns'], outboundTag: 'direct' },
                    { type: 'field', inboundTag: ['dns-module'], outboundTag: 'direct' }
                ]
            }
        };
    }
}
