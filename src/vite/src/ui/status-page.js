import { StatusService } from '../services/status-service.js';
import { I18nService } from '../i18n/i18n-service.js';
import { toast } from '../utils/toast.js';
import uPlot from '../libs/uPlot.esm.js';
import '../libs/uPlot.min.css';

/**
 * 状态页面管理器
 */
export class StatusPageManager {
    constructor(ui) {
        this.ui = ui;
        this.uptimeStartTime = null;
        this.uptimeInterval = null;

        // 网速图表相关
        this.speedChart = null;
        this.speedHistory = {
            time: [],
            download: [],
            upload: []
        };
        this.maxDataPoints = 10;

        // 流量统计
        this.trafficStats = { rx: 0, tx: 0 };
    }

    async update() {
        try {
            const { status } = await StatusService.getStatus();

            // 更新 FAB 按钮状态
            const fab = document.getElementById('service-fab');
            const fabContainer = document.getElementById('dashboard-fab');

            if (status === 'running') {
                fab.icon = 'stop';
                fabContainer.classList.add('running');

                if (!this.uptimeInterval) {
                    const uptime = await StatusService.getUptime();
                    if (uptime && uptime !== '--' && uptime !== 'N/A' && !uptime.includes('failed')) {
                        this.startUptimeTimer(uptime);
                    }
                }
            } else {
                fab.icon = 'play_arrow';
                fabContainer.classList.remove('running');
                document.getElementById('fab-runtime').textContent = '';
                this.stopUptimeTimer();
            }

            // 先初始化图表 (确保有初始数据)
            if (!this.speedChart) {
                this.initSpeedChart();
            }

            // 然后更新网速
            await this.updateNetworkSpeed();

            // 更新 IP 和流量信息
            await this.updateIPAndTraffic();

            // 更新出站模式 UI
            await this.updateModeUI();
        } catch (error) {
            console.error('Update status failed:', error);
        }
    }

    async updateNetworkSpeed() {
        try {
            const speed = await StatusService.getNetworkSpeed();
            const downloadValue = parseFloat(speed.download.replace(' KB/s', '').trim()) || 0;
            const uploadValue = parseFloat(speed.upload.replace(' KB/s', '').trim()) || 0;

            // 更新 Header 速度显示
            const headerSpeedEl = document.getElementById('header-speed-text');
            if (headerSpeedEl) {
                const formatSpeed = (val) => {
                    if (val >= 1024) return `${(val / 1024).toFixed(1)} MB/s`;
                    if (val >= 1) return `${val.toFixed(0)} KB/s`;
                    return `${(val * 1024).toFixed(0)} B/s`;
                };
                headerSpeedEl.textContent = `↑ ${formatSpeed(uploadValue)}   ↓ ${formatSpeed(downloadValue)}`;
            }

            // 获取下一个索引值 (基于最后一个 X 值 + 1)
            let nextIndex = 0;
            if (this.speedHistory.time.length > 0) {
                nextIndex = this.speedHistory.time[this.speedHistory.time.length - 1] + 1;
            }

            this.speedHistory.time.push(nextIndex);
            this.speedHistory.download.push(downloadValue);
            this.speedHistory.upload.push(uploadValue);

            // 限制窗口大小
            if (this.speedHistory.time.length > this.maxDataPoints) {
                this.speedHistory.time.shift();
                this.speedHistory.download.shift();
                this.speedHistory.upload.shift();
            }

            // 更新图表
            if (this.speedChart) {
                this.speedChart.setData([
                    this.speedHistory.time,
                    this.speedHistory.download,
                    this.speedHistory.upload
                ]);
            }
        } catch (error) {
            console.error('Update network speed failed:', error);
        }
    }

