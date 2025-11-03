/**
 * Commit-Relay Dashboard v2
 * Modern, reactive dashboard with Alpine.js
 */

function dashboard() {
    return {
        // State
        darkMode: localStorage.getItem('theme') === 'dark' ||
                  (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches),
        loading: true,
        connected: false,
        lastUpdate: 'Never',

        // Data
        metrics: {
            workers: { active: 0, completed: 0, failed: 0, successRate: 0, avgDuration: 0 },
            tasks: { pending: 0, inProgress: 0, completed: 0, total: 0 },
            tokens: { total: 0, used: 0, available: 0, usagePercentage: 0 }
        },
        daemon: null,
        tasks: [],
        events: [],

        // WebSocket
        ws: null,
        reconnectInterval: null,

        // Charts
        tokenChart: null,

        // Initialize
        async init() {
            console.log('Initializing dashboard v2...');

            // Apply theme
            this.applyTheme();

            // Initialize Lucide icons
            lucide.createIcons();

            // Connect WebSocket
            this.connectWebSocket();

            // Fetch initial data
            await this.fetchInitialData();

            // Start polling
            this.startPolling();

            // Initialize charts
            this.$nextTick(() => {
                this.initCharts();
            });

            this.loading = false;
        },

        // Theme management
        toggleTheme() {
            this.darkMode = !this.darkMode;
            this.applyTheme();
            localStorage.setItem('theme', this.darkMode ? 'dark' : 'light');
        },

        applyTheme() {
            if (this.darkMode) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        },

        // WebSocket connection
        connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.connected = true;
                if (this.reconnectInterval) {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.connected = false;

                // Attempt to reconnect
                if (!this.reconnectInterval) {
                    this.reconnectInterval = setInterval(() => {
                        console.log('Attempting to reconnect...');
                        this.connectWebSocket();
                    }, 3000);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.connected = false;
            };
        },

        handleWebSocketMessage(message) {
            if (message.type === 'initial' || message.type === 'update') {
                this.updateMetrics(message.data);
            } else if (message.type === 'event') {
                this.addEvent(message.event);
            }
        },

        // Data fetching
        async fetchInitialData() {
            try {
                // Fetch metrics
                const metricsRes = await fetch('/api/metrics');
                const metrics = await metricsRes.json();
                this.updateMetrics(metrics);

                // Fetch daemon status
                const daemonRes = await fetch('/api/daemon/status');
                this.daemon = await daemonRes.json();

                // Fetch tasks
                const tasksRes = await fetch('/api/tasks');
                const tasksData = await tasksRes.json();
                this.tasks = tasksData.tasks || [];

                // Fetch recent events
                const eventsRes = await fetch('/api/events?limit=50');
                const eventsData = await eventsRes.json();
                this.events = eventsData.events || [];

                console.log('Initial data loaded');
            } catch (error) {
                console.error('Error fetching initial data:', error);
            }
        },

        updateMetrics(metrics) {
            this.metrics = metrics;
            this.lastUpdate = new Date().toLocaleTimeString();

            // Update charts if they exist
            if (this.tokenChart) {
                this.updateTokenChart();
            }
        },

        addEvent(event) {
            // Add to beginning of array
            this.events.unshift(event);

            // Keep only last 50 events
            if (this.events.length > 50) {
                this.events = this.events.slice(0, 50);
            }
        },

        // Polling
        startPolling() {
            // Poll metrics every 5 seconds
            setInterval(async () => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    try {
                        const res = await fetch('/api/metrics');
                        const metrics = await res.json();
                        this.updateMetrics(metrics);
                    } catch (error) {
                        console.error('Error polling metrics:', error);
                    }
                }
            }, 5000);

            // Poll daemon status every 10 seconds
            setInterval(async () => {
                try {
                    const res = await fetch('/api/daemon/status');
                    this.daemon = await res.json();
                } catch (error) {
                    console.error('Error polling daemon status:', error);
                }
            }, 10000);

            // Poll tasks every 15 seconds
            setInterval(async () => {
                try {
                    const res = await fetch('/api/tasks');
                    const data = await res.json();
                    this.tasks = data.tasks || [];
                } catch (error) {
                    console.error('Error polling tasks:', error);
                }
            }, 15000);
        },

        // Charts
        initCharts() {
            this.initTokenChart();
        },

        initTokenChart() {
            const isDark = this.darkMode;
            const textColor = isDark ? '#9CA3AF' : '#6B7280';

            const options = {
                series: [
                    this.metrics.tokens?.mastersUsed || 0,
                    this.metrics.tokens?.workersAllocated || 0,
                    this.metrics.tokens?.available || 0,
                    this.metrics.tokens?.emergencyReserve || 0
                ],
                chart: {
                    type: 'donut',
                    height: 300,
                    background: 'transparent',
                    fontFamily: 'inherit',
                },
                labels: ['Masters', 'Workers', 'Available', 'Reserve'],
                colors: ['#667eea', '#ed8936', '#48bb78', '#9f7aea'],
                legend: {
                    show: true,
                    position: 'bottom',
                    labels: {
                        colors: textColor
                    }
                },
                dataLabels: {
                    enabled: false
                },
                plotOptions: {
                    pie: {
                        donut: {
                            size: '70%',
                            labels: {
                                show: true,
                                name: {
                                    show: true,
                                    color: textColor
                                },
                                value: {
                                    show: true,
                                    color: textColor,
                                    formatter: function (val) {
                                        return Math.round(val).toLocaleString();
                                    }
                                },
                                total: {
                                    show: true,
                                    label: 'Total',
                                    color: textColor,
                                    formatter: function (w) {
                                        const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                                        return Math.round(total).toLocaleString();
                                    }
                                }
                            }
                        }
                    }
                },
                tooltip: {
                    theme: isDark ? 'dark' : 'light',
                    y: {
                        formatter: function (val) {
                            return Math.round(val).toLocaleString() + ' tokens';
                        }
                    }
                }
            };

            this.tokenChart = new ApexCharts(document.querySelector("#tokenChart"), options);
            this.tokenChart.render();
        },

        updateTokenChart() {
            if (!this.tokenChart) return;

            this.tokenChart.updateSeries([
                this.metrics.tokens?.mastersUsed || 0,
                this.metrics.tokens?.workersAllocated || 0,
                this.metrics.tokens?.available || 0,
                this.metrics.tokens?.emergencyReserve || 0
            ]);
        },

        // Utility functions
        formatUptime(seconds) {
            if (!seconds) return '0s';

            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;

            const parts = [];
            if (days > 0) parts.push(`${days}d`);
            if (hours > 0) parts.push(`${hours}h`);
            if (minutes > 0) parts.push(`${minutes}m`);
            if (secs > 0 && days === 0) parts.push(`${secs}s`);

            return parts.join(' ') || '0s';
        }
    };
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    const app = Alpine.raw(document.body._x_dataStack[0]);
    if (app && app.ws) {
        app.ws.close();
    }
});
