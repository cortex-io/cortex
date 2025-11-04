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
        lastUpdateTimestamp: null,
        dataFreshness: 'fresh', // fresh, stale, very-stale
        currentView: 'overview', // overview, workers, tasks, events, masters
        successRatePeriod: localStorage.getItem('successRatePeriod') || 'all_time',
        showPeriodSelector: false,

        // Data
        metrics: {
            workers: { active: 0, completed: 0, failed: 0, successRate: 0, avgDuration: 0 },
            tasks: { pending: 0, inProgress: 0, completed: 0, total: 0 },
            tokens: { total: 0, used: 0, available: 0, usagePercentage: 0 }
        },
        daemon: null,
        tasks: [],
        events: [],
        workers: [], // Will store worker pool data

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

            // Add click listener to close period selector when clicking outside
            document.addEventListener('click', (e) => {
                if (this.showPeriodSelector && !e.target.closest('.period-selector-card')) {
                    this.showPeriodSelector = false;
                }
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
            } else if (message.type === 'daemon_status') {
                this.daemon = message.data;
            } else if (message.type === 'buffered_events') {
                // Handle buffered events for reconnecting clients
                console.log(`Received ${message.count} buffered events`);
                message.events.forEach(event => {
                    this.addEvent(event);
                });
            }
        },

        // Success rate period management
        getPeriodLabel(period) {
            const labels = {
                'current_run': 'Current Run',
                'last_24h': 'Last 24 Hours',
                'last_7d': 'Last 7 Days',
                'all_time': 'All Time'
            };
            return labels[period] || 'All Time';
        },

        async changeSuccessRatePeriod(newPeriod) {
            this.successRatePeriod = newPeriod;
            localStorage.setItem('successRatePeriod', newPeriod);
            this.showPeriodSelector = false;

            // Fetch new metrics with selected period
            try {
                const res = await fetch(`/api/metrics?period=${newPeriod}`);
                const metrics = await res.json();
                this.updateMetrics(metrics);
            } catch (error) {
                console.error('Error fetching metrics for period:', error);
            }
        },

        togglePeriodSelector() {
            this.showPeriodSelector = !this.showPeriodSelector;
        },

        // Data fetching
        async fetchInitialData() {
            try {
                // Fetch metrics with selected period
                const metricsRes = await fetch(`/api/metrics?period=${this.successRatePeriod}`);
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
            this.lastUpdateTimestamp = Date.now();
            this.dataFreshness = 'fresh';

            // Update charts if they exist
            if (this.tokenChart) {
                this.updateTokenChart();
            }
        },

        // Check data freshness periodically
        checkDataFreshness() {
            if (!this.lastUpdateTimestamp) {
                this.dataFreshness = 'unknown';
                return;
            }

            const secondsSinceUpdate = (Date.now() - this.lastUpdateTimestamp) / 1000;

            if (secondsSinceUpdate > 120) {
                this.dataFreshness = 'very-stale'; // Red indicator
            } else if (secondsSinceUpdate > 30) {
                this.dataFreshness = 'stale'; // Yellow indicator
            } else {
                this.dataFreshness = 'fresh'; // Green indicator
            }
        },

        getFreshnessColor() {
            switch(this.dataFreshness) {
                case 'fresh': return 'text-green-500';
                case 'stale': return 'text-yellow-500';
                case 'very-stale': return 'text-red-500';
                default: return 'text-gray-500';
            }
        },

        getFreshnessIndicator() {
            switch(this.dataFreshness) {
                case 'fresh': return '●';
                case 'stale': return '●';
                case 'very-stale': return '●';
                default: return '○';
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
            // Check data freshness every 5 seconds
            setInterval(() => {
                this.checkDataFreshness();
            }, 5000);

            // Fallback: Poll metrics every 5 seconds if WebSocket is disconnected
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

            // Note: Daemon status now pushed via WebSocket, no polling needed when connected
            // Fallback: Poll daemon status only if WebSocket is disconnected
            setInterval(async () => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    try {
                        const res = await fetch('/api/daemon/status');
                        this.daemon = await res.json();
                    } catch (error) {
                        console.error('Error polling daemon status:', error);
                    }
                }
            }, 10000);

            // Poll tasks every 15 seconds (tasks not pushed via WebSocket yet)
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
                    this.metrics.tokens?.available || 0,
                    this.metrics.tokens?.used || 0
                ],
                chart: {
                    type: 'pie',
                    height: 300,
                    background: 'transparent',
                    fontFamily: 'inherit',
                },
                labels: ['Available', 'Used'],
                colors: ['#10B981', '#3B82F6'],
                legend: {
                    show: false
                },
                dataLabels: {
                    enabled: true,
                    formatter: function(val, opts) {
                        return Math.round(val) + '%';
                    },
                    style: {
                        fontSize: '14px',
                        fontWeight: 'bold',
                        colors: ['#fff']
                    },
                    dropShadow: {
                        enabled: false
                    }
                },
                plotOptions: {
                    pie: {
                        expandOnClick: false
                    }
                },
                tooltip: {
                    theme: isDark ? 'dark' : 'light',
                    y: {
                        formatter: function (val) {
                            return Math.round(val).toLocaleString() + ' tokens';
                        }
                    }
                },
                stroke: {
                    show: true,
                    width: 2,
                    colors: isDark ? ['#1F2937'] : ['#fff']
                }
            };

            this.tokenChart = new ApexCharts(document.querySelector("#tokenChart"), options);
            this.tokenChart.render();
        },

        updateTokenChart() {
            if (!this.tokenChart) return;

            this.tokenChart.updateSeries([
                this.metrics.tokens?.available || 0,
                this.metrics.tokens?.used || 0
            ]);
        },

        // Metrics Charts Initialization
        initMetricsCharts() {
            // Only initialize if we haven't already and charts exist in DOM
            if (!document.getElementById('pieChart')) return;

            this.initPieChart();
            this.initParetoChart();
            this.initAreaChart();
            this.initStackedAreaChart();
            this.initScatterChart();
            this.initRadarChart();
        },

        initPieChart() {
            const ctx = document.getElementById('pieChart');
            if (!ctx) return;

            const isDark = this.darkMode;
            new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['Completed', 'Active', 'Failed'],
                    datasets: [{
                        data: [
                            this.metrics.workers?.completed || 0,
                            this.metrics.workers?.active || 0,
                            this.metrics.workers?.failed || 0
                        ],
                        backgroundColor: [
                            'rgba(34, 197, 94, 0.8)',
                            'rgba(59, 130, 246, 0.8)',
                            'rgba(239, 68, 68, 0.8)'
                        ],
                        borderWidth: 2,
                        borderColor: isDark ? '#1f2937' : '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: isDark ? '#9ca3af' : '#4b5563' }
                        }
                    }
                }
            });
        },

        initParetoChart() {
            const ctx = document.getElementById('paretoChart');
            if (!ctx) return;

            // Calculate task types from tasks data
            const taskTypes = {};
            this.tasks.forEach(task => {
                if (task.status === 'completed') {
                    taskTypes[task.type] = (taskTypes[task.type] || 0) + 1;
                }
            });

            const sorted = Object.entries(taskTypes).sort((a, b) => b[1] - a[1]);
            const labels = sorted.map(([type]) => type);
            const values = sorted.map(([, count]) => count);

            // Calculate cumulative percentage
            const total = values.reduce((sum, val) => sum + val, 0);
            let cumulative = 0;
            const cumulativePercentages = values.map(val => {
                cumulative += val;
                return (cumulative / total) * 100;
            });

            const isDark = this.darkMode;
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Task Count',
                        data: values,
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        yAxisID: 'y',
                        order: 2
                    }, {
                        label: 'Cumulative %',
                        data: cumulativePercentages,
                        type: 'line',
                        borderColor: 'rgba(239, 68, 68, 1)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        yAxisID: 'y1',
                        order: 1,
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: isDark ? '#9ca3af' : '#4b5563' }
                        }
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            position: 'left',
                            ticks: { color: isDark ? '#9ca3af' : '#4b5563' },
                            grid: { color: isDark ? '#374151' : '#e5e7eb' }
                        },
                        y1: {
                            type: 'linear',
                            position: 'right',
                            min: 0,
                            max: 100,
                            ticks: {
                                color: isDark ? '#9ca3af' : '#4b5563',
                                callback: (val) => val + '%'
                            },
                            grid: { drawOnChartArea: false }
                        },
                        x: {
                            ticks: { color: isDark ? '#9ca3af' : '#4b5563' },
                            grid: { color: isDark ? '#374151' : '#e5e7eb' }
                        }
                    }
                }
            });
        },

        initAreaChart() {
            const ctx = document.getElementById('areaChart');
            if (!ctx) return;

            // Generate mock time series data for last 7 days
            const days = 7;
            const labels = [];
            const data = [];
            let cumulative = this.metrics.tokens?.used || 0;
            const dailyUsage = cumulative / days;

            for (let i = days; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                cumulative -= dailyUsage;
                data.push(Math.max(0, cumulative) + (dailyUsage * (days - i)));
            }

            const isDark = this.darkMode;
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Tokens Used',
                        data: data,
                        borderColor: 'rgba(59, 130, 246, 1)',
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: isDark ? '#9ca3af' : '#4b5563' }
                        }
                    },
                    scales: {
                        y: {
                            ticks: {
                                color: isDark ? '#9ca3af' : '#4b5563',
                                callback: (val) => val.toLocaleString()
                            },
                            grid: { color: isDark ? '#374151' : '#e5e7eb' }
                        },
                        x: {
                            ticks: { color: isDark ? '#9ca3af' : '#4b5563' },
                            grid: { color: isDark ? '#374151' : '#e5e7eb' }
                        }
                    }
                }
            });
        },

        initStackedAreaChart() {
            const ctx = document.getElementById('stackedAreaChart');
            if (!ctx) return;

            // Generate mock time series data for master agents
            const days = 7;
            const labels = [];
            const coordinatorData = [];
            const securityData = [];
            const developmentData = [];
            const inventoryData = [];

            for (let i = days; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                coordinatorData.push(Math.floor(Math.random() * 3) + 1);
                securityData.push(Math.floor(Math.random() * 4) + 1);
                developmentData.push(Math.floor(Math.random() * 3) + 1);
                inventoryData.push(Math.floor(Math.random() * 2));
            }

            const isDark = this.darkMode;
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Coordinator',
                        data: coordinatorData,
                        borderColor: 'rgba(59, 130, 246, 1)',
                        backgroundColor: 'rgba(59, 130, 246, 0.5)',
                        fill: true
                    }, {
                        label: 'Security',
                        data: securityData,
                        borderColor: 'rgba(249, 115, 22, 1)',
                        backgroundColor: 'rgba(249, 115, 22, 0.5)',
                        fill: true
                    }, {
                        label: 'Development',
                        data: developmentData,
                        borderColor: 'rgba(34, 197, 94, 1)',
                        backgroundColor: 'rgba(34, 197, 94, 0.5)',
                        fill: true
                    }, {
                        label: 'Inventory',
                        data: inventoryData,
                        borderColor: 'rgba(168, 85, 247, 1)',
                        backgroundColor: 'rgba(168, 85, 247, 0.5)',
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: isDark ? '#9ca3af' : '#4b5563' }
                        }
                    },
                    scales: {
                        y: {
                            stacked: true,
                            ticks: { color: isDark ? '#9ca3af' : '#4b5563' },
                            grid: { color: isDark ? '#374151' : '#e5e7eb' }
                        },
                        x: {
                            stacked: true,
                            ticks: { color: isDark ? '#9ca3af' : '#4b5563' },
                            grid: { color: isDark ? '#374151' : '#e5e7eb' }
                        }
                    }
                }
            });
        },

        initScatterChart() {
            const ctx = document.getElementById('scatterChart');
            if (!ctx) return;

            // Generate scatter data from completed workers
            const scatterData = this.workers
                .filter(w => w.status === 'completed' && w.duration_minutes && w.tokens_used)
                .map(w => ({
                    x: w.duration_minutes,
                    y: w.tokens_used
                }));

            const isDark = this.darkMode;
            new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Workers',
                        data: scatterData.length > 0 ? scatterData : [
                            { x: 5, y: 3000 }, { x: 10, y: 8000 }, { x: 5, y: 4000 },
                            { x: 10, y: 9000 }, { x: 5, y: 6000 }, { x: 5, y: 4000 }
                        ],
                        backgroundColor: 'rgba(59, 130, 246, 0.6)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: isDark ? '#9ca3af' : '#4b5563' }
                        }
                    },
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: 'Tokens Used',
                                color: isDark ? '#9ca3af' : '#4b5563'
                            },
                            ticks: {
                                color: isDark ? '#9ca3af' : '#4b5563',
                                callback: (val) => val.toLocaleString()
                            },
                            grid: { color: isDark ? '#374151' : '#e5e7eb' }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Duration (minutes)',
                                color: isDark ? '#9ca3af' : '#4b5563'
                            },
                            ticks: { color: isDark ? '#9ca3af' : '#4b5563' },
                            grid: { color: isDark ? '#374151' : '#e5e7eb' }
                        }
                    }
                }
            });
        },

        initRadarChart() {
            const ctx = document.getElementById('radarChart');
            if (!ctx) return;

            const successRate = this.metrics.workers?.successRate || 0;
            const efficiency = Math.min(100, (this.metrics.tokens?.available / this.metrics.tokens?.total) * 100);
            const speed = Math.min(100, (this.metrics.workers?.completed / Math.max(1, this.metrics.workers?.avgDuration)) * 10);
            const reliability = successRate;
            const activity = Math.min(100, ((this.metrics.tasks?.completed || 0) / Math.max(1, this.metrics.tasks?.total || 1)) * 100);

            const isDark = this.darkMode;
            new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: ['Success Rate', 'Efficiency', 'Speed', 'Reliability', 'Activity'],
                    datasets: [{
                        label: 'Current',
                        data: [successRate, efficiency, speed, reliability, activity],
                        borderColor: 'rgba(59, 130, 246, 1)',
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        pointBackgroundColor: 'rgba(59, 130, 246, 1)',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: 'rgba(59, 130, 246, 1)'
                    }, {
                        label: 'Target',
                        data: [95, 80, 85, 95, 90],
                        borderColor: 'rgba(34, 197, 94, 1)',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        borderDash: [5, 5],
                        pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                        pointBorderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: isDark ? '#9ca3af' : '#4b5563' }
                        }
                    },
                    scales: {
                        r: {
                            min: 0,
                            max: 100,
                            ticks: {
                                color: isDark ? '#9ca3af' : '#4b5563',
                                backdropColor: 'transparent'
                            },
                            grid: { color: isDark ? '#374151' : '#e5e7eb' },
                            pointLabels: { color: isDark ? '#9ca3af' : '#4b5563' }
                        }
                    }
                }
            });
        },

        // Navigation
        switchView(view) {
            this.currentView = view;

            // Fetch additional data if needed
            if (view === 'workers' && this.workers.length === 0) {
                this.fetchWorkers();
            }

            // Initialize metrics charts when switching to metrics view
            if (view === 'metrics') {
                this.$nextTick(() => {
                    this.initMetricsCharts();
                });
            }

            // Re-initialize Lucide icons for new content
            this.$nextTick(() => {
                lucide.createIcons();
            });
        },

        async fetchWorkers() {
            try {
                const res = await fetch('/api/workers');
                const data = await res.json();
                this.workers = [
                    ...(data.active_workers || []),
                    ...(data.completed_workers || []),
                    ...(data.failed_workers || [])
                ];
            } catch (error) {
                console.error('Error fetching workers:', error);
            }
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
        },

        formatEventType(type) {
            // Convert event type to human-readable format
            const typeMap = {
                'task_created': 'Task Created',
                'task_assigned': 'Task Assigned',
                'task_completed': 'Task Completed',
                'task_failed': 'Task Failed',
                'worker_started': 'Worker Started',
                'worker_completed': 'Worker Completed',
                'worker_failed': 'Worker Failed',
                'worker_spawned': 'Worker Spawned',
                'error': 'Error',
                'dashboard_event': 'System Event'
            };
            return typeMap[type] || type.replace(/_/g, ' ').toUpperCase();
        },

        formatEventMessage(event) {
            // Format event message based on type and data
            const data = event.data || {};

            switch (event.type) {
                case 'task_created':
                    return `Task Created: '${data.task_id || 'unknown'}${data.task_title ? ': ' + data.task_title : ''}'`;

                case 'task_assigned':
                    return `Task Assigned: '${data.task_id || 'unknown'}' → ${data.assigned_to || 'unknown'}`;

                case 'task_completed':
                    return `Task Completed: '${data.task_id || 'unknown'}${data.task_title ? ': ' + data.task_title : ''}' ✓`;

                case 'task_failed':
                    return `Task Failed: '${data.task_id || 'unknown'}${data.task_title ? ': ' + data.task_title : ''}' ✗`;

                case 'worker_started':
                    return `Worker Started: ${data.worker_id || 'unknown'} (${data.worker_type || 'N/A'})`;

                case 'worker_completed':
                    return `Worker Completed: ${data.worker_id || 'unknown'} (${data.duration || 'N/A'})`;

                case 'worker_failed':
                    return `Worker Failed: ${data.worker_id || 'unknown'}`;

                default:
                    return event.message || JSON.stringify(data);
            }
        },

        // Token Budget helpers
        getTimeUntilReset() {
            const now = new Date();
            const midnight = new Date(now);
            midnight.setHours(24, 0, 0, 0); // Next midnight

            const diff = midnight - now;
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

            return `${hours}h ${minutes}m`;
        },

    };
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    const app = Alpine.raw(document.body._x_dataStack[0]);
    if (app && app.ws) {
        app.ws.close();
    }
});