    async updateIPAndTraffic() {
        // 内网 IP
        try {
            const ips = await StatusService.getInternalIP();
            const internalEl = document.getElementById('internal-ip');
            if (internalEl) {
                if (ips && ips.length > 0) {
                    internalEl.textContent = ips[0].ip;
                    internalEl.title = ips.map(i => `${i.ip} (${i.iface})`).join('\n');
                } else {
                    internalEl.textContent = I18nService.t('status.no_network') || '无网络';
                }
            }
        } catch (e) {
            const el = document.getElementById('internal-ip');
            if (el) el.textContent = '--';
        }

        // 外网 IP
        try {
            const externalIP = await StatusService.getExternalIP();
            const el = document.getElementById('external-ip');
            if (el) {
                el.textContent = externalIP || '--';
            }
        } catch (e) {
            const el = document.getElementById('external-ip');
            if (el) el.textContent = '--';
        }

        // 流量统计
        try {
            const stats = await StatusService.getTrafficStats();
            this.trafficStats = stats;

            // 更新上传/下载显示
            const uploadEl = document.getElementById('traffic-upload');
            const downloadEl = document.getElementById('traffic-download');

            if (uploadEl && downloadEl) {
                const { value: uploadValue, unit: uploadUnit } = this.formatTraffic(stats.tx);
                const { value: downloadValue, unit: downloadUnit } = this.formatTraffic(stats.rx);

                uploadEl.textContent = uploadValue;
                uploadEl.nextElementSibling.textContent = uploadUnit;
                downloadEl.textContent = downloadValue;
                downloadEl.nextElementSibling.textContent = downloadUnit;
            }

            // 更新环形图
            this.updateDonutChart(stats.tx, stats.rx);
        } catch (e) {
            const uploadEl = document.getElementById('traffic-upload');
            const downloadEl = document.getElementById('traffic-download');
            if (uploadEl) uploadEl.textContent = '0';
            if (downloadEl) downloadEl.textContent = '0';
        }
    }

    formatTraffic(bytes) {
        if (bytes >= 1024 * 1024 * 1024) {
            return { value: (bytes / 1024 / 1024 / 1024).toFixed(2), unit: 'GB' };
        } else if (bytes >= 1024 * 1024) {
            return { value: (bytes / 1024 / 1024).toFixed(1), unit: 'MB' };
        } else if (bytes >= 1024) {
            return { value: (bytes / 1024).toFixed(0), unit: 'KB' };
        }
        return { value: bytes.toString(), unit: 'B' };
    }

    updateDonutChart(upload, download) {
        const container = document.getElementById('traffic-donut');
        if (!container) return;

        const total = upload + download;
        if (total === 0) {
            container.innerHTML = `
                <svg viewBox="0 0 100 100" class="active">
                    <circle cx="50" cy="50" r="35" fill="none" stroke="var(--mdui-color-outline-variant, #ccc)" stroke-width="10"/>
                </svg>
            `;
            return;
        }

        const uploadPercent = upload / total;
        const radius = 35;
        const circumference = 2 * Math.PI * radius;
        const uploadDash = uploadPercent * circumference;
        const downloadDash = (1 - uploadPercent) * circumference;

        container.innerHTML = `
            <svg viewBox="0 0 100 100" class="active">
                <circle cx="50" cy="50" r="${radius}" fill="none" 
                    stroke="var(--monet-secondary, #2196F3)" stroke-width="10"
                    stroke-dasharray="${downloadDash} ${circumference}"
                    transform="rotate(-90 50 50)"/>
                <circle cx="50" cy="50" r="${radius}" fill="none" 
                    stroke="var(--monet-primary, #4CAF50)" stroke-width="10"
                    stroke-dasharray="${uploadDash} ${circumference}"
                    stroke-dashoffset="${-downloadDash}"
                    transform="rotate(-90 50 50)"/>
            </svg>
        `;
    }

