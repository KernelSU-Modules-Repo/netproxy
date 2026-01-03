import { KSUService } from '../services/ksu-service.js';
import { I18nService } from '../services/i18n-service.js';

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
        try {
            const { status, config } = await KSUService.getStatus();

            const statusBadgeDot = document.getElementById('status-badge-dot');
            const statusBadgeText = document.getElementById('status-badge-text');
            const statusDetail = document.getElementById('status-detail');
            const statusChip = document.getElementById('status-chip-new');

            if (status === 'running') {
                statusBadgeDot.className = 'status-badge-dot running';
                statusBadgeText.textContent = I18nService.t('status.running_text');
                statusChip.textContent = I18nService.t('status.normal');
                statusChip.style.display = '';
                statusChip.style.background = '';

                if (!this.uptimeInterval) {
                    const uptime = await KSUService.getUptime();

                    if (uptime && uptime !== '--' && uptime !== 'N/A' && !uptime.includes('failed')) {
                        this.startUptimeTimer(uptime);
                    } else {
                        statusDetail.textContent = I18nService.t('status.uptime_failed');
                    }
                }
                statusDetail.style.display = '';
            } else {
                statusBadgeDot.className = 'status-badge-dot stopped';
                statusBadgeText.textContent = I18nService.t('status.stopped_text');
                statusChip.textContent = I18nService.t('status.not_started');
                statusChip.style.display = '';
                statusChip.style.background = 'var(--mdui-color-error-container)';
                statusChip.style.color = 'var(--mdui-color-on-error-container)';
                statusDetail.textContent = I18nService.t('status.start_hint');
                statusDetail.style.display = '';

                this.stopUptimeTimer();
            }

            document.getElementById('current-config-new').textContent = config || I18nService.t('status.no_config');

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
            }).catch(() => { });

            // 异步获取 Xray 版本号
            KSUService.getXrayVersion().then(version => {
                document.getElementById('xray-version').textContent = version;
            }).catch(() => {
                document.getElementById('xray-version').textContent = '--';
            });
        } catch (error) {
            console.error('Update status failed:', error);
        }
    }

    startUptimeTimer(uptimeString) {
        const parts = uptimeString.split(/[-:]/);

        let totalSeconds = 0;
        if (parts.length === 4) {
            totalSeconds = parseInt(parts[0]) * 86400 + parseInt(parts[1]) * 3600 + parseInt(parts[2]) * 60 + parseInt(parts[3]);
        } else if (parts.length === 3) {
            totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        } else if (parts.length === 2) {
            totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }

        this.uptimeStartTime = Date.now() - (totalSeconds * 1000);

        if (this.uptimeInterval) {
            clearInterval(this.uptimeInterval);
        }

        this.updateUptimeDisplay();
        this.uptimeInterval = setInterval(() => this.updateUptimeDisplay(), 1000);
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
            statusDetail.textContent = I18nService.t('status.uptime_prefix') + uptimeStr;
        }
    }

    async refreshLatency() {
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
                const latency = await KSUService.getPingLatency(domain);

                let displayLatency = latency;
                if (latency === 'timeout') displayLatency = I18nService.t('config.status.timeout');
                else if (latency === 'failed') displayLatency = I18nService.t('config.status.failed');

                this.updateLatencyHorizontal(site, displayLatency);
            } catch (error) {
                this.updateLatencyHorizontal(site, null);
            }
        });

        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.loading = false;
            }
        }, 1000);
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

