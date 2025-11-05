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
        gitOperations: [], // Git commit/push operations
        streams: null, // Workforce streams data

        // Historical Analytics
        analyticsTimeRange: '24h',
        analyticsCharts: {
            successRate: null,
            throughput: null,
            completionTime: null,
            activeWorkers: null
        },

        // Watch for view changes to reinitialize icons
        changeView(view) {
            this.currentView = view;
            // Reinitialize Lucide icons after view change
            this.$nextTick(() => {
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        },

        // Computed properties
        get sortedTasks() {
            // Sort tasks by created_at in descending order (most recent first)
            return [...this.tasks].sort((a, b) => {
                const dateA = new Date(a.created_at || 0);
                const dateB = new Date(b.created_at || 0);
                return dateB - dateA; // Descending order
            });
        },

        // WebSocket
        ws: null,
        reconnectInterval: null,

        // Charts
        tokenChart: null,

        // Initialize
        async init() {
            console.log('🚀 Initializing dashboard v2...');

            try {
                // Apply theme
                console.log('Applying theme...');
                this.applyTheme();

                // Initialize Lucide icons
                console.log('Initializing Lucide icons...');
                lucide.createIcons();

                // Connect WebSocket
                console.log('Connecting WebSocket...');
                this.connectWebSocket();

                // Fetch initial data
                console.log('Fetching initial data...');
                await this.fetchInitialData();

                // Start polling
                console.log('Starting polling...');
                this.startPolling();

                // Initialize charts
                console.log('Initializing charts...');
                this.$nextTick(() => {
                    this.initCharts();
                });

                // Add click listener to close period selector when clicking outside
                document.addEventListener('click', (e) => {
                    if (this.showPeriodSelector && !e.target.closest('.period-selector-card')) {
                        this.showPeriodSelector = false;
                    }
                });

                console.log('✅ Dashboard initialization complete!');
                this.loading = false;
            } catch (error) {
                console.error('❌ Error during dashboard initialization:', error);
                alert('Dashboard initialization failed. Check console for details.');
                this.loading = false;
            }
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
                // Refetch workers when metrics update (worker count may have changed)
                this.fetchWorkers();
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
                console.log('Starting fetchInitialData...');

                // Fetch metrics with selected period
                console.log('Fetching metrics...');
                const metricsRes = await fetch(`/api/metrics?period=${this.successRatePeriod}`);
                const metrics = await metricsRes.json();
                this.updateMetrics(metrics);
                console.log('Metrics loaded:', metrics);

                // Fetch daemon status
                console.log('Fetching daemon status...');
                const daemonRes = await fetch('/api/daemon/status');
                this.daemon = await daemonRes.json();
                console.log('Daemon status loaded');

                // Fetch tasks
                console.log('Fetching tasks...');
                const tasksRes = await fetch('/api/tasks');
                const tasksData = await tasksRes.json();
                this.tasks = tasksData.tasks || [];
                console.log('Tasks loaded:', this.tasks.length, 'tasks');

                // Fetch workers
                console.log('Fetching workers...');
                await this.fetchWorkers();
                console.log('Workers loaded');

                // Fetch recent events
                console.log('Fetching events...');
                const eventsRes = await fetch('/api/events?limit=50');
                const eventsData = await eventsRes.json();
                this.events = eventsData.events || [];
                console.log('Events loaded:', this.events.length, 'events');

                // Fetch git operations
                console.log('Fetching git operations...');
                const gitOpsRes = await fetch('/api/git-operations');
                const gitOpsData = await gitOpsRes.json();
                this.gitOperations = gitOpsData.operations || [];
                console.log('Git operations loaded:', this.gitOperations.length, 'operations');

                // Fetch workforce streams
                console.log('Fetching workforce streams...');
                await this.fetchStreams();
                console.log('Workforce streams loaded');

                console.log('Initial data loaded successfully!');
            } catch (error) {
                console.error('Error fetching initial data:', error);
                alert('Error loading dashboard data. Check console for details.');
            }
        },

        async fetchStreams() {
            try {
                const response = await fetch('/api/streams');
                this.streams = await response.json();
            } catch (error) {
                console.error('Error fetching workforce streams:', error);
                this.streams = null;
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

            // Poll events every 10 seconds for real-time updates
            setInterval(async () => {
                try {
                    const res = await fetch('/api/events?limit=50');
                    const data = await res.json();
                    this.events = data.events || [];
                } catch (error) {
                    console.error('Error polling events:', error);
                }
            }, 10000);

            // Poll git operations every 10 seconds for real-time git push updates
            setInterval(async () => {
                try {
                    const res = await fetch('/api/git-operations');
                    const data = await res.json();
                    this.gitOperations = data.operations || [];
                } catch (error) {
                    console.error('Error polling git operations:', error);
                }
            }, 10000);
        },

        // Charts
        initCharts() {
            this.initTokenChart();
            this.initAnalyticsCharts();
        },

        // Initialize all historical analytics charts
        initAnalyticsCharts() {
            this.$nextTick(() => {
                this.initSuccessRateTrendChart();
                this.initThroughputTrendChart();
                this.initCompletionTimeTrendChart();
                this.initActiveWorkersTrendChart();
            });
        },

        // Update analytics charts when time range changes
        updateAnalyticsCharts() {
            this.initAnalyticsCharts();
        },

        // Generate time-based data for analytics charts
        generateTimeSeriesData(timeRange) {
            const now = Date.now();
            const ranges = {
                '1h': { duration: 60 * 60 * 1000, points: 12, interval: 5 * 60 * 1000 },
                '6h': { duration: 6 * 60 * 60 * 1000, points: 12, interval: 30 * 60 * 1000 },
                '24h': { duration: 24 * 60 * 60 * 1000, points: 24, interval: 60 * 60 * 1000 },
                '7d': { duration: 7 * 24 * 60 * 60 * 1000, points: 14, interval: 12 * 60 * 60 * 1000 },
                '30d': { duration: 30 * 24 * 60 * 60 * 1000, points: 30, interval: 24 * 60 * 60 * 1000 }
            };

            const range = ranges[timeRange] || ranges['24h'];
            const timestamps = [];
            const labels = [];

            // Generate timestamps and labels
            for (let i = 0; i < range.points; i++) {
                const timestamp = now - range.duration + (i * range.interval);
                timestamps.push(timestamp);
                const date = new Date(timestamp);

                // Format label based on time range
                let label;
                if (timeRange === '1h' || timeRange === '6h') {
                    label = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                } else if (timeRange === '24h') {
                    label = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                } else {
                    label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }
                labels.push(label);
            }

            // Filter events within time range
            const relevantEvents = this.events.filter(e => {
                const eventTime = new Date(e.timestamp).getTime();
                return eventTime >= (now - range.duration) && eventTime <= now;
            });

            return { timestamps, labels, events: relevantEvents, range };
        },

        initSuccessRateTrendChart() {
            const canvas = document.getElementById('successRateTrendChart');
            if (!canvas) return;

            if (this.analyticsCharts.successRate) {
                this.analyticsCharts.successRate.destroy();
            }

            const { labels, timestamps, events } = this.generateTimeSeriesData(this.analyticsTimeRange);

            // Calculate success rate for each time bucket
            const data = timestamps.map((ts, i) => {
                const nextTs = timestamps[i + 1] || Date.now();
                const bucketEvents = events.filter(e => {
                    const eTime = new Date(e.timestamp).getTime();
                    return eTime >= ts && eTime < nextTs && (e.type?.includes('worker'));
                });

                const completed = bucketEvents.filter(e => e.type?.includes('completed') || e.type?.includes('success')).length;
                const failed = bucketEvents.filter(e => e.type?.includes('failed') || e.type?.includes('error')).length;
                const total = completed + failed;

                return total > 0 ? (completed / total * 100) : null;
            });

            const isDark = this.darkMode;
            this.analyticsCharts.successRate = new Chart(canvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Success Rate (%)',
                        data,
                        borderColor: '#10b981',
                        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.2)',
                        fill: true,
                        tension: 0.4,
                        spanGaps: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => context.parsed.y !== null ? `${context.parsed.y.toFixed(1)}%` : 'No data'
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: { color: isDark ? '#9CA3AF' : '#6B7280', callback: (value) => value + '%' },
                            grid: { color: isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)' }
                        },
                        x: {
                            ticks: { color: isDark ? '#9CA3AF' : '#6B7280', maxRotation: 45, minRotation: 45 },
                            grid: { display: false }
                        }
                    }
                }
            });
        },

        initThroughputTrendChart() {
            const canvas = document.getElementById('throughputTrendChart');
            if (!canvas) return;

            if (this.analyticsCharts.throughput) {
                this.analyticsCharts.throughput.destroy();
            }

            const { labels, timestamps, events } = this.generateTimeSeriesData(this.analyticsTimeRange);

            // Count task completions per time bucket
            const data = timestamps.map((ts, i) => {
                const nextTs = timestamps[i + 1] || Date.now();
                const bucketEvents = events.filter(e => {
                    const eTime = new Date(e.timestamp).getTime();
                    return eTime >= ts && eTime < nextTs &&
                           (e.type?.includes('task') && (e.type?.includes('completed') || e.type?.includes('done')));
                });
                return bucketEvents.length;
            });

            const isDark = this.darkMode;
            this.analyticsCharts.throughput = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Tasks Completed',
                        data,
                        backgroundColor: isDark ? 'rgba(251, 191, 36, 0.6)' : 'rgba(251, 191, 36, 0.8)',
                        borderColor: '#f59e0b',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { color: isDark ? '#9CA3AF' : '#6B7280', stepSize: 1 },
                            grid: { color: isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)' }
                        },
                        x: {
                            ticks: { color: isDark ? '#9CA3AF' : '#6B7280', maxRotation: 45, minRotation: 45 },
                            grid: { display: false }
                        }
                    }
                }
            });
        },

        initCompletionTimeTrendChart() {
            const canvas = document.getElementById('completionTimeTrendChart');
            if (!canvas) return;

            if (this.analyticsCharts.completionTime) {
                this.analyticsCharts.completionTime.destroy();
            }

            const { labels, timestamps } = this.generateTimeSeriesData(this.analyticsTimeRange);

            // Calculate average completion time (simulated from worker data)
            const data = timestamps.map(() => {
                const avgTime = this.workers.length > 0
                    ? this.workers.reduce((sum, w) => sum + (w.duration_minutes || 0), 0) / this.workers.length
                    : 0;
                return avgTime + (Math.random() * 5 - 2.5); // Add some variance
            });

            const isDark = this.darkMode;
            this.analyticsCharts.completionTime = new Chart(canvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Avg Time (min)',
                        data,
                        borderColor: '#3b82f6',
                        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.2)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => `${context.parsed.y.toFixed(1)} min`
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { color: isDark ? '#9CA3AF' : '#6B7280', callback: (value) => value.toFixed(0) + 'm' },
                            grid: { color: isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)' }
                        },
                        x: {
                            ticks: { color: isDark ? '#9CA3AF' : '#6B7280', maxRotation: 45, minRotation: 45 },
                            grid: { display: false }
                        }
                    }
                }
            });
        },

        initActiveWorkersTrendChart() {
            const canvas = document.getElementById('activeWorkersTrendChart');
            if (!canvas) return;

            if (this.analyticsCharts.activeWorkers) {
                this.analyticsCharts.activeWorkers.destroy();
            }

            const { labels, timestamps, events } = this.generateTimeSeriesData(this.analyticsTimeRange);

            // Count active workers at each time point
            const data = timestamps.map((ts, i) => {
                const nextTs = timestamps[i + 1] || Date.now();
                const started = events.filter(e => {
                    const eTime = new Date(e.timestamp).getTime();
                    return eTime >= ts && eTime < nextTs && e.type?.includes('worker_started');
                }).length;

                return started > 0 ? started : this.metrics.workers?.active || 0;
            });

            const isDark = this.darkMode;
            this.analyticsCharts.activeWorkers = new Chart(canvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Active Workers',
                        data,
                        borderColor: '#a855f7',
                        backgroundColor: isDark ? 'rgba(168, 85, 247, 0.1)' : 'rgba(168, 85, 247, 0.2)',
                        fill: true,
                        tension: 0.4,
                        stepped: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { color: isDark ? '#9CA3AF' : '#6B7280', stepSize: 1 },
                            grid: { color: isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)' }
                        },
                        x: {
                            ticks: { color: isDark ? '#9CA3AF' : '#6B7280', maxRotation: 45, minRotation: 45 },
                            grid: { display: false }
                        }
                    }
                }
            });
        },

        initTokenChart() {
            // Check if the chart element exists
            const chartElement = document.querySelector("#tokenChart");
            if (!chartElement) {
                console.log('Token chart element not found, skipping initialization');
                return;
            }

            // Destroy existing chart if it exists to prevent duplicates
            if (this.tokenChart) {
                this.tokenChart.destroy();
                this.tokenChart = null;
            }

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

            this.tokenChart = new ApexCharts(chartElement, options);
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
            this.initMasterEfficiencyChart();
            this.initWorkerEfficiencyChart();
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

        async initAreaChart() {
            const ctx = document.getElementById('areaChart');
            if (!ctx) return;

            // Fetch historical data from API
            let labels = [];
            let data = [];

            try {
                const response = await fetch('/api/metrics/history?range=24h');
                const historyData = await response.json();

                if (historyData.snapshots && historyData.snapshots.length > 0) {
                    // Extract labels and token usage data
                    labels = historyData.snapshots.map(s => {
                        const date = new Date(s.timestamp);
                        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    });
                    data = historyData.snapshots.map(s => s.tokens.total_used);
                } else {
                    // Fallback to current metric as single data point
                    labels = ['Now'];
                    data = [this.metrics.tokens?.used || 0];
                }
            } catch (error) {
                console.error('Error fetching historical token data:', error);
                // Fallback to current metric
                labels = ['Now'];
                data = [this.metrics.tokens?.used || 0];
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

        async initStackedAreaChart() {
            const ctx = document.getElementById('stackedAreaChart');
            if (!ctx) return;

            // Fetch historical data from API
            let labels = [];
            let activeData = [];
            let completedData = [];
            let failedData = [];

            try {
                const response = await fetch('/api/metrics/history?range=24h');
                const historyData = await response.json();

                if (historyData.snapshots && historyData.snapshots.length > 0) {
                    // Extract labels and worker activity data
                    labels = historyData.snapshots.map(s => {
                        const date = new Date(s.timestamp);
                        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    });
                    activeData = historyData.snapshots.map(s => s.workers.active);
                    completedData = historyData.snapshots.map(s => s.workers.completed);
                    failedData = historyData.snapshots.map(s => s.workers.failed);
                } else {
                    // Fallback to current metrics
                    labels = ['Now'];
                    activeData = [this.metrics.workers?.active || 0];
                    completedData = [this.metrics.workers?.completed || 0];
                    failedData = [this.metrics.workers?.failed || 0];
                }
            } catch (error) {
                console.error('Error fetching historical worker data:', error);
                // Fallback to current metrics
                labels = ['Now'];
                activeData = [this.metrics.workers?.active || 0];
                completedData = [this.metrics.workers?.completed || 0];
                failedData = [this.metrics.workers?.failed || 0];
            }

            const isDark = this.darkMode;
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Active Workers',
                        data: activeData,
                        borderColor: 'rgba(59, 130, 246, 1)',
                        backgroundColor: 'rgba(59, 130, 246, 0.5)',
                        fill: true
                    }, {
                        label: 'Completed Workers',
                        data: completedData,
                        borderColor: 'rgba(34, 197, 94, 1)',
                        backgroundColor: 'rgba(34, 197, 94, 0.5)',
                        fill: true
                    }, {
                        label: 'Failed Workers',
                        data: failedData,
                        borderColor: 'rgba(239, 68, 68, 1)',
                        backgroundColor: 'rgba(239, 68, 68, 0.5)',
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

        initMasterEfficiencyChart() {
            const ctx = document.getElementById('masterEfficiencyChart');
            if (!ctx) return;

            const isDark = this.darkMode;
            const masterAgents = this.metrics.masters || {};

            // Calculate efficiency (tokens per task) for each master
            const efficiencyData = Object.entries(masterAgents)
                .filter(([name, data]) => data.tasksHandled > 0) // Only show masters with tasks
                .map(([name, data]) => ({
                    name: name.charAt(0).toUpperCase() + name.slice(1),
                    efficiency: Math.round(data.used / data.tasksHandled),
                    used: data.used,
                    tasks: data.tasksHandled
                }))
                .sort((a, b) => b.efficiency - a.efficiency); // Sort by efficiency (highest first for visual impact)

            // If no data, show placeholder
            if (efficiencyData.length === 0) {
                efficiencyData.push(
                    { name: 'Coordinator', efficiency: 5000, used: 5000, tasks: 1 },
                    { name: 'Development', efficiency: 4500, used: 9000, tasks: 2 },
                    { name: 'Security', efficiency: 2500, used: 2500, tasks: 1 }
                );
            }

            const labels = efficiencyData.map(d => d.name);
            const data = efficiencyData.map(d => d.efficiency);

            // Assign distinct colors for each master agent
            const colorMap = {
                'Coordinator': 'rgba(59, 130, 246, 0.8)',    // Blue
                'Security': 'rgba(249, 115, 22, 0.8)',       // Orange
                'Development': 'rgba(34, 197, 94, 0.8)',     // Green
                'Inventory': 'rgba(239, 68, 68, 0.8)',       // Red
                'Cicd': 'rgba(168, 85, 247, 0.8)'            // Purple
            };
            const colors = labels.map(name => colorMap[name] || 'rgba(107, 114, 128, 0.8)'); // Gray fallback

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Tokens per Task',
                        data: data,
                        backgroundColor: colors,
                        borderWidth: 0,
                        barThickness: 20
                    }]
                },
                options: {
                    indexAxis: 'y', // Horizontal bars
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const dataPoint = efficiencyData[context.dataIndex];
                                    return [
                                        `Efficiency: ${context.parsed.x.toLocaleString()} tokens/task`,
                                        `Total Tokens: ${dataPoint.used.toLocaleString()}`,
                                        `Tasks Handled: ${dataPoint.tasks}`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: {
                                color: isDark ? '#9ca3af' : '#4b5563',
                                callback: (val) => val.toLocaleString()
                            },
                            grid: { color: isDark ? '#374151' : '#e5e7eb' }
                        },
                        y: {
                            ticks: { color: isDark ? '#9ca3af' : '#4b5563' },
                            grid: { display: false }
                        }
                    }
                }
            });
        },

        initWorkerEfficiencyChart() {
            const ctx = document.getElementById('workerEfficiencyChart');
            if (!ctx) return;

            const isDark = this.darkMode;

            // Calculate efficiency (tokens per minute) for completed workers
            const workerEfficiency = this.workers
                .filter(w => w.status === 'completed' && w.duration_minutes > 0 && w.tokens_used > 0)
                .map(w => ({
                    id: w.worker_id,
                    type: w.type || 'worker',
                    efficiency: Math.round(w.tokens_used / w.duration_minutes),
                    tokens: w.tokens_used,
                    duration: w.duration_minutes
                }))
                .sort((a, b) => b.efficiency - a.efficiency) // Sort by efficiency
                .slice(0, 8); // Show top 8 workers

            // If no data, show placeholder
            if (workerEfficiency.length === 0) {
                workerEfficiency.push(
                    { id: 'implementation-worker', type: 'implementation', efficiency: 900, tokens: 9000, duration: 10 },
                    { id: 'test-worker', type: 'test', efficiency: 600, tokens: 3000, duration: 5 },
                    { id: 'documentation-worker', type: 'documentation', efficiency: 500, tokens: 2500, duration: 5 }
                );
            }

            const labels = workerEfficiency.map(w => {
                // Shorten worker type for display
                const type = w.type.replace('-worker', '').replace(/-/g, ' ');
                return type.charAt(0).toUpperCase() + type.slice(1);
            });
            const data = workerEfficiency.map(w => w.efficiency);

            // Color code: green (efficient) to red (inefficient)
            const colors = data.map((val, idx) => {
                const max = Math.max(...data);
                const ratio = val / max;
                if (ratio <= 0.5) return 'rgba(34, 197, 94, 0.8)'; // Green
                if (ratio <= 0.75) return 'rgba(59, 130, 246, 0.8)'; // Blue
                return 'rgba(168, 85, 247, 0.8)'; // Purple
            });

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Tokens per Minute',
                        data: data,
                        backgroundColor: colors,
                        borderWidth: 0,
                        barThickness: 20
                    }]
                },
                options: {
                    indexAxis: 'y', // Horizontal bars
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const dataPoint = workerEfficiency[context.dataIndex];
                                    return [
                                        `Efficiency: ${context.parsed.x.toLocaleString()} tokens/min`,
                                        `Total Tokens: ${dataPoint.tokens.toLocaleString()}`,
                                        `Duration: ${dataPoint.duration} min`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: {
                                color: isDark ? '#9ca3af' : '#4b5563',
                                callback: (val) => val.toLocaleString()
                            },
                            grid: { color: isDark ? '#374151' : '#e5e7eb' }
                        },
                        y: {
                            ticks: { color: isDark ? '#9ca3af' : '#4b5563' },
                            grid: { display: false }
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

            // Fetch session-only events for Events page
            if (view === 'events') {
                this.fetchSessionEvents();
            }

            // Initialize metrics charts when switching to metrics view
            if (view === 'metrics') {
                this.$nextTick(() => {
                    this.initMetricsCharts();
                });
            }

            // Reinitialize Lucide icons after view switch
            this.$nextTick(() => {
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });

            // Re-initialize Lucide icons for new content
            this.$nextTick(() => {
                lucide.createIcons();
            });
        },

        async fetchSessionEvents() {
            try {
                const res = await fetch('/api/events?limit=100&session=current');
                const data = await res.json();
                this.events = data.events || [];
            } catch (error) {
                console.error('Error fetching session events:', error);
            }
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
                'git_push_success': 'Git Push',
                'git_push_failed': 'Git Push Failed',
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

        // Git operations helpers
        getTaskCommits(taskId) {
            // Find git operations related to this task
            // Task ID might be in worker_id or we need to match by timestamp/context
            if (!taskId) return [];

            return this.gitOperations
                .filter(op => {
                    // Match if worker_id contains the task ID
                    return op.worker_id && op.worker_id.includes(taskId);
                })
                .map(op => {
                    // Extract commit hash from details
                    const match = op.details && op.details.match(/Commit: ([a-f0-9]{7,})/);
                    return match ? match[1] : null;
                })
                .filter(hash => hash !== null);
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
