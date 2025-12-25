import { KSUService } from '../services/ksu-service.js';

/**
 * 状态页面管理器
 */
export class StatusPageManager {
    constructor(ui) {
        this.ui = ui;
        this.uptimeStartTime = null;
        this.uptimeInterval = null;
    }

    async update() {
        console.log('=== updateStatusPage() async function started ===');
        try {
            console.log('Step 1: Calling KSUService.getStatus()...');
            const { status, config } = await KSUService.getStatus();
            console.log(`Step 2: Status received - status: "${status}", config: "${config}"`);

            console.log('Step 3: Getting DOM elements...');
            const statusBadgeDot = document.getElementById('status-badge-dot');
            const statusBadgeText = document.getElementById('status-badge-text');
            const statusDetail = document.getElementById('status-detail');
            const statusChip = document.getElementById('status-chip-new');

            console.log('Step 4: DOM elements found:', {
                statusBadgeDot: !!statusBadgeDot,
                statusBadgeText: !!statusBadgeText,
                statusDetail: !!statusDetail,
                statusChip: !!statusChip
            });

            if (status === 'running') {
                statusBadgeDot.className = 'status-badge-dot running';
                statusBadgeText.textContent = '运行中';
                statusChip.textContent = '正常';
                statusChip.style.display = '';
                statusChip.style.background = '';

                if (!this.uptimeInterval) {
                    console.log('Fetching uptime from server...');
                    const uptime = await KSUService.getUptime();
                    console.log('Received uptime:', uptime);

                    if (uptime && uptime !== '--' && uptime !== 'N/A' && !uptime.includes('failed')) {
                        this.startUptimeTimer(uptime);
                    } else {
                        console.warn('Invalid uptime received, showing fallback message');
                        statusDetail.textContent = '运行时间获取失败';
                    }
                } else {
                    console.log('Uptime timer already running, skipping fetch');
                }
                statusDetail.style.display = '';
            } else {
                statusBadgeDot.className = 'status-badge-dot stopped';
                statusBadgeText.textContent = '已停止';
                statusChip.textContent = '未启动';
                statusChip.style.display = '';
                statusChip.style.background = 'var(--mdui-color-error-container)';
                statusChip.style.color = 'var(--mdui-color-on-error-container)';
                statusDetail.textContent = '点击右下角按钮启动服务';
                statusDetail.style.display = '';

                this.stopUptimeTimer();
            }

            document.getElementById('current-config-new').textContent = config || '无';

            const fab = document.getElementById('service-fab');
            fab.icon = status === 'running' ? 'stop' : 'play_arrow';

            // 更新内存占用显示
            const memoryEl = document.getElementById('status-memory');
            if (memoryEl) {
                if (status === 'running') {
                    KSUService.getMemoryUsage().then(memory => {
                        memoryEl.textContent = memory;
                    }).catch(() => {
                        memoryEl.textContent = '--';
                    });
                } else {
                    memoryEl.textContent = '--';
                }
            }

            // 异步更新网速
            KSUService.getNetworkSpeed().then(speed => {
                const downloadValue = speed.download.replace(' KB/s', '').trim();
                const uploadValue = speed.upload.replace(' KB/s', '').trim();
                document.getElementById('download-new').textContent = `${downloadValue} KB/s`;
                document.getElementById('upload-new').textContent = `${uploadValue} KB/s`;
            }).catch(error => {
                console.error('Failed to update network speed:', error);
            });

            // 异步获取 Xray 版本号
            KSUService.getXrayVersion().then(version => {
                document.getElementById('xray-version').textContent = version;
            }).catch(error => {
                console.error('Failed to get Xray version:', error);
                document.getElementById('xray-version').textContent = '--';
            });

            console.log('updateStatusPage() completed successfully');
        } catch (error) {
            console.error('Update status failed:', error);
            console.error('Error details:', error.message, error.stack);
        }
    }

    startUptimeTimer(uptimeString) {
        console.log('startUptimeTimer called with:', uptimeString);
        const parts = uptimeString.split(/[-:]/);
        console.log('Parsed parts:', parts);

        let totalSeconds = 0;
        if (parts.length === 4) {
            totalSeconds = parseInt(parts[0]) * 86400 + parseInt(parts[1]) * 3600 + parseInt(parts[2]) * 60 + parseInt(parts[3]);
        } else if (parts.length === 3) {
            totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        } else if (parts.length === 2) {
            totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }

        this.uptimeStartTime = Date.now() - (totalSeconds * 1000);
        console.log('Calculated uptimeStartTime:', new Date(this.uptimeStartTime).toLocaleString());

        if (this.uptimeInterval) {
            clearInterval(this.uptimeInterval);
        }

        this.updateUptimeDisplay();
        this.uptimeInterval = setInterval(() => this.updateUptimeDisplay(), 1000);
        console.log('Uptime timer started successfully');
    }

    stopUptimeTimer() {
        if (this.uptimeInterval) {
            clearInterval(this.uptimeInterval);
            this.uptimeInterval = null;
        }
        this.uptimeStartTime = null;
    }

    updateUptimeDisplay() {
        if (!this.uptimeStartTime) return;

        const elapsed = Math.floor((Date.now() - this.uptimeStartTime) / 1000);
        const days = Math.floor(elapsed / 86400);
        const hours = Math.floor((elapsed % 86400) / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;

        let uptimeStr = '';
        if (days > 0) {
            uptimeStr = `${days}-${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            uptimeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        const statusDetail = document.getElementById('status-detail');
        if (statusDetail) {
            statusDetail.textContent = `运行 ${uptimeStr}`;
        }
    }

    async refreshLatency() {
        console.log('Starting latency detection...');

        const btn = document.getElementById('refresh-latency-btn');
        if (btn) {
            btn.disabled = true;
        }

        const sites = ['baidu', 'google', 'github'];
        sites.forEach(site => {
            const valueEl = document.getElementById(`latency-${site}-compact`);
            valueEl.className = 'latency-value-horizontal';
            valueEl.textContent = '...';
        });

        sites.forEach(async (site) => {
            try {
                const domain = site === 'baidu' ? 'baidu.com' :
                    site === 'google' ? '8.8.8.8' : 'github.com';
                console.log(`Pinging ${site}...`);
                const latency = await KSUService.getPingLatency(domain);
                console.log(`${site} latency:`, latency);
                this.updateLatencyHorizontal(site, latency);
            } catch (error) {
                console.error(`Failed to get ${site} latency:`, error);
                this.updateLatencyHorizontal(site, null);
            }
        });

        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.loading = false;
            }
        }, 1000);

        console.log('Latency detection initiated (non-blocking)');
    }

    updateLatencyHorizontal(site, latencyText) {
        const valueEl = document.getElementById(`latency-${site}-compact`);
        valueEl.textContent = latencyText;

        const match = latencyText.match(/(\d+)/);
        if (match) {
            const latency = parseInt(match[1]);
            if (latency < 300) {
                valueEl.className = 'latency-value-horizontal excellent';
            } else if (latency < 500) {
                valueEl.className = 'latency-value-horizontal good';
            } else {
                valueEl.className = 'latency-value-horizontal poor';
            }
        } else {
            valueEl.className = 'latency-value-horizontal';
        }
    }
}

