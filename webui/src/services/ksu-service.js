import { exec, listPackages, getPackagesInfo } from 'kernelsu';
import { toast } from '../utils/toast.js';

/**
 * KernelSU Service - 封装与 KernelSU API 的交互
 */
export class KSUService {
    static MODULE_PATH = '/data/adb/modules/netproxy';

    static async exec(command, options = {}) {
        try {
            const { errno, stdout, stderr } = await exec(command, options);
            if (errno !== 0) {
                throw new Error(stderr || 'Command execution failed');
            }
            return stdout.trim();
        } catch (error) {
            console.error('KSU exec error:', error);
            toast(error.message);
            throw error;
        }
    }

    // 获取服务状态
    static async getStatus() {
        try {
            const output = await this.exec(`cat ${this.MODULE_PATH}/config/status.yaml`);
            const status = output.match(/status:\s*"([^"]+)"/)?.[1] || 'unknown';
            const config = output.match(/config:\s*"([^"]+)"/)?.[1] || '';
            return { status, config: config.split('/').pop() };
        } catch (error) {
            return { status: 'unknown', config: '' };
        }
    }

    // 启动服务
    static async startService() {
        await exec(`su -c "sh ${this.MODULE_PATH}/scripts/start.sh"`);
    }

    // 停止服务
    static async stopService() {
        await exec(`su -c "sh ${this.MODULE_PATH}/scripts/stop.sh"`);
    }

    // 获取配置文件列表
    static async getConfigList() {
        try {
            const output = await this.exec(`ls ${this.MODULE_PATH}/config/xray/*.json 2>/dev/null || echo`);
            return output.split('\n').filter(f => f).map(f => f.split('/').pop());
        } catch (error) {
            return [];
        }
    }

    static async deleteConfig(filename) {
        console.log('>>> KSUService.deleteConfig START, filename:', filename);
        try {
            const cmd = `su -c "rm '${this.MODULE_PATH}/config/xray/${filename}'"`;
            console.log('>>> Executing command:', cmd);
            await exec(cmd);
            console.log('>>> Delete successful (no exception)');
            return { success: true };
        } catch (error) {
            console.error('>>> deleteConfig exception:', error);
            return { success: false, error: error.message };
        }
    }

    static async deleteUID(uid) {
        console.log('>>> KSUService.deleteUID START, uid:', uid);
        try {
            const uidListPath = `${this.MODULE_PATH}/config/uid_list.conf`;
            const cmd = `su -c "sed -i '/^${uid}$/d' '${uidListPath}'"`;
            console.log('>>> Executing command:', cmd);
            await exec(cmd);
            console.log('>>> Delete UID successful (no exception)');
            return { success: true };
        } catch (error) {
            console.error('>>> deleteUID exception:', error);
            return { success: false, error: error.message };
        }
    }

    // 即时应用iptables规则（添加UID）
    static async applyUIDIptables(uid) {
        try {
            console.log('Applying iptables rule for UID:', uid);
            const cmd = `su -c "iptables -t nat -I OUTPUT -p tcp -m owner --uid-owner ${uid} -j RETURN"`;
            await exec(cmd);
            console.log('Iptables rule applied for UID:', uid);
            return { success: true };
        } catch (error) {
            console.error('Failed to apply iptables rule:', error);
            return { success: false, error: error.message };
        }
    }

    // 即时删除iptables规则（删除UID）
    static async removeUIDIptables(uid) {
        try {
            console.log('Removing iptables rule for UID:', uid);
            const cmd = `su -c "iptables -t nat -D OUTPUT -p tcp -m owner --uid-owner ${uid} -j RETURN"`;
            await exec(cmd);
            console.log('Iptables rule removed for UID:', uid);
            return { success: true };
        } catch (error) {
            console.error('Failed to remove iptables rule:', error);
            return { success: false, error: error.message };
        }
    }

    // 读取配置文件
    static async readConfig(filename) {
        return await this.exec(`cat ${this.MODULE_PATH}/config/xray/${filename}`);
    }

    // 保存配置文件
    static async saveConfig(filename, content) {
        const escaped = content.replace(/'/g, "'\\''");
        await this.exec(`echo '${escaped}' > ${this.MODULE_PATH}/config/xray/${filename}`);
    }

    // 从节点链接导入配置
    static async importFromNodeLink(nodeLink) {
        try {
            console.log('Importing from node link...');
            const cmd = `su -c "${this.MODULE_PATH}/scripts/url2json.sh '${nodeLink}'"`;
            const result = await exec(cmd);
            console.log('Import result:', result);

            if (result.errno === 0) {
                return { success: true, output: result.stdout };
            } else {
                return { success: false, error: result.stderr || 'Import failed' };
            }
        } catch (error) {
            console.error('Import from node link error:', error);
            return { success: false, error: error.message };
        }
    }

    // 获取 Xray 版本号
    static async getXrayVersion() {
        try {
            const result = await exec(`${this.MODULE_PATH}/bin/xray version`);
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
    static async updateXray() {
        try {
            const cmd = `su -c "sh ${this.MODULE_PATH}/scripts/update-xray.sh"`;
            const result = await exec(cmd);

            if (result.errno === 0) {
                const output = (result.stdout || '') + (result.stderr || '');
                console.log('Update output:', output);

                if (output.includes('已是最新版本') || output.includes('无需更新')) {
                    return { success: true, isLatest: true, message: '已是最新版本，无需更新', output };
                } else if (output.includes('更新成功') || output.includes('========== 更新成功')) {
                    return { success: true, isLatest: false, message: '更新成功', output };
                } else {
                    return { success: true, isLatest: false, message: '操作完成', output };
                }
            } else {
                return { success: false, isLatest: false, message: '更新失败', error: result.stderr };
            }
        } catch (error) {
            console.error('Update Xray error:', error);
            return { success: false, isLatest: false, message: '更新失败', error: error.message };
        }
    }

    // 切换配置
    static async switchConfig(filename) {
        const { status } = await this.getStatus();
        if (status === 'running') {
            await this.stopService();
        }

        const newStatus = `status: "stopped"\nconfig: "${this.MODULE_PATH}/config/xray/${filename}"`;
        await this.exec(`echo '${newStatus}' > ${this.MODULE_PATH}/config/status.yaml`);
    }

    // 获取 UID 列表
    static async getUIDList() {
        try {
            const output = await this.exec(`cat ${this.MODULE_PATH}/config/uid_list.conf`);
            return output.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#') && !line.startsWith('//'))
                .filter(line => /^\d+$/.test(line));
        } catch (error) {
            return [];
        }
    }

    // 添加 UID
    static async addUID(uid) {
        const list = await this.getUIDList();
        if (list.includes(uid)) {
            throw new Error('UID 已存在');
        }
        await this.exec(`echo '${uid}' >> ${this.MODULE_PATH}/config/uid_list.conf`);
    }

    // 删除 UID
    static async removeUID(uid) {
        const list = await this.getUIDList();
        const newList = list.filter(u => u !== uid).join('\n');
        await this.exec(`echo '${newList}' > ${this.MODULE_PATH}/config/uid_list.conf`);
    }

    // 获取日志
    static async getServiceLog(lines = 100) {
        try {
            return await this.exec(`tail -n ${lines} ${this.MODULE_PATH}/logs/service.log`);
        } catch (error) {
            return '暂无日志';
        }
    }

    static async getXrayLog(lines = 100) {
        try {
            return await this.exec(`tail -n ${lines} ${this.MODULE_PATH}/logs/xray.log`);
        } catch (error) {
            return '暂无日志';
        }
    }

    // 获取服务运行时间
    static async getUptime() {
        try {
            console.log('getUptime: trying ps command...');
            const result = await exec(`ps -o etime= -C xray 2>/dev/null | head -1 | tr -d ' '`);
            console.log('getUptime: method 1 - errno:', result.errno, 'stdout:', result.stdout);

            if (result.errno === 0 && result.stdout.trim()) {
                return result.stdout.trim();
            }

            console.log('getUptime: method 1 failed, trying fallback...');
            const fallback = await exec(`ps -eo etime,comm | grep xray | grep -v grep | head -1 | awk '{print $1}'`);
            console.log('getUptime: method 2 - errno:', fallback.errno, 'stdout:', fallback.stdout);

            if (fallback.errno === 0 && fallback.stdout.trim()) {
                return fallback.stdout.trim();
            }

            console.warn('getUptime: both methods failed');
            return '--';
        } catch (error) {
            console.error('getUptime: error -', error);
            return '--';
        }
    }

    // 获取实时网速
    static async getNetworkSpeed() {
        try {
            const rx1Result = await exec(`awk '/:/ {sum+=$2} END {print sum}' /proc/net/dev`);
            const tx1Result = await exec(`awk '/:/ {sum+=$10} END {print sum}' /proc/net/dev`);

            if (rx1Result.errno !== 0 || tx1Result.errno !== 0) {
                return { download: '0 KB/s', upload: '0 KB/s' };
            }

            const rx1 = parseInt(rx1Result.stdout.trim()) || 0;
            const tx1 = parseInt(tx1Result.stdout.trim()) || 0;

            await new Promise(resolve => setTimeout(resolve, 1000));

            const rx2Result = await exec(`awk '/:/ {sum+=$2} END {print sum}' /proc/net/dev`);
            const tx2Result = await exec(`awk '/:/ {sum+=$10} END {print sum}' /proc/net/dev`);

            const rx2 = parseInt(rx2Result.stdout.trim()) || 0;
            const tx2 = parseInt(tx2Result.stdout.trim()) || 0;

            const downloadSpeed = Math.max(0, Math.floor((rx2 - rx1) / 1024));
            const uploadSpeed = Math.max(0, Math.floor((tx2 - tx1) / 1024));

            return { download: `${downloadSpeed} KB/s`, upload: `${uploadSpeed} KB/s` };
        } catch (error) {
            console.error('Failed to get network speed:', error);
            return { download: '0 KB/s', upload: '0 KB/s' };
        }
    }

    // 获取Xray内存占用
    static async getMemoryUsage() {
        try {
            const result = await exec(`ps -o rss,comm | grep xray | grep -v grep | awk '{sum+=$1} END {print sum}'`);
            if (result.errno !== 0 || !result.stdout || result.stdout.trim() === '') {
                return '--';
            }

            const memoryKB = parseInt(result.stdout.trim()) || 0;
            if (memoryKB === 0) return '--';

            if (memoryKB > 1024) {
                return `${(memoryKB / 1024).toFixed(1)} MB`;
            } else {
                return `${memoryKB} KB`;
            }
        } catch (error) {
            console.error('Get memory usage error:', error);
            return '--';
        }
    }

    // 获取ping延迟
    static async getPingLatency(host) {
        try {
            const result = await exec(`ping -c 1 -W 1 ${host} 2>&1 | grep 'time=' | awk -F 'time=' '{print $2}' | awk '{print $1}'`);

            if (result.errno === 0 && result.stdout.trim()) {
                const latency = parseFloat(result.stdout.trim());
                if (!isNaN(latency)) {
                    return `${Math.round(latency)} ms`;
                }
            }
            return '超时';
        } catch (error) {
            console.error(`Failed to ping ${host}:`, error);
            return '失败';
        }
    }

    // 获取已安装应用列表
    static async getInstalledApps() {
        try {
            const packages = await listPackages('user');
            const appsInfo = await getPackagesInfo(packages);

            return appsInfo.map(app => ({
                packageName: app.packageName,
                appLabel: app.appLabel,
                uid: app.uid,
                icon: `ksu://icon/${app.packageName}`
            }));
        } catch (error) {
            console.error('Failed to get apps:', error);
            return [];
        }
    }
}