    initSpeedChart() {
        const container = document.getElementById('speed-chart-container');
        if (!container || container.clientWidth === 0) {
            // 容器还没准备好，稍后再试
            setTimeout(() => this.initSpeedChart(), 100);
            return;
        }

        const isDark = document.documentElement.classList.contains('mdui-theme-dark') ||
            (document.documentElement.classList.contains('mdui-theme-auto') &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);

        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--monet-primary').trim() || '#4CAF50';
        const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--monet-secondary').trim() || '#2196F3';

        // 初始化数据: 使用两个点 (0, 1) 但值为 0，形成初始横线铺满宽度
        this.speedHistory.time = [0, 1];
        this.speedHistory.download = [0, 0];
        this.speedHistory.upload = [0, 0];


        const opts = {
            width: container.clientWidth,
            height: container.clientHeight || 80,
            series: [
                {},
                {
                    label: 'Download',
                    stroke: secondaryColor,
                    width: 2,
                    paths: uPlot.paths.spline(),
                    points: { show: false }, // 隐藏数据点
                    // 填充满底部: 使用极小值确保填充覆盖到图表底部（负值区域）
                    fillTo: -1e9,
                    fill: (u, seriesIdx) => {
                        const gradient = u.ctx.createLinearGradient(0, 0, 0, u.height);
                        gradient.addColorStop(0, secondaryColor + '60');
                        gradient.addColorStop(1, secondaryColor + '1A');
                        return gradient;
                    },
                },
                {
                    label: 'Upload',
                    stroke: primaryColor,
                    width: 2,
                    paths: uPlot.paths.spline(),
                    points: { show: false }, // 隐藏数据点
                    fillTo: -1e9,
                    fill: (u, seriesIdx) => {
                        const gradient = u.ctx.createLinearGradient(0, 0, 0, u.height);
                        gradient.addColorStop(0, primaryColor + '60');
                        gradient.addColorStop(1, primaryColor + '1A');
                        return gradient;
                    },
                }
            ],
            axes: [
                { show: false },
                { show: false }
            ],
            scales: {
                x: {
                    time: false,
                },
                y: {
                    auto: true,
                    // 悬浮效果：将 0 线抬高
                    range: (u, min, max) => {
                        const effectiveMax = Math.max(max, 100);
                        // 底部负值区域作为"悬浮"支撑
                        return [-effectiveMax * 0.45, effectiveMax];
                    }
                }
            },
            legend: { show: false },
            cursor: { show: false },
            padding: [0, 0, 0, 0],
        };

        this.speedChart = new uPlot(opts, [
            this.speedHistory.time,
            this.speedHistory.download,
            this.speedHistory.upload
        ], container);

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            if (this.speedChart && container && container.clientWidth > 0) {
                this.speedChart.setSize({ width: container.clientWidth, height: container.clientHeight || 80 });
            }
        });
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
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;

        const uptimeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        const fabRuntime = document.getElementById('fab-runtime');
        if (fabRuntime) {
            // 添加两个空格作为物理占位符，防止右侧紧贴
            fabRuntime.textContent = uptimeStr + '\u00A0\u00A0';
        }
    }

    // 更新出站模式 UI
    async updateModeUI() {
        try {
            const currentMode = await StatusService.getOutboundMode();

            // 更新按钮状态
            const modeOptions = document.querySelectorAll('.mode-option');
            modeOptions.forEach(option => {
                const mode = option.dataset.mode;
                if (mode === currentMode) {
                    option.classList.add('active');
                } else {
                    option.classList.remove('active');
                }
            });

            // 直连模式下隐藏节点页面入口
            const navConfig = document.getElementById('nav-config');
            if (navConfig) {
                navConfig.style.display = currentMode === 'direct' ? 'none' : '';
            }
        } catch (error) {
            console.error('更新模式 UI 失败:', error);
        }
    }

    // 设置模式按钮点击事件
    setupModeButtons() {
        const modeOptions = document.querySelectorAll('.mode-option');

        modeOptions.forEach(option => {
            option.addEventListener('click', async () => {
                const mode = option.dataset.mode;

                // 避免重复点击
                if (option.classList.contains('active') || option.classList.contains('loading')) {
                    return;
                }

                // 显示加载状态
                option.classList.add('loading');

                // 立即更新 UI (乐观更新)
                const navConfig = document.getElementById('nav-config');
                if (navConfig) {
                    navConfig.style.display = mode === 'direct' ? 'none' : '';
                }

                // 记录当前激活的按钮用于回滚
                const previousActive = document.querySelector('.mode-option.active');

                // 立即更新按钮状态
                modeOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');

                try {
                    const success = await StatusService.setOutboundMode(mode);

                    if (!success) {
                        // 切换失败，恢复状态
                        modeOptions.forEach(opt => opt.classList.remove('active'));
                        if (previousActive) previousActive.classList.add('active');
                        if (navConfig) {
                            navConfig.style.display = previousActive?.dataset.mode === 'direct' ? 'none' : '';
                        }
                        toast(I18nService.t('status.mode_switch_failed') || '模式切换失败');
                    }
                } catch (error) {
                    console.error('模式切换失败:', error);
                    toast(error.message || '模式切换失败');
                } finally {
                    option.classList.remove('loading');
                }
            });
        });
    }


}
