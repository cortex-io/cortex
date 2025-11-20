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
        currentView: 'overview', // overview, workers, tasks, events, masters, admin
        successRatePeriod: localStorage.getItem('successRatePeriod') || 'all_time',
        showPeriodSelector: false,
        mobileMenuOpen: false, // Mobile sidebar menu state

        // Card visibility toggles
        cardVisibility: {
            activeWorkers: localStorage.getItem('card_activeWorkers') !== 'false',
            successRate: localStorage.getItem('card_successRate') !== 'false',
            tasksInProgress: localStorage.getItem('card_tasksInProgress') !== 'false',
            workerDaemon: localStorage.getItem('card_workerDaemon') !== 'false',
            pmDaemon: localStorage.getItem('card_pmDaemon') !== 'false',
            lastPR: localStorage.getItem('card_lastPR') !== 'false',
            lastRepoSync: localStorage.getItem('card_lastRepoSync') !== 'false',
            dashboardServer: localStorage.getItem('card_dashboardServer') !== 'false'
        },

        // Loading states for different components
        loadingStates: {
            workers: false,
            tasks: false,
            metrics: false,
            charts: false
        },

        // Performance: Debouncing and caching
        updateDebounceTimer: null,
        updateDebounceDelay: 300, // ms - wait 300ms after last message before updating UI
        messageQueue: [], // Queue messages for batch processing
        cache: {
            metrics: { data: null, timestamp: 0, ttl: 5000 }, // 5 second cache
            workers: { data: null, timestamp: 0, ttl: 3000 },  // 3 second cache
            tasks: { data: null, timestamp: 0, ttl: 3000 }
        },

        // Data
        metrics: {
            workers: { active: 0, completed: 0, failed: 0, successRate: 0, avgDuration: 0 },
            tasks: { pending: 0, inProgress: 0, completed: 0, total: 0 },
            tokens: { total: 0, used: 0, available: 0, usagePercentage: 0 }
        },
        daemon: null,
        pmDaemon: null,
        healthDaemon: null,
        metricsDaemon: null,
        coordinatorDaemon: null,
        integrationValidatorDaemon: null,
        terminalSettings: {
            terminal_windows_enabled: true,
            headless_mode: false,
            auto_close_duration_minutes: 0
        },
        tasks: [],
        events: [],
        workers: [], // Will store worker pool data
        gitOperations: [], // Git commit/push operations
        streams: null, // Workforce streams data
        healthAlerts: [], // Health alerts
        alertNotifications: [], // Active alert notifications (for bottom overlay)
        expandedAlertIds: [], // Track which alerts are expanded
        gitInfo: { lastCommit: { message: '', timeAgo: '' }, lastSync: '' },
        dashboardServerStatus: { status: 'running', pid: null, port: 3000 },
        eventLogInfo: {
            created_date: null,
            event_count: 0,
            file_size: null
        },

        // Governance data
        governanceData: {
            dashboard: null,
            gdpr: null,
            soc2: null,
            internal: null,
            metrics: null,
            trends: null
        },
        governanceLoading: false,

        // Pagination
        pagination: {
            workers: { currentPage: 1, itemsPerPage: 50, total: 0 },
            tasks: { currentPage: 1, itemsPerPage: 50, total: 0 },
            events: { currentPage: 1, itemsPerPage: 100, total: 0 }
        },

        // Historical Analytics
        analyticsTimeRange: '24h',
        analyticsCharts: {
            successRate: null,
            throughput: null,
            completionTime: null,
            activeWorkers: null
        },

        // Gantt Chart
        ganttTimeRange: '24h',
        ganttAutoScroll: true,
        ganttChart: null,

        // Heatmap
        heatmapTimeRange: '7d',
        heatmapData: {
            coordinator: [],
            development: [],
            security: [],
            inventory: []
        },

        // API Explorer
        apiExplorer: {
            endpoints: [],
            testResults: {},
            requestHistory: [],
            selectedEndpoint: null,
            selectedCodeLang: 'python',
            isTestingAll: false,
            testAllProgress: 0,
            testAllTotal: 0,
            expandedCategories: {},
            expandedEndpoints: {},
            endpointParams: {} // Store parameter values for each endpoint
        },

        // DDQD Testing
        ddqd: {
            testDuration: 5,
            maxWorkers: 15,
            version: 'v5',
            verbose: false,
            currentTest: null,
            testOutput: [],
            progress: 0,
            autoScroll: true,
            history: [],
            pollInterval: null,
            schedule: {
                enabled: false,
                cronExpression: '0 2 * * *',
                nextRun: null
            }
        },

        // Alerting System
        activeAlerts: [],
        alertThresholds: {
            errorRate: { enabled: true, threshold: 20, severity: 'critical' }, // % errors
            workerFailureRate: { enabled: true, threshold: 30, severity: 'warning' }, // % failures
            slowResponseTime: { enabled: true, threshold: 5, severity: 'warning' }, // minutes
            lowSuccessRate: { enabled: true, threshold: 70, severity: 'critical' }, // % success
            highActiveWorkers: { enabled: false, threshold: 20, severity: 'info' } // count
        },

        // MoE Intelligence Data
        moeMetrics: {
            totalRoutes: 0,
            avgConfidence: 0,
            parallelRoutes: 0,
            accuracy: 0,
            expertCounts: {
                development: 0,
                security: 0,
                inventory: 0
            }
        },
        moeRoutingDecisions: [],
        moePoolMetrics: {
            active_workers: 0,
            max_capacity: 64,
            activation_rate: 0,
            target_workers: 0,
            utilization: 0,
            moe_analogy: {
                active_params: 'No data'
            }
        },
        moeLearningMetrics: {
            total_tasks: 0,
            success_rate: 0,
            avg_time: 0,
            learned_keywords: 0,
            experts: {
                development: { tasks: 0, success_rate: 0, avg_time: 0 },
                security: { tasks: 0, success_rate: 0, avg_time: 0 },
                inventory: { tasks: 0, success_rate: 0, avg_time: 0 }
            }
        },
        moeLearningInsights: [],
        learningTaskActivating: false,
        learningTaskActive: false,
        learningTaskMessage: '',
        learningTaskSuccess: false,
        learningTaskStatus: null, // null, 'pending', 'assigned', 'in_progress', 'completed', 'failed'
        learningTaskId: null,
        learningTaskError: null,
        learningDeliverables: [],
        selectedDeliverable: null,
        deliverableContent: null,
        viewingDeliverable: false,

        // MoE Analytics Widgets
        moeAnalytics: {
            routingMetrics: {
                accuracy: '--',
                avgConfidence: '--',
                decisions24h: '--',
                singleExpertCount: '--',
                multiExpertCount: '--',
                sparseActivation: '--',
                status: 'healthy'
            },
            confidenceDistribution: {
                ranges: []
            },
            poolUtilization: {
                activeWorkers: '--',
                poolCapacity: 64,
                status: 'healthy',
                development: 0,
                security: 0,
                inventory: 0,
                devPct: 0,
                secPct: 0,
                invPct: 0
            },
            confidenceChart: null,
            lastUpdate: '--'
        },

        // Watch for view changes to reinitialize icons
        changeView(view) {
            this.currentView = view;
            // Initialize MoE Analytics if switching to that view
            if (view === 'moe-analytics') {
                this.$nextTick(() => {
                    this.initMoeAnalytics();
                });
            }
            // Reinitialize Lucide icons after view change
            this.$nextTick(() => {
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        },

        // Toggle card visibility
        toggleCard(cardName) {
            this.cardVisibility[cardName] = !this.cardVisibility[cardName];
            localStorage.setItem('card_' + cardName, this.cardVisibility[cardName]);
            // Reinitialize icons after toggle
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

        // Paginated data
        get paginatedWorkers() {
            const start = (this.pagination.workers.currentPage - 1) * this.pagination.workers.itemsPerPage;
            const end = start + this.pagination.workers.itemsPerPage;
            this.pagination.workers.total = this.workers.length;
            return this.workers.slice(start, end);
        },

        get paginatedTasks() {
            const sorted = this.sortedTasks;
            const start = (this.pagination.tasks.currentPage - 1) * this.pagination.tasks.itemsPerPage;
            const end = start + this.pagination.tasks.itemsPerPage;
            this.pagination.tasks.total = sorted.length;
            return sorted.slice(start, end);
        },

        get paginatedEvents() {
            const start = (this.pagination.events.currentPage - 1) * this.pagination.events.itemsPerPage;
            const end = start + this.pagination.events.itemsPerPage;
            this.pagination.events.total = this.events.length;
            return this.events.slice(start, end);
        },

        // Pagination helpers
        getTotalPages(type) {
            return Math.ceil(this.pagination[type].total / this.pagination[type].itemsPerPage);
        },

        changePage(type, page) {
            const totalPages = this.getTotalPages(type);
            if (page < 1 || page > totalPages) return;
            this.pagination[type].currentPage = page;
        },

        nextPage(type) {
            this.changePage(type, this.pagination[type].currentPage + 1);
        },

        prevPage(type) {
            this.changePage(type, this.pagination[type].currentPage - 1);
        },

        // WebSocket
        ws: null,
        reconnectInterval: null,

        // Charts
        tokenChart: null,

        // Lazy loading tracking
        chartsInitialized: {
            overview: false,  // token chart
            metrics: false,   // all metrics page charts
            analytics: false  // analytics charts
        },

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
                // Load terminal settings
                console.log('Loading terminal settings...');
                await this.loadTerminalSettings();

                // Load governance data
                console.log('Loading governance data...');
                await this.refreshGovernanceData();


                // Start polling
                console.log('Starting polling...');
                this.startPolling();

                // Initialize charts
                console.log('Initializing charts...');
                this.$nextTick(() => {
                    this.initCharts();
                });

                // Initialize API Explorer
                console.log('Initializing API Explorer...');
                this.initApiExplorer();

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

        // Performance: Caching helpers
        getCachedData(key) {
            const cached = this.cache[key];
            if (!cached) return null;

            const now = Date.now();
            const age = now - cached.timestamp;

            // Return cached data if still fresh
            if (cached.data && age < cached.ttl) {
                return cached.data;
            }

            return null;
        },

        setCachedData(key, data) {
            if (!this.cache[key]) {
                this.cache[key] = { data: null, timestamp: 0, ttl: 5000 };
            }
            this.cache[key].data = data;
            this.cache[key].timestamp = Date.now();
        },

        // Performance: Debounced update
        scheduleUpdate() {
            // Clear existing timer
            if (this.updateDebounceTimer) {
                clearTimeout(this.updateDebounceTimer);
            }

            // Schedule new update
            this.updateDebounceTimer = setTimeout(() => {
                this.processMessageQueue();
            }, this.updateDebounceDelay);
        },

        processMessageQueue() {
            if (this.messageQueue.length === 0) return;

            // Process all queued messages in batch
            const messages = [...this.messageQueue];
            this.messageQueue = [];

            // Group messages by type for efficient processing
            const grouped = {};
            messages.forEach(msg => {
                if (!grouped[msg.type]) grouped[msg.type] = [];
                grouped[msg.type].push(msg);
            });

            // Process each type
            Object.keys(grouped).forEach(type => {
                const msgs = grouped[type];
                // For most types, we only care about the latest message
                const latestMsg = msgs[msgs.length - 1];
                this.processWebSocketMessage(latestMsg);
            });
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
                    // Queue message for batch processing
                    this.messageQueue.push(message);
                    // Schedule debounced update
                    this.scheduleUpdate();
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

        processWebSocketMessage(message) {
            if (message.type === 'initial' || message.type === 'update') {
                this.updateMetrics(message.data);
                // Refetch workers when metrics update (worker count may have changed)
                this.fetchWorkers();
            } else if (message.type === 'event') {
                this.addEvent(message.event);
            } else if (message.type === 'daemon_status') {
                this.daemon = message.data;
            } else if (message.type === 'pm_daemon_status') {
                this.pmDaemon = message.data;
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

                // Fetch PM daemon status
                console.log('Fetching PM daemon status...');
                const pmDaemonRes = await fetch('/api/pm-daemon/status');
                this.pmDaemon = await pmDaemonRes.json();
                console.log('PM daemon status loaded');

                // Fetch Health daemon status
                console.log('Fetching Health daemon status...');
                const healthDaemonRes = await fetch('/api/health-daemon/status');
                this.healthDaemon = await healthDaemonRes.json();
                console.log('Health daemon status loaded');

                // Fetch Metrics daemon status
                console.log('Fetching Metrics daemon status...');
                const metricsDaemonRes = await fetch('/api/metrics-daemon/status');
                this.metricsDaemon = await metricsDaemonRes.json();
                console.log('Metrics daemon status loaded');

                // Fetch Coordinator daemon status
                console.log('Fetching Coordinator daemon status...');
                const coordinatorDaemonRes = await fetch('/api/coordinator-daemon/status');
                this.coordinatorDaemon = await coordinatorDaemonRes.json();
                console.log('Coordinator daemon status loaded');

                // Fetch Integration Validator status
                console.log('Fetching Integration Validator status...');
                const integrationValidatorRes = await fetch('/api/integration-validator/status');
                this.integrationValidatorDaemon = await integrationValidatorRes.json();
                console.log('Integration Validator status loaded');

                // Fetch tasks
                console.log('Fetching tasks...');
                const tasksRes = await fetch('/api/tasks');
                const tasksData = await tasksRes.json();
                this.tasks = tasksData.tasks || [];
                console.log('Tasks loaded:', this.tasks.length, 'tasks');

                // Update learning task status
                this.updateLearningTaskStatus(this.tasks);

                // Fetch learning deliverables
                console.log('Fetching learning deliverables...');
                await this.fetchLearningDeliverables();
                console.log('Learning deliverables loaded');

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

                // Fetch health alerts
                console.log('Fetching health alerts...');
                await this.fetchHealthAlerts();
                console.log('Health alerts loaded');

                // Fetch git info
                console.log('Fetching git info...');
                await this.fetchGitInfo();
                console.log('Git info loaded');

                // Fetch dashboard server status
                console.log('Fetching dashboard server status...');
                await this.fetchDashboardServerStatus();
                console.log('Dashboard server status loaded');

                // Fetch event log info
                console.log('Fetching event log info...');
                await this.fetchEventLogInfo();
                console.log('Event log info loaded');

                // Fetch MoE data
                console.log('Fetching MoE intelligence data...');
                await this.fetchMoEData();
                console.log('MoE intelligence data loaded');

                // Fetch DDQD data
                console.log('Fetching DDQD test history...');
                await this.fetchDDQDHistory();
                await this.fetchDDQDSchedule();
                console.log('DDQD data loaded');

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

        async refreshGovernanceData() {
            try {
                console.log('Fetching governance data...');
                this.governanceLoading = true;

                // Fetch all governance data in parallel
                const [dashboardRes, gdprRes, soc2Res, internalRes, metricsRes, trendsRes] = await Promise.all([
                    fetch('/api/governance/dashboard'),
                    fetch('/api/governance/compliance-check/gdpr'),
                    fetch('/api/governance/compliance-check/soc2'),
                    fetch('/api/governance/compliance-check/internal'),
                    fetch('/api/governance/metrics'),
                    fetch('/api/governance/trends?period=30d')
                ]);

                // Parse responses
                this.governanceData.dashboard = await dashboardRes.json();
                this.governanceData.gdpr = await gdprRes.json();
                this.governanceData.soc2 = await soc2Res.json();
                this.governanceData.internal = await internalRes.json();
                this.governanceData.metrics = await metricsRes.json();
                this.governanceData.trends = await trendsRes.json();

                console.log('Governance data loaded:', this.governanceData);

                // Refresh Lucide icons to render new icons
                this.$nextTick(() => {
                    lucide.createIcons();
                });
            } catch (error) {
                console.error('Error fetching governance data:', error);
            } finally {
                this.governanceLoading = false;
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

            // Check alerts every 30 seconds
            setInterval(() => {
                this.checkAlerts();
            }, 30000);

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

            // Fallback: Poll PM daemon status only if WebSocket is disconnected
            setInterval(async () => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    try {
                        const res = await fetch('/api/pm-daemon/status');
                        this.pmDaemon = await res.json();
                    } catch (error) {
                        console.error('Error polling PM daemon status:', error);
                    }
                }
            }, 10000);

            // Fallback: Poll Health daemon status only if WebSocket is disconnected
            setInterval(async () => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    try {
                        const res = await fetch('/api/health-daemon/status');
                        this.healthDaemon = await res.json();
                    } catch (error) {
                        console.error('Error polling Health daemon status:', error);
                    }
                }
            }, 10000);

            // Fallback: Poll Metrics daemon status only if WebSocket is disconnected
            setInterval(async () => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    try {
                        const res = await fetch('/api/metrics-daemon/status');
                        this.metricsDaemon = await res.json();
                    } catch (error) {
                        console.error('Error polling Metrics daemon status:', error);
                    }
                }
            }, 10000);

            // Fallback: Poll Coordinator daemon status only if WebSocket is disconnected
            setInterval(async () => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    try {
                        const res = await fetch('/api/coordinator-daemon/status');
                        this.coordinatorDaemon = await res.json();
                    } catch (error) {
                        console.error('Error polling Coordinator daemon status:', error);
                    }
                }
            }, 10000);

            // Fallback: Poll Integration Validator status only if WebSocket is disconnected
            setInterval(async () => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    try {
                        const res = await fetch('/api/integration-validator/status');
                        this.integrationValidatorDaemon = await res.json();
                    } catch (error) {
                        console.error('Error polling Integration Validator status:', error);
                    }
                }
            }, 10000);

            // Poll tasks every 15 seconds (tasks not pushed via WebSocket yet)
            setInterval(async () => {
                try {
                    const res = await fetch('/api/tasks');
                    const data = await res.json();
                    this.tasks = data.tasks || [];

                    // Check for learning task status
                    this.updateLearningTaskStatus(this.tasks);

                    // Update learning deliverables
                    await this.fetchLearningDeliverables();
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
            // Lazy loading: Only init token chart on page load (it's on overview page)
            this.initTokenChart();
            this.chartsInitialized.overview = true;
            // Other charts are initialized when their views are accessed
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

        // Update Gantt chart when time range changes
        updateGanttChart() {
            this.initGanttChart();
        },

        // Initialize Gantt Chart for Worker Timeline
        initGanttChart() {
            const canvas = document.getElementById('ganttChart');
            if (!canvas) return;

            if (this.ganttChart) {
                this.ganttChart.destroy();
            }

            // Get time range
            const now = Date.now();
            const ranges = {
                '1h': 60 * 60 * 1000,
                '6h': 6 * 60 * 60 * 1000,
                '24h': 24 * 60 * 60 * 1000
            };
            const rangeDuration = ranges[this.ganttTimeRange] || ranges['24h'];
            const startTime = now - rangeDuration;

            // Get worker start/end events from events
            const workerEvents = this.events.filter(e => e.type?.includes('worker'));

            // Build worker timeline data
            const workerTimelines = {};
            workerEvents.forEach(event => {
                let workerId = null;
                if (event.data) {
                    try {
                        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                        workerId = data.worker_id;
                    } catch (e) {
                        // Ignore parse errors
                    }
                }

                if (!workerId) return;

                if (!workerTimelines[workerId]) {
                    workerTimelines[workerId] = {
                        id: workerId,
                        start: null,
                        end: null,
                        status: 'running',
                        type: workerId.startsWith('dev-') ? 'development' :
                              workerId.startsWith('sec-') ? 'security' :
                              workerId.startsWith('inv-') ? 'inventory' : 'other'
                    };
                }

                const eventTime = new Date(event.timestamp).getTime();

                if (event.type?.includes('started') || event.type?.includes('spawned')) {
                    if (!workerTimelines[workerId].start || eventTime < workerTimelines[workerId].start) {
                        workerTimelines[workerId].start = eventTime;
                    }
                } else if (event.type?.includes('completed') || event.type?.includes('success')) {
                    workerTimelines[workerId].end = eventTime;
                    workerTimelines[workerId].status = 'completed';
                } else if (event.type?.includes('failed') || event.type?.includes('error')) {
                    workerTimelines[workerId].end = eventTime;
                    workerTimelines[workerId].status = 'failed';
                }
            });

            // Convert to array and filter by time range
            let workers = Object.values(workerTimelines)
                .filter(w => w.start && w.start >= startTime)
                .sort((a, b) => a.start - b.start)
                .slice(-20); // Show last 20 workers

            // If no end time, assume still running
            const currentTime = now;
            workers.forEach(w => {
                if (!w.end || w.end < w.start) {
                    w.end = currentTime;
                    w.status = 'running';
                }
            });

            // Prepare chart data
            const labels = workers.map(w => w.id.substring(0, 16)); // Truncate long IDs

            // Create datasets for horizontal bar chart (Gantt-style)
            const datasets = workers.map((w, index) => {
                const duration = (w.end - w.start) / 1000 / 60; // Duration in minutes
                const offset = (w.start - startTime) / 1000 / 60; // Offset from start time

                // Color based on worker type and status
                let backgroundColor;
                if (w.status === 'completed') {
                    backgroundColor = 'rgba(34, 197, 94, 0.8)'; // Green
                } else if (w.status === 'failed') {
                    backgroundColor = 'rgba(156, 163, 175, 0.8)'; // Gray
                } else {
                    // Running - color by type
                    if (w.type === 'development') {
                        backgroundColor = 'rgba(59, 130, 246, 0.8)'; // Blue
                    } else if (w.type === 'security') {
                        backgroundColor = 'rgba(239, 68, 68, 0.8)'; // Red
                    } else if (w.type === 'inventory') {
                        backgroundColor = 'rgba(168, 85, 247, 0.8)'; // Purple
                    } else {
                        backgroundColor = 'rgba(107, 114, 128, 0.8)'; // Gray
                    }
                }

                return {
                    label: w.id,
                    data: [{ x: [offset, offset + duration], y: index }],
                    backgroundColor,
                    borderColor: backgroundColor.replace('0.8', '1'),
                    borderWidth: 1,
                    barThickness: 20
                };
            });

            const isDark = this.darkMode;
            const maxDuration = rangeDuration / 1000 / 60; // in minutes

            this.ganttChart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: (context) => {
                                    const workerIndex = context[0].dataIndex;
                                    return workers[workerIndex]?.id || 'Unknown';
                                },
                                label: (context) => {
                                    const workerIndex = context.dataIndex;
                                    const worker = workers[workerIndex];
                                    if (!worker) return '';

                                    const duration = ((worker.end - worker.start) / 1000 / 60).toFixed(1);
                                    const startDate = new Date(worker.start);
                                    const endDate = new Date(worker.end);

                                    return [
                                        `Type: ${worker.type}`,
                                        `Status: ${worker.status}`,
                                        `Duration: ${duration} min`,
                                        `Started: ${startDate.toLocaleTimeString()}`,
                                        `${worker.status === 'running' ? 'Still' : 'Ended'}: ${endDate.toLocaleTimeString()}`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'linear',
                            position: 'top',
                            min: 0,
                            max: maxDuration,
                            ticks: {
                                color: isDark ? '#9CA3AF' : '#6B7280',
                                callback: (value) => {
                                    // Convert minutes to readable format
                                    if (this.ganttTimeRange === '1h') {
                                        return `${value}m`;
                                    } else {
                                        const hours = Math.floor(value / 60);
                                        return `${hours}h`;
                                    }
                                }
                            },
                            grid: { color: isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)' },
                            title: {
                                display: true,
                                text: 'Time Elapsed',
                                color: isDark ? '#9CA3AF' : '#6B7280'
                            }
                        },
                        y: {
                            ticks: {
                                color: isDark ? '#9CA3AF' : '#6B7280',
                                font: { size: 10 }
                            },
                            grid: { display: false }
                        }
                    }
                }
            });
        },

        // Heatmap functions
        updateHeatmap() {
            this.initHeatmapData();
        },

        initHeatmapData() {
            const now = Date.now();
            const ranges = {
                '24h': { duration: 24 * 60 * 60 * 1000, cells: 24 },
                '7d': { duration: 7 * 24 * 60 * 60 * 1000, cells: 24 },
                '30d': { duration: 30 * 24 * 60 * 60 * 1000, cells: 24 }
            };
            const range = ranges[this.heatmapTimeRange] || ranges['7d'];
            const startTime = now - range.duration;
            const cellDuration = range.duration / range.cells;

            // Initialize empty heatmap data
            const masters = ['coordinator', 'development', 'security', 'inventory'];
            masters.forEach(master => {
                this.heatmapData[master] = [];
                for (let i = 0; i < range.cells; i++) {
                    this.heatmapData[master].push({
                        hour: i,
                        activity: 0
                    });
                }
            });

            // Count task assignments per master per time cell
            const relevantEvents = this.events.filter(e => {
                const eventTime = new Date(e.timestamp).getTime();
                return eventTime >= startTime &&
                       eventTime <= now &&
                       (e.type?.includes('task_assigned') || e.type?.includes('assigned'));
            });

            relevantEvents.forEach(event => {
                const eventTime = new Date(event.timestamp).getTime();
                const cellIndex = Math.floor((eventTime - startTime) / cellDuration);

                if (cellIndex >= 0 && cellIndex < range.cells) {
                    // Determine which master this event is for
                    let master = null;
                    if (event.data) {
                        try {
                            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                            const assignedTo = data.assigned_to || '';
                            if (assignedTo.includes('coordinator')) master = 'coordinator';
                            else if (assignedTo.includes('development')) master = 'development';
                            else if (assignedTo.includes('security')) master = 'security';
                            else if (assignedTo.includes('inventory')) master = 'inventory';
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }

                    // Check event type for master hints
                    if (!master && event.type) {
                        if (event.type.includes('coordinator')) master = 'coordinator';
                        else if (event.type.includes('development')) master = 'development';
                        else if (event.type.includes('security')) master = 'security';
                        else if (event.type.includes('inventory')) master = 'inventory';
                    }

                    // Check message for master hints
                    if (!master && event.message) {
                        const msg = event.message.toLowerCase();
                        if (msg.includes('coordinator')) master = 'coordinator';
                        else if (msg.includes('development')) master = 'development';
                        else if (msg.includes('security')) master = 'security';
                        else if (msg.includes('inventory')) master = 'inventory';
                    }

                    if (master && this.heatmapData[master]) {
                        this.heatmapData[master][cellIndex].activity++;
                    }
                }
            });
        },

        renderHeatmapRow(master) {
            this.initHeatmapData();
        },

        getHeatmapColor(activity) {
            // Color scale from light gray to deep indigo
            const colors = [
                '#f3f4f6',  // 0 - gray-100
                '#c7d2fe',  // 1-2 - indigo-200
                '#a5b4fc',  // 3-4 - indigo-300
                '#818cf8',  // 5-6 - indigo-400
                '#6366f1',  // 7-8 - indigo-500
                '#4f46e5'   // 9+ - indigo-600
            ];

            if (activity === 0) return colors[0];
            if (activity <= 2) return colors[1];
            if (activity <= 4) return colors[2];
            if (activity <= 6) return colors[3];
            if (activity <= 8) return colors[4];
            return colors[5];
        },

        // Alerting System Functions
        checkAlerts() {
            // Check error rate
            if (this.alertThresholds.errorRate.enabled) {
                const errorEvents = this.events.filter(e =>
                    e.type?.includes('error') || e.type?.includes('failed')
                ).length;
                const totalEvents = this.events.length;
                const errorRate = totalEvents > 0 ? (errorEvents / totalEvents * 100) : 0;

                if (errorRate > this.alertThresholds.errorRate.threshold) {
                    this.triggerAlert({
                        id: 'error-rate-' + Date.now(),
                        title: 'High Error Rate Detected',
                        message: `System error rate is ${errorRate.toFixed(1)}% (threshold: ${this.alertThresholds.errorRate.threshold}%)`,
                        severity: this.alertThresholds.errorRate.severity,
                        timestamp: Date.now()
                    });
                }
            }

            // Check worker failure rate
            if (this.alertThresholds.workerFailureRate.enabled && this.metrics.workers) {
                const total = (this.metrics.workers.completed || 0) + (this.metrics.workers.failed || 0);
                const failureRate = total > 0 ? ((this.metrics.workers.failed || 0) / total * 100) : 0;

                if (failureRate > this.alertThresholds.workerFailureRate.threshold) {
                    this.triggerAlert({
                        id: 'worker-failure-' + Date.now(),
                        title: 'High Worker Failure Rate',
                        message: `Worker failure rate is ${failureRate.toFixed(1)}% (threshold: ${this.alertThresholds.workerFailureRate.threshold}%)`,
                        severity: this.alertThresholds.workerFailureRate.severity,
                        timestamp: Date.now()
                    });
                }
            }

            // Check low success rate
            if (this.alertThresholds.lowSuccessRate.enabled && this.metrics.workers) {
                const successRate = this.metrics.workers.successRate || 0;

                if (successRate < this.alertThresholds.lowSuccessRate.threshold && successRate > 0) {
                    this.triggerAlert({
                        id: 'low-success-' + Date.now(),
                        title: 'Low Success Rate Alert',
                        message: `System success rate dropped to ${successRate.toFixed(1)}% (threshold: ${this.alertThresholds.lowSuccessRate.threshold}%)`,
                        severity: this.alertThresholds.lowSuccessRate.severity,
                        timestamp: Date.now()
                    });
                }
            }

            // Check high active workers
            if (this.alertThresholds.highActiveWorkers.enabled && this.metrics.workers) {
                const activeWorkers = this.metrics.workers.active || 0;

                if (activeWorkers > this.alertThresholds.highActiveWorkers.threshold) {
                    this.triggerAlert({
                        id: 'high-workers-' + Date.now(),
                        title: 'High Worker Load',
                        message: `${activeWorkers} workers currently active (threshold: ${this.alertThresholds.highActiveWorkers.threshold})`,
                        severity: this.alertThresholds.highActiveWorkers.severity,
                        timestamp: Date.now()
                    });
                }
            }
        },

        triggerAlert(alert) {
            // Check if similar alert already exists (prevent duplicates)
            const exists = this.activeAlerts.some(a =>
                a.title === alert.title && (Date.now() - a.timestamp) < 60000 // Within last minute
            );

            if (!exists) {
                this.activeAlerts.unshift(alert);
                // Keep only last 20 alerts
                if (this.activeAlerts.length > 20) {
                    this.activeAlerts = this.activeAlerts.slice(0, 20);
                }
                // Reinitialize icons for new alert
                this.$nextTick(() => {
                    lucide.createIcons();
                });
            }
        },

        dismissAlert(alertId) {
            this.activeAlerts = this.activeAlerts.filter(a => a.id !== alertId);
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

            // Initialize new Phase 7 analytics charts
            this.initAnalyticsCharts();
            this.initGanttChart();
            this.initHeatmapData();

            // Initialize existing charts
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
            this.mobileMenuOpen = false; // Close mobile menu when switching views

            // Lazy loading: Fetch workers data only when viewing workers page
            if (view === 'workers') {
                // Check cache first
                const cachedWorkers = this.getCachedData('workers');
                if (!cachedWorkers || this.workers.length === 0) {
                    console.log('👷 Lazy loading workers data...');
                    this.fetchWorkers();
                }
            }

            // Fetch session-only events for Events page
            if (view === 'events') {
                this.fetchSessionEvents();
            }

            // Lazy loading: Initialize metrics charts only on first visit
            if (view === 'metrics' && !this.chartsInitialized.metrics) {
                console.log('📊 Lazy loading metrics charts...');
                this.$nextTick(() => {
                    this.initMetricsCharts();
                    this.chartsInitialized.metrics = true;

                    // Render Mermaid diagrams (for EM flow diagram)
                    setTimeout(() => {
                        try {
                            if (typeof mermaid !== 'undefined') {
                                // Only render unprocessed mermaid diagrams
                                const mermaidElements = document.querySelectorAll('.mermaid:not([data-processed])');
                                if (mermaidElements.length > 0) {
                                    mermaid.run({
                                        querySelector: '.mermaid:not([data-processed])'
                                    });
                                }
                            }
                        } catch (e) {
                            console.error('Mermaid rendering error:', e);
                        }
                    }, 200);
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
                // Check cache first
                const cached = this.getCachedData('workers');
                if (cached) {
                    console.log('Using cached workers data');
                    this.workers = cached;
                    return;
                }

                // Show loading skeleton
                this.loadingStates.workers = true;

                const res = await fetch('/api/workers');
                const data = await res.json();
                this.workers = [
                    ...(data.active_workers || []),
                    ...(data.completed_workers || []),
                    ...(data.failed_workers || [])
                ];

                // Cache the workers data
                this.setCachedData('workers', this.workers);
            } catch (error) {
                console.error('Error fetching workers:', error);
            } finally {
                // Hide loading skeleton
                this.loadingStates.workers = false;
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
                'worker_restarted': 'Worker Restarted',
                'health_alert_resolved': 'Alert Resolved',
                'health_alert_note_added': 'Alert Note Added',
                'health_alert_deleted': 'Alert Deleted',
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

                case 'worker_restarted':
                    return `Worker ${data.worker_id || 'unknown'} restarted from ${data.source_dir || 'unknown'} directory`;

                case 'health_alert_resolved':
                    return `${data.severity || ''} alert resolved: ${data.alert_type || 'unknown'}`.trim();

                case 'health_alert_note_added':
                    return `Note added to ${data.severity || ''} ${data.alert_type || 'unknown'} alert`.trim();

                case 'health_alert_deleted':
                    return `${data.severity || ''} alert deleted: ${data.alert_type || 'unknown'}`.trim();

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

        // Daemon control functions
        async controlWorkerDaemon(action) {
            try {
                const response = await fetch('/api/daemon/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action })
                });

                const result = await response.json();

                if (result.success) {
                    console.log(`Worker daemon ${action} successful:`, result.message);
                    // Refresh daemon status after a moment
                    setTimeout(() => this.fetchDaemonStatus(), 1000);
                } else {
                    console.error(`Worker daemon ${action} failed:`, result.message);
                    alert(`Failed to ${action} worker daemon: ${result.message}`);
                }
            } catch (error) {
                console.error(`Error controlling worker daemon:`, error);
                alert(`Error: ${error.message}`);
            }
        },

        async controlPmDaemon(action) {
            try {
                const response = await fetch('/api/pm-daemon/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action })
                });

                const result = await response.json();

                if (result.success) {
                    console.log(`PM daemon ${action} successful:`, result.message);
                    // Refresh daemon status after a moment
                    setTimeout(() => this.fetchPmDaemonStatus(), 1000);
                } else {
                    console.error(`PM daemon ${action} failed:`, result.message);
                    alert(`Failed to ${action} PM daemon: ${result.message}`);
                }
            } catch (error) {
                console.error(`Error controlling PM daemon:`, error);
                alert(`Error: ${error.message}`);
            }
        },

        async controlHealthDaemon(action) {
            try {
                const response = await fetch('/api/health-daemon/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action })
                });

                const result = await response.json();

                if (result.success) {
                    console.log(`Health monitor daemon ${action} successful:`, result.message);
                    // Refresh daemon status after a moment
                    setTimeout(() => this.fetchHealthDaemonStatus(), 1000);
                } else {
                    console.error(`Health monitor daemon ${action} failed:`, result.message);
                    alert(`Failed to ${action} health monitor daemon: ${result.message}`);
                }
            } catch (error) {
                console.error(`Error controlling health monitor daemon:`, error);
                alert(`Error: ${error.message}`);
            }
        },

        async controlMetricsDaemon(action) {
            try {
                const response = await fetch('/api/metrics-daemon/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action })
                });

                const result = await response.json();

                if (result.success) {
                    console.log(`Metrics snapshot daemon ${action} successful:`, result.message);
                    // Refresh daemon status after a moment
                    setTimeout(() => this.fetchMetricsDaemonStatus(), 1000);
                } else {
                    console.error(`Metrics snapshot daemon ${action} failed:`, result.message);
                    alert(`Failed to ${action} metrics snapshot daemon: ${result.message}`);
                }
            } catch (error) {
                console.error(`Error controlling metrics snapshot daemon:`, error);
                alert(`Error: ${error.message}`);
            }
        },

        async controlCoordinatorDaemon(action) {
            try {
                const response = await fetch('/api/coordinator-daemon/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action })
                });

                const result = await response.json();

                if (result.success) {
                    console.log(`Coordinator daemon ${action} successful:`, result.message);
                    // Refresh daemon status after a moment
                    setTimeout(() => this.fetchCoordinatorDaemonStatus(), 1000);
                } else {
                    console.error(`Coordinator daemon ${action} failed:`, result.message);
                    alert(`Failed to ${action} coordinator daemon: ${result.message}`);
                }
            } catch (error) {
                console.error(`Error controlling coordinator daemon:`, error);
                alert(`Error: ${error.message}`);
            }
        },

        async controlIntegrationValidator(action) {
            try {
                const response = await fetch('/api/integration-validator/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action })
                });

                const result = await response.json();

                if (result.success) {
                    console.log(`Integration validator ${action} successful:`, result.message);
                    // Refresh daemon status after a moment
                    setTimeout(() => this.fetchIntegrationValidatorStatus(), 1000);
                } else {
                    console.error(`Integration validator ${action} failed:`, result.message);
                    alert(`Failed to ${action} integration validator: ${result.message}`);
                }
            } catch (error) {
                console.error(`Error controlling integration validator:`, error);
                alert(`Error: ${error.message}`);
            }
        },

        // Terminal Control Functions
        async loadTerminalSettings() {
            try {
                const response = await fetch('/api/terminal-settings');
                const settings = await response.json();
                this.terminalSettings = settings;
                console.log('Terminal settings loaded:', settings);
            } catch (error) {
                console.error('Error loading terminal settings:', error);
            }
        },

        async saveTerminalSettings() {
            try {
                const response = await fetch('/api/terminal-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.terminalSettings)
                });

                const result = await response.json();

                if (result.success) {
                    console.log('Terminal settings saved successfully');
                    alert('Terminal settings updated successfully!');
                } else {
                    console.error('Failed to save terminal settings');
                    alert('Failed to update terminal settings');
                }
            } catch (error) {
                console.error('Error saving terminal settings:', error);
                alert(`Error: ${error.message}`);
            }
        },

        toggleTerminalWindows() {
            this.terminalSettings.terminal_windows_enabled = !this.terminalSettings.terminal_windows_enabled;
        },

        toggleHeadlessMode() {
            this.terminalSettings.headless_mode = !this.terminalSettings.headless_mode;
        },

        getTerminalModeStatus() {
            if (this.terminalSettings.headless_mode) {
                return 'Headless Mode (all workers run in background)';
            } else if (this.terminalSettings.terminal_windows_enabled) {
                const autoClose = this.terminalSettings.auto_close_duration_minutes;
                if (autoClose > 0) {
                    return `Terminal Windows Enabled (auto-close after ${autoClose} min)`;
                }
                return 'Terminal Windows Enabled (stay open)';
            } else {
                return 'Terminal Windows Disabled';
            }
        },

        async fetchHealthDaemonStatus() {
            try {
                const res = await fetch('/api/health-daemon/status');
                this.healthDaemon = await res.json();
            } catch (error) {
                console.error('Error fetching health daemon status:', error);
            }
        },

        async fetchMetricsDaemonStatus() {
            try {
                const res = await fetch('/api/metrics-daemon/status');
                this.metricsDaemon = await res.json();
            } catch (error) {
                console.error('Error fetching metrics daemon status:', error);
            }
        },

        async fetchCoordinatorDaemonStatus() {
            try {
                const res = await fetch('/api/coordinator-daemon/status');
                this.coordinatorDaemon = await res.json();
            } catch (error) {
                console.error('Error fetching coordinator daemon status:', error);
            }
        },

        async fetchIntegrationValidatorStatus() {
            try {
                const res = await fetch('/api/integration-validator/status');
                this.integrationValidatorDaemon = await res.json();
            } catch (error) {
                console.error('Error fetching integration validator status:', error);
            }
        },

        // Health Alerts Functions
        async fetchHealthAlerts() {
            try {
                const response = await fetch('/api/health-alerts');
                const data = await response.json();
                const newAlerts = data.alerts || [];

                // Detect new alerts (alerts that weren't in the previous list)
                if (this.healthAlerts.length > 0) {
                    const existingIds = this.healthAlerts.map(a => a.id);
                    const newOnes = newAlerts.filter(a => !existingIds.includes(a.id) && a.status !== 'resolved');

                    // Show notification for each new alert
                    newOnes.forEach(alert => {
                        this.showAlertNotification(alert);
                    });
                }

                this.healthAlerts = newAlerts;
                console.log('Health alerts loaded:', this.healthAlerts.length);
            } catch (error) {
                console.error('Error fetching health alerts:', error);
            }
        },

        showAlertNotification(alert) {
            const notification = {
                ...alert,
                notificationId: Date.now() + Math.random(),
                timestamp: new Date()
            };

            this.alertNotifications.push(notification);

            // Auto-dismiss after 3 seconds
            setTimeout(() => {
                this.dismissNotification(notification.notificationId);
            }, 3000);
        },

        dismissNotification(notificationId) {
            const index = this.alertNotifications.findIndex(n => n.notificationId === notificationId);
            if (index !== -1) {
                this.alertNotifications.splice(index, 1);
            }
        },

        updateLearningTaskStatus(tasks) {
            // Find the most recent learning task
            const learningTask = tasks.find(t =>
                t.title && t.title.includes('MoE Learning System') &&
                t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled'
            );

            if (learningTask) {
                this.learningTaskStatus = learningTask.status;
                this.learningTaskId = learningTask.id;
                this.learningTaskError = learningTask.error || null;
                this.learningTaskActive = ['pending', 'assigned', 'in_progress'].includes(learningTask.status);
            } else {
                // Check if there's a recently completed/failed learning task
                const recentLearningTask = tasks.find(t =>
                    t.title && t.title.includes('MoE Learning System') &&
                    (t.status === 'completed' || t.status === 'failed')
                );

                if (recentLearningTask) {
                    this.learningTaskStatus = recentLearningTask.status;
                    this.learningTaskId = recentLearningTask.id;
                    this.learningTaskError = recentLearningTask.error || null;
                    this.learningTaskActive = false;
                } else {
                    // No learning task found
                    this.learningTaskStatus = null;
                    this.learningTaskId = null;
                    this.learningTaskError = null;
                    this.learningTaskActive = false;
                }
            }
        },

        async fetchLearningDeliverables() {
            try {
                const response = await fetch('/api/moe/learning/deliverables');
                const data = await response.json();
                this.learningDeliverables = data.deliverables || [];
            } catch (error) {
                console.error('Error fetching learning deliverables:', error);
            }
        },

        async viewDeliverable(deliverable) {
            if (!deliverable.exists) {
                return;
            }

            this.viewingDeliverable = true;
            this.selectedDeliverable = deliverable;
            this.deliverableContent = 'Loading...';

            try {
                const filename = deliverable.file.split('/').pop();
                const response = await fetch(`/api/moe/learning/deliverables/${filename}`);
                const data = await response.json();

                if (data.content) {
                    this.deliverableContent = data.content;
                } else {
                    this.deliverableContent = 'Error loading content';
                }
            } catch (error) {
                console.error('Error loading deliverable content:', error);
                this.deliverableContent = 'Error loading content: ' + error.message;
            }
        },

        closeDeliverableView() {
            this.viewingDeliverable = false;
            this.selectedDeliverable = null;
            this.deliverableContent = null;
        },

        downloadDeliverable(deliverable) {
            if (!deliverable.exists) {
                return;
            }

            const filename = deliverable.file.split('/').pop();
            window.open(`/api/moe/learning/deliverables/${filename}`, '_blank');
        },

        async activateLearning() {
            this.learningTaskActivating = true;
            this.learningTaskMessage = '';
            this.learningTaskSuccess = false;

            try {
                const response = await fetch('/api/moe/learning/activate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                const data = await response.json();

                if (data.success) {
                    this.learningTaskSuccess = true;
                    this.learningTaskActive = true;
                    this.learningTaskStatus = 'pending';
                    this.learningTaskId = data.task_id;
                    this.learningTaskMessage = `Learning task activated successfully! Task ID: ${data.task_id}. Estimated duration: ${data.estimated_duration}`;

                    // Auto-dismiss success message after 10 seconds
                    setTimeout(() => {
                        this.learningTaskMessage = '';
                    }, 10000);

                    // Refresh tasks immediately
                    const tasksRes = await fetch('/api/tasks');
                    const tasksData = await tasksRes.json();
                    this.tasks = tasksData.tasks || [];
                    this.updateLearningTaskStatus(this.tasks);
                } else {
                    this.learningTaskSuccess = false;
                    this.learningTaskMessage = data.message || 'Failed to activate learning task';

                    // Auto-dismiss error message after 8 seconds
                    setTimeout(() => {
                        this.learningTaskMessage = '';
                    }, 8000);
                }
            } catch (error) {
                console.error('Error activating learning task:', error);
                this.learningTaskSuccess = false;
                this.learningTaskMessage = 'Network error: Could not activate learning task';

                // Auto-dismiss error message after 8 seconds
                setTimeout(() => {
                    this.learningTaskMessage = '';
                }, 8000);
            } finally {
                this.learningTaskActivating = false;
            }
        },

        getSeverityColor(severity) {
            const colors = {
                'critical': 'text-red-600 dark:text-red-400',
                'high': 'text-orange-600 dark:text-orange-400',
                'medium': 'text-yellow-600 dark:text-yellow-400',
                'low': 'text-blue-600 dark:text-blue-400'
            };
            return colors[severity] || 'text-gray-600 dark:text-gray-400';
        },

        getSeverityBgColor(severity) {
            const colors = {
                'critical': 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700',
                'high': 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700',
                'medium': 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700',
                'low': 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'
            };
            return colors[severity] || 'bg-gray-100 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700';
        },

        getStatusColor(status) {
            const colors = {
                'monitoring': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                'resolved': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
                'active': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
            };
            return colors[status] || 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300';
        },

        isAlertExpanded(alertId) {
            return this.expandedAlertIds.includes(alertId);
        },

        expandAlertDetails(alertId) {
            const index = this.expandedAlertIds.indexOf(alertId);
            if (index > -1) {
                this.expandedAlertIds.splice(index, 1);
            } else {
                this.expandedAlertIds.push(alertId);
            }
            // Reinitialize icons after expansion
            this.$nextTick(() => {
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        },

        async resolveAlert(alertId) {
            if (!confirm('Are you sure you want to mark this alert as resolved?')) {
                return;
            }

            try {
                const response = await fetch(`/api/health-alerts/${alertId}/resolve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        resolution_note: 'Resolved via dashboard'
                    })
                });

                const result = await response.json();

                if (result.success) {
                    console.log('Alert resolved:', result.message);
                    // Refresh alerts
                    await this.fetchHealthAlerts();
                } else {
                    alert(`Failed to resolve alert: ${result.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('Error resolving alert:', error);
                alert(`Error resolving alert: ${error.message}`);
            }
        },

        async restartWorkerFromAlert(alertId, workerId) {
            if (!confirm(`Are you sure you want to restart worker ${workerId}? This will move it from stuck/failed to active and attempt to respawn it.`)) {
                return;
            }

            try {
                const response = await fetch(`/api/health-alerts/${alertId}/restart-worker`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (result.success) {
                    console.log('Worker restarted:', result.message);
                    alert(`Worker ${workerId} restarted successfully!`);
                    // Refresh alerts
                    await this.fetchHealthAlerts();
                } else {
                    alert(`Failed to restart worker: ${result.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('Error restarting worker:', error);
                alert(`Error restarting worker: ${error.message}`);
            }
        },

        async repairAlert(alertId) {
            if (!confirm('Create an automated repair task via commit-relay to fix this health alert?')) {
                return;
            }

            try {
                const response = await fetch(`/api/health-alerts/${alertId}/repair`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (result.success) {
                    console.log('Repair task created:', result.task_id);
                    alert(`Automated repair initiated!\n\nTask ID: ${result.task_id}\n\nCommit-relay will investigate and fix this issue. Check the tasks panel for progress.`);
                    // Refresh alerts to show repair_initiated status
                    await this.fetchHealthAlerts();
                    // Refresh tasks to show new repair task
                    await this.fetchTasks();
                } else {
                    alert(`Failed to create repair task: ${result.error || 'Unknown error'}\n\nDetails: ${result.details || 'None'}`);
                }
            } catch (error) {
                console.error('Error creating repair task:', error);
                alert(`Error creating repair task: ${error.message}`);
            }
        },

        async addAlertNote(alertId) {
            const note = prompt('Enter investigation note:');
            if (!note || !note.trim()) {
                return;
            }

            try {
                const response = await fetch(`/api/health-alerts/${alertId}/note`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note: note.trim() })
                });

                const result = await response.json();

                if (result.success) {
                    console.log('Note added:', result.message);
                    // Refresh alerts
                    await this.fetchHealthAlerts();
                } else {
                    alert(`Failed to add note: ${result.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('Error adding note:', error);
                alert(`Error adding note: ${error.message}`);
            }
        },

        async deleteAlert(alertId) {
            if (!confirm('Are you sure you want to delete this alert? This action cannot be undone.')) {
                return;
            }

            try {
                const response = await fetch(`/api/health-alerts/${alertId}`, {
                    method: 'DELETE'
                });

                const result = await response.json();

                if (result.success) {
                    console.log('Alert deleted:', result.message);
                    // Refresh alerts
                    await this.fetchHealthAlerts();
                } else {
                    alert(`Failed to delete alert: ${result.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('Error deleting alert:', error);
                alert(`Error deleting alert: ${error.message}`);
            }
        },

        formatTimestamp(timestamp) {
            if (!timestamp) return 'N/A';
            try {
                return new Date(timestamp).toLocaleString();
            } catch (e) {
                return timestamp;
            }
        },

        // Fetch git info (last commit and last sync)
        async fetchGitInfo() {
            try {
                const response = await fetch('/api/git-info');
                const data = await response.json();
                this.gitInfo = data;
            } catch (error) {
                console.error('Error fetching git info:', error);
                this.gitInfo = {
                    lastCommit: { message: 'Error loading', timeAgo: 'Unknown' },
                    lastSync: 'Unknown'
                };
            }
        },

        // Fetch dashboard server status
        async fetchDashboardServerStatus() {
            try {
                const response = await fetch('/api/dashboard-server/status');
                const data = await response.json();
                this.dashboardServerStatus = data;
            } catch (error) {
                console.error('Error fetching dashboard server status:', error);
                this.dashboardServerStatus = {
                    status: 'error',
                    pid: null,
                    port: 3000
                };
            }
        },

        // Restart dashboard server
        async restartDashboardServer() {
            if (!confirm('Restart dashboard server? The page will reload automatically in 2-3 seconds.')) {
                return;
            }

            try {
                const response = await fetch('/api/dashboard-server/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'restart' })
                });

                const result = await response.json();

                if (result.success) {
                    alert('Dashboard server is restarting. Please wait...');
                    // Wait 3 seconds then reload
                    setTimeout(() => {
                        window.location.reload();
                    }, 3000);
                } else {
                    alert(`Failed to restart server: ${result.message}`);
                }
            } catch (error) {
                console.error('Error restarting dashboard server:', error);
                alert(`Error restarting server: ${error.message}`);
            }
        },

        // Fetch event log information
        async fetchEventLogInfo() {
            try {
                const response = await fetch('/api/event-log/info');
                const data = await response.json();
                this.eventLogInfo = data;
            } catch (error) {
                console.error('Error fetching event log info:', error);
                this.eventLogInfo = {
                    created_date: 'Error loading',
                    event_count: 0,
                    file_size: 'N/A'
                };
            }
        },

        // Fetch MoE Intelligence Data
        async fetchMoEData() {
            try {
                // Fetch MoE routing decisions
                const routingRes = await fetch('/api/moe/routing');
                if (routingRes.ok) {
                    const routingData = await routingRes.json();
                    this.moeRoutingDecisions = routingData.decisions || [];

                    // Calculate metrics from routing decisions
                    const totalRoutes = this.moeRoutingDecisions.length;
                    const avgConfidence = totalRoutes > 0
                        ? (this.moeRoutingDecisions.reduce((sum, d) => sum + (d.decision?.primary_confidence || 0) * 100, 0) / totalRoutes).toFixed(0)
                        : 0;
                    const parallelRoutes = this.moeRoutingDecisions.filter(d =>
                        d.decision?.parallel_experts && d.decision.parallel_experts.length > 0
                    ).length;

                    // Count expert distribution
                    const expertCounts = { development: 0, security: 0, inventory: 0 };
                    this.moeRoutingDecisions.forEach(d => {
                        const expert = d.decision?.primary_expert;
                        if (expert && expertCounts.hasOwnProperty(expert)) {
                            expertCounts[expert]++;
                        }
                    });

                    this.moeMetrics = {
                        totalRoutes,
                        avgConfidence,
                        parallelRoutes,
                        accuracy: 95, // Placeholder - would need to calculate from actual success data
                        expertCounts
                    };
                }

                // Fetch MoE pool state
                const poolRes = await fetch('/api/moe/pool');
                if (poolRes.ok) {
                    const poolData = await poolRes.json();
                    this.moePoolMetrics = poolData;
                }

                // Fetch MoE learning metrics
                const learningRes = await fetch('/api/moe/learning');
                if (learningRes.ok) {
                    const learningData = await learningRes.json();
                    this.moeLearningMetrics = learningData.metrics || this.moeLearningMetrics;
                    this.moeLearningInsights = learningData.insights || [];
                }
            } catch (error) {
                console.error('Error fetching MoE data:', error);
                // Keep default values on error
            }
        },

        // Purge event log
        async purgeEventLog() {
            if (!confirm('Are you sure you want to purge the event log? All events will be archived to a backup file. This action cannot be undone.')) {
                return;
            }

            try {
                const response = await fetch('/api/event-log/purge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (result.success) {
                    alert(`Event log purged successfully. ${result.archived_count} events archived to:\n${result.archive_file}`);
                    // Refresh the event log info
                    await this.fetchEventLogInfo();
                    // Refresh other data that may depend on events
                    await this.fetchInitialData();
                } else {
                    alert(`Failed to purge event log: ${result.message}`);
                }
            } catch (error) {
                console.error('Error purging event log:', error);
                alert(`Error purging event log: ${error.message}`);
            }
        },

        // Truncate text to max length
        truncateText(text, maxLength = 40) {
            if (!text) return '';
            if (text.length <= maxLength) return text;
            return text.substring(0, maxLength) + '...';
        },

        // ==================== API EXPLORER FUNCTIONS ====================

        // Initialize API Explorer
        initApiExplorer() {
            // Define all API endpoints
            this.apiExplorer.endpoints = [
                // Metrics & Health
                {
                    category: 'Metrics & Health',
                    method: 'GET',
                    path: '/api/health',
                    description: 'Health check endpoint - returns basic health status',
                    requiresParams: false
                },
                {
                    category: 'Metrics & Health',
                    method: 'GET',
                    path: '/api/metrics',
                    description: 'Get current system metrics (workers, tasks, tokens)',
                    requiresParams: false,
                    queryParams: [{ name: 'period', description: 'Time period: last_hour, last_24h, last_7d, all_time', optional: true }]
                },
                {
                    category: 'Metrics & Health',
                    method: 'GET',
                    path: '/api/metrics/history',
                    description: 'Get historical metrics for charts and analytics',
                    requiresParams: false
                },

                // Workers & Tasks
                {
                    category: 'Workers & Tasks',
                    method: 'GET',
                    path: '/api/workers',
                    description: 'Get all workers from active worker specs directory',
                    requiresParams: false
                },
                {
                    category: 'Workers & Tasks',
                    method: 'GET',
                    path: '/api/tasks',
                    description: 'Get all tasks from coordination system',
                    requiresParams: false
                },
                {
                    category: 'Workers & Tasks',
                    method: 'GET',
                    path: '/api/execution-managers',
                    description: 'Get execution manager configurations',
                    requiresParams: false
                },
                {
                    category: 'Workers & Tasks',
                    method: 'GET',
                    path: '/api/streams',
                    description: 'Get workforce streams configuration and metrics',
                    requiresParams: false
                },
                {
                    category: 'Workers & Tasks',
                    method: 'GET',
                    path: '/api/coordination/raw',
                    description: 'Get raw coordination data for debugging',
                    requiresParams: false
                },

                // Events & Logs
                {
                    category: 'Events & Logs',
                    method: 'GET',
                    path: '/api/events',
                    description: 'Get system events log',
                    requiresParams: false,
                    queryParams: [{ name: 'limit', description: 'Max number of events to return', optional: true }]
                },

                // Git Operations
                {
                    category: 'Git Operations',
                    method: 'GET',
                    path: '/api/git-operations',
                    description: 'Get git commit and push operations',
                    requiresParams: false
                },
                {
                    category: 'Git Operations',
                    method: 'GET',
                    path: '/api/git-info',
                    description: 'Get last commit and repo sync information',
                    requiresParams: false
                },

                // Daemon Status
                {
                    category: 'Daemon Status',
                    method: 'GET',
                    path: '/api/daemon/status',
                    description: 'Get worker daemon status',
                    requiresParams: false
                },
                {
                    category: 'Daemon Status',
                    method: 'GET',
                    path: '/api/pm-daemon/status',
                    description: 'Get project manager daemon status',
                    requiresParams: false
                },
                {
                    category: 'Daemon Status',
                    method: 'GET',
                    path: '/api/dashboard-server/status',
                    description: 'Get dashboard server status',
                    requiresParams: false
                },

                // Health Alerts
                {
                    category: 'Health Alerts',
                    method: 'GET',
                    path: '/api/health-alerts',
                    description: 'Get active health alerts',
                    requiresParams: false
                },
                {
                    category: 'Health Alerts',
                    method: 'POST',
                    path: '/api/health-alerts/:id/resolve',
                    description: 'Resolve a health alert',
                    requiresParams: true,
                    pathParams: [{ name: 'id', description: 'Alert ID', example: 'alert-001' }]
                },
                {
                    category: 'Health Alerts',
                    method: 'POST',
                    path: '/api/health-alerts/:id/restart-worker',
                    description: 'Restart worker associated with alert',
                    requiresParams: true,
                    pathParams: [{ name: 'id', description: 'Alert ID', example: 'alert-001' }]
                },
                {
                    category: 'Health Alerts',
                    method: 'POST',
                    path: '/api/health-alerts/:id/note',
                    description: 'Add a note to an alert',
                    requiresParams: true,
                    pathParams: [{ name: 'id', description: 'Alert ID', example: 'alert-001' }],
                    bodyParams: [{ name: 'note', description: 'Note text', example: 'Investigating issue...' }]
                },
                {
                    category: 'Health Alerts',
                    method: 'DELETE',
                    path: '/api/health-alerts/:id',
                    description: 'Delete a health alert',
                    requiresParams: true,
                    pathParams: [{ name: 'id', description: 'Alert ID', example: 'alert-001' }]
                },

                // Daemon Controls
                {
                    category: 'Daemon Controls',
                    method: 'POST',
                    path: '/api/daemon/control',
                    description: 'Start or stop worker daemon',
                    requiresParams: true,
                    bodyParams: [{ name: 'action', description: 'Action to perform', example: 'start', enum: ['start', 'stop'] }]
                },
                {
                    category: 'Daemon Controls',
                    method: 'POST',
                    path: '/api/pm-daemon/control',
                    description: 'Start or stop PM daemon',
                    requiresParams: true,
                    bodyParams: [{ name: 'action', description: 'Action to perform', example: 'start', enum: ['start', 'stop'] }]
                },
                {
                    category: 'Daemon Controls',
                    method: 'POST',
                    path: '/api/dashboard-server/control',
                    description: 'Restart dashboard server',
                    requiresParams: true,
                    bodyParams: [{ name: 'action', description: 'Action to perform', example: 'restart', enum: ['restart'] }]
                },

                // Governance
                {
                    category: 'Governance',
                    method: 'GET',
                    path: '/api/governance/dashboard',
                    description: 'Get governance dashboard overview',
                    requiresParams: false
                },
                {
                    category: 'Governance',
                    method: 'GET',
                    path: '/api/governance/compliance-report',
                    description: 'Get full compliance report',
                    requiresParams: false
                },
                {
                    category: 'Governance',
                    method: 'GET',
                    path: '/api/governance/compliance-check/:framework',
                    description: 'Check compliance for specific framework',
                    requiresParams: true,
                    pathParams: [{ name: 'framework', description: 'Framework name', example: 'SOC2' }]
                },
                {
                    category: 'Governance',
                    method: 'GET',
                    path: '/api/governance/metrics',
                    description: 'Get governance metrics',
                    requiresParams: false
                },
                {
                    category: 'Governance',
                    method: 'GET',
                    path: '/api/governance/trends',
                    description: 'Get governance trends over time',
                    requiresParams: false
                },

                // Activity & Events
                {
                    category: 'Events & Logs',
                    method: 'GET',
                    path: '/api/activity-feed',
                    description: 'Get activity feed with filtering',
                    requiresParams: false,
                    queryParams: [
                        { name: 'type', description: 'Event type filter', optional: true },
                        { name: 'limit', description: 'Max events to return', optional: true }
                    ]
                },
                {
                    category: 'Git Operations',
                    method: 'GET',
                    path: '/api/git-status',
                    description: 'Get current git repository status',
                    requiresParams: false
                },

                // MoE Intelligence
                {
                    category: 'MoE Intelligence',
                    method: 'GET',
                    path: '/api/moe-intelligence',
                    description: 'Get MoE intelligence overview',
                    requiresParams: false
                },
                {
                    category: 'MoE Intelligence',
                    method: 'GET',
                    path: '/api/moe/routing',
                    description: 'Get MoE routing statistics',
                    requiresParams: false
                },
                {
                    category: 'MoE Intelligence',
                    method: 'GET',
                    path: '/api/moe/pool',
                    description: 'Get MoE worker pool status',
                    requiresParams: false
                },
                {
                    category: 'MoE Intelligence',
                    method: 'GET',
                    path: '/api/moe/learning',
                    description: 'Get MoE learning status and metrics',
                    requiresParams: false
                },
                {
                    category: 'MoE Intelligence',
                    method: 'GET',
                    path: '/api/moe/accuracy',
                    description: 'Get MoE routing accuracy metrics',
                    requiresParams: false
                },
                {
                    category: 'MoE Intelligence',
                    method: 'GET',
                    path: '/api/moe/confidence-distribution',
                    description: 'Get confidence score distribution',
                    requiresParams: false
                },
                {
                    category: 'MoE Intelligence',
                    method: 'GET',
                    path: '/api/moe/pool-utilization',
                    description: 'Get worker pool utilization metrics',
                    requiresParams: false
                },
                {
                    category: 'MoE Intelligence',
                    method: 'POST',
                    path: '/api/moe/learning/activate',
                    description: 'Activate MoE deep learning task',
                    requiresParams: false
                },
                {
                    category: 'MoE Intelligence',
                    method: 'GET',
                    path: '/api/moe/learning/deliverables',
                    description: 'Get learning task deliverables',
                    requiresParams: false
                },
                {
                    category: 'MoE Intelligence',
                    method: 'GET',
                    path: '/api/moe/learning/deliverables/:filename',
                    description: 'Get specific deliverable file',
                    requiresParams: true,
                    pathParams: [{ name: 'filename', description: 'Deliverable filename', example: 'architecture-report.md' }]
                },

                // Learning Monitor
                {
                    category: 'Learning Monitor',
                    method: 'GET',
                    path: '/api/learning-monitor/status',
                    description: 'Get learning monitor daemon status and active tasks',
                    requiresParams: false
                },
                {
                    category: 'Learning Monitor',
                    method: 'GET',
                    path: '/api/learning-monitor/events',
                    description: 'Get recent learning monitor events',
                    requiresParams: false,
                    queryParams: [{ name: 'limit', description: 'Max events to return', optional: true }]
                },
                {
                    category: 'Learning Monitor',
                    method: 'POST',
                    path: '/api/learning-monitor/control',
                    description: 'Start or stop learning monitor daemon',
                    requiresParams: true,
                    bodyParams: [{ name: 'action', description: 'Action to perform', example: 'start', enum: ['start', 'stop'] }]
                },

                // Additional Daemons
                {
                    category: 'Daemon Status',
                    method: 'GET',
                    path: '/api/daemons/all',
                    description: 'Get status of all daemons',
                    requiresParams: false
                },
                {
                    category: 'Daemon Status',
                    method: 'GET',
                    path: '/api/health-daemon/status',
                    description: 'Get health monitoring daemon status',
                    requiresParams: false
                },
                {
                    category: 'Daemon Status',
                    method: 'GET',
                    path: '/api/metrics-daemon/status',
                    description: 'Get metrics snapshot daemon status',
                    requiresParams: false
                },
                {
                    category: 'Daemon Status',
                    method: 'GET',
                    path: '/api/coordinator-daemon/status',
                    description: 'Get coordinator daemon status',
                    requiresParams: false
                },
                {
                    category: 'Daemon Status',
                    method: 'GET',
                    path: '/api/integration-validator/status',
                    description: 'Get integration validator status',
                    requiresParams: false
                },
                {
                    category: 'Daemon Controls',
                    method: 'POST',
                    path: '/api/health-daemon/control',
                    description: 'Control health monitoring daemon',
                    requiresParams: true,
                    bodyParams: [{ name: 'action', description: 'Action to perform', example: 'start', enum: ['start', 'stop'] }]
                },
                {
                    category: 'Daemon Controls',
                    method: 'POST',
                    path: '/api/metrics-daemon/control',
                    description: 'Control metrics snapshot daemon',
                    requiresParams: true,
                    bodyParams: [{ name: 'action', description: 'Action to perform', example: 'start', enum: ['start', 'stop'] }]
                },
                {
                    category: 'Daemon Controls',
                    method: 'POST',
                    path: '/api/coordinator-daemon/control',
                    description: 'Control coordinator daemon',
                    requiresParams: true,
                    bodyParams: [{ name: 'action', description: 'Action to perform', example: 'start', enum: ['start', 'stop'] }]
                },
                {
                    category: 'Daemon Controls',
                    method: 'POST',
                    path: '/api/integration-validator/control',
                    description: 'Control integration validator',
                    requiresParams: true,
                    bodyParams: [{ name: 'action', description: 'Action to perform', example: 'start', enum: ['start', 'stop'] }]
                },
                {
                    category: 'Daemon Controls',
                    method: 'POST',
                    path: '/api/health-monitor/start',
                    description: 'Start health monitoring',
                    requiresParams: false
                },
                {
                    category: 'Daemon Controls',
                    method: 'POST',
                    path: '/api/health-monitor/stop',
                    description: 'Stop health monitoring',
                    requiresParams: false
                },
                {
                    category: 'Daemon Controls',
                    method: 'POST',
                    path: '/api/metrics-snapshot/start',
                    description: 'Start metrics snapshot collection',
                    requiresParams: false
                },
                {
                    category: 'Daemon Controls',
                    method: 'POST',
                    path: '/api/metrics-snapshot/stop',
                    description: 'Stop metrics snapshot collection',
                    requiresParams: false
                },

                // Health Alerts Extended
                {
                    category: 'Health Alerts',
                    method: 'POST',
                    path: '/api/health-alerts/:id/repair',
                    description: 'Auto-repair issue for alert',
                    requiresParams: true,
                    pathParams: [{ name: 'id', description: 'Alert ID', example: 'alert-001' }]
                },

                // Event Log Management
                {
                    category: 'Events & Logs',
                    method: 'GET',
                    path: '/api/event-log/info',
                    description: 'Get event log file information',
                    requiresParams: false
                },
                {
                    category: 'Events & Logs',
                    method: 'POST',
                    path: '/api/event-log/purge',
                    description: 'Purge old event log entries',
                    requiresParams: false
                },

                // Terminal Settings
                {
                    category: 'Settings',
                    method: 'GET',
                    path: '/api/terminal-settings',
                    description: 'Get terminal display settings',
                    requiresParams: false
                },
                {
                    category: 'Settings',
                    method: 'POST',
                    path: '/api/terminal-settings',
                    description: 'Update terminal display settings',
                    requiresParams: true,
                    bodyParams: [{ name: 'settings', description: 'Terminal settings object', example: '{"theme": "dark"}' }]
                },

                // Logs Streaming
                {
                    category: 'Events & Logs',
                    method: 'GET',
                    path: '/api/logs/stream',
                    description: 'Stream logs in real-time (SSE) - streaming endpoint',
                    requiresParams: true,  // Mark as requiring params to skip in bulk testing (SSE never completes)
                    isStreaming: true
                },
                {
                    category: 'Events & Logs',
                    method: 'GET',
                    path: '/api/logs/available',
                    description: 'Get list of available log files',
                    requiresParams: false
                },
                {
                    category: 'Events & Logs',
                    method: 'GET',
                    path: '/api/logs/tail',
                    description: 'Get tail of log file',
                    requiresParams: false,
                    queryParams: [
                        { name: 'file', description: 'Log file name', optional: true },
                        { name: 'lines', description: 'Number of lines', optional: true }
                    ]
                },

                // User Management
                {
                    category: 'User Management',
                    method: 'GET',
                    path: '/api/users',
                    description: 'Get all users',
                    requiresParams: false
                },
                {
                    category: 'User Management',
                    method: 'GET',
                    path: '/api/users/stats',
                    description: 'Get user statistics',
                    requiresParams: false
                },
                {
                    category: 'User Management',
                    method: 'GET',
                    path: '/api/users/:id',
                    description: 'Get specific user by ID',
                    requiresParams: true,
                    pathParams: [{ name: 'id', description: 'User ID', example: 'user-001' }]
                },
                {
                    category: 'User Management',
                    method: 'POST',
                    path: '/api/users',
                    description: 'Create new user',
                    requiresParams: true,
                    bodyParams: [
                        { name: 'username', description: 'Username', example: 'newuser' },
                        { name: 'email', description: 'Email address', example: 'user@example.com' }
                    ]
                },
                {
                    category: 'User Management',
                    method: 'PUT',
                    path: '/api/users/:id',
                    description: 'Update user',
                    requiresParams: true,
                    pathParams: [{ name: 'id', description: 'User ID', example: 'user-001' }],
                    bodyParams: [{ name: 'updates', description: 'Fields to update', example: '{"email": "new@example.com"}' }]
                },
                {
                    category: 'User Management',
                    method: 'DELETE',
                    path: '/api/users/:id',
                    description: 'Delete user',
                    requiresParams: true,
                    pathParams: [{ name: 'id', description: 'User ID', example: 'user-001' }]
                },
                {
                    category: 'User Management',
                    method: 'POST',
                    path: '/api/users/bulk',
                    description: 'Bulk create users',
                    requiresParams: true,
                    bodyParams: [{ name: 'users', description: 'Array of user objects', example: '[{"username": "user1"}]' }]
                },
                {
                    category: 'User Management',
                    method: 'POST',
                    path: '/api/users/:id/login',
                    description: 'Record user login',
                    requiresParams: true,
                    pathParams: [{ name: 'id', description: 'User ID', example: 'user-001' }]
                },

                // DDQD Testing
                {
                    category: 'DDQD Testing',
                    method: 'POST',
                    path: '/api/ddqd/run',
                    description: 'Run DDQD stress test',
                    requiresParams: true,
                    bodyParams: [
                        { name: 'duration', description: 'Test duration in seconds', example: '60' },
                        { name: 'intensity', description: 'Test intensity level', example: 'medium' }
                    ]
                },
                {
                    category: 'DDQD Testing',
                    method: 'GET',
                    path: '/api/ddqd/status/:testId',
                    description: 'Get status of DDQD test',
                    requiresParams: true,
                    pathParams: [{ name: 'testId', description: 'Test ID', example: 'test-001' }]
                },
                {
                    category: 'DDQD Testing',
                    method: 'POST',
                    path: '/api/ddqd/stop/:testId',
                    description: 'Stop running DDQD test',
                    requiresParams: true,
                    pathParams: [{ name: 'testId', description: 'Test ID', example: 'test-001' }]
                },
                {
                    category: 'DDQD Testing',
                    method: 'GET',
                    path: '/api/ddqd/active',
                    description: 'Get all active DDQD tests',
                    requiresParams: false
                },
                {
                    category: 'DDQD Testing',
                    method: 'GET',
                    path: '/api/ddqd/history',
                    description: 'Get DDQD test history',
                    requiresParams: false
                },
                {
                    category: 'DDQD Testing',
                    method: 'POST',
                    path: '/api/ddqd/schedule',
                    description: 'Schedule DDQD test',
                    requiresParams: true,
                    bodyParams: [
                        { name: 'schedule', description: 'Cron schedule', example: '0 0 * * *' },
                        { name: 'config', description: 'Test configuration', example: '{"duration": 60}' }
                    ]
                },
                {
                    category: 'DDQD Testing',
                    method: 'GET',
                    path: '/api/ddqd/schedule',
                    description: 'Get scheduled DDQD tests',
                    requiresParams: false
                },

                // Phase 7: Dashboard Analytics
                {
                    category: 'Analytics & Visualization',
                    method: 'GET',
                    path: '/api/dashboard/analytics/summary',
                    description: 'Get analytics summary',
                    requiresParams: false
                },
                {
                    category: 'Analytics & Visualization',
                    method: 'GET',
                    path: '/api/dashboard/analytics/trends',
                    description: 'Get analytics trends',
                    requiresParams: false,
                    queryParams: [{ name: 'days', description: 'Number of days', optional: true }]
                },
                {
                    category: 'Analytics & Visualization',
                    method: 'GET',
                    path: '/api/dashboard/visualizations/all',
                    description: 'Get all visualization data',
                    requiresParams: false
                },
                {
                    category: 'Analytics & Visualization',
                    method: 'GET',
                    path: '/api/dashboard/visualizations/health',
                    description: 'Get health visualization data',
                    requiresParams: false
                },
                {
                    category: 'Analytics & Visualization',
                    method: 'GET',
                    path: '/api/dashboard/alerts/active',
                    description: 'Get active dashboard alerts',
                    requiresParams: false
                },
                {
                    category: 'Analytics & Visualization',
                    method: 'GET',
                    path: '/api/dashboard/alerts/stats',
                    description: 'Get alert statistics',
                    requiresParams: false
                },
                {
                    category: 'Analytics & Visualization',
                    method: 'POST',
                    path: '/api/dashboard/alerts/check',
                    description: 'Check alert rules',
                    requiresParams: false
                },

                // Phase 8: Optimizer
                {
                    category: 'Optimizer',
                    method: 'GET',
                    path: '/api/optimizer/scheduler/stats',
                    description: 'Get scheduler statistics',
                    requiresParams: false
                },
                {
                    category: 'Optimizer',
                    method: 'GET',
                    path: '/api/optimizer/scheduler/balance',
                    description: 'Get load balance status',
                    requiresParams: false
                },
                {
                    category: 'Optimizer',
                    method: 'GET',
                    path: '/api/optimizer/tokens/stats',
                    description: 'Get token optimizer statistics',
                    requiresParams: false
                },
                {
                    category: 'Optimizer',
                    method: 'GET',
                    path: '/api/optimizer/tokens/forecast',
                    description: 'Get token usage forecast',
                    requiresParams: false
                },
                {
                    category: 'Optimizer',
                    method: 'GET',
                    path: '/api/optimizer/pool/stats',
                    description: 'Get worker pool statistics',
                    requiresParams: false
                },
                {
                    category: 'Optimizer',
                    method: 'GET',
                    path: '/api/optimizer/profile/stats',
                    description: 'Get profiler statistics',
                    requiresParams: false
                },
                {
                    category: 'Optimizer',
                    method: 'GET',
                    path: '/api/optimizer/profile/bottlenecks',
                    description: 'Detect performance bottlenecks',
                    requiresParams: false
                },
                {
                    category: 'Optimizer',
                    method: 'GET',
                    path: '/api/optimizer/profile/recommendations',
                    description: 'Get tuning recommendations',
                    requiresParams: false
                },

                // Internal Reporting
                {
                    category: 'Internal',
                    method: 'POST',
                    path: '/api/pm/state',
                    description: 'Update PM daemon state',
                    requiresParams: true,
                    bodyParams: [{ name: 'state', description: 'State object', example: '{"status": "active"}' }]
                },
                {
                    category: 'Internal',
                    method: 'POST',
                    path: '/api/health/report',
                    description: 'Submit health report',
                    requiresParams: true,
                    bodyParams: [{ name: 'report', description: 'Health report data', example: '{"status": "healthy"}' }]
                },
                {
                    category: 'Internal',
                    method: 'POST',
                    path: '/api/metrics/report',
                    description: 'Submit metrics report',
                    requiresParams: true,
                    bodyParams: [{ name: 'metrics', description: 'Metrics data', example: '{"cpu": 50}' }]
                }
            ];

            // Load request history from localStorage
            const savedHistory = localStorage.getItem('apiExplorerHistory');
            if (savedHistory) {
                try {
                    this.apiExplorer.requestHistory = JSON.parse(savedHistory);
                } catch (e) {
                    console.error('Error loading API explorer history:', e);
                    this.apiExplorer.requestHistory = [];
                }
            }

            // Initialize category expansion state (all expanded by default)
            const categories = [...new Set(this.apiExplorer.endpoints.map(e => e.category))];
            categories.forEach(cat => {
                this.apiExplorer.expandedCategories[cat] = true;
            });
        },

        // Test a single endpoint
        async testEndpoint(endpoint, params = {}) {
            const endpointKey = `${endpoint.method}:${endpoint.path}`;

            // Set test status to pending
            this.apiExplorer.testResults[endpointKey] = {
                status: 'pending',
                response: null,
                error: null,
                responseTime: null,
                timestamp: null
            };

            const startTime = Date.now();

            try {
                // Build URL with path params
                let url = endpoint.path;
                if (params.pathParams) {
                    Object.entries(params.pathParams).forEach(([key, value]) => {
                        url = url.replace(`:${key}`, value);
                    });
                }

                // Add query params
                if (params.queryParams) {
                    const queryString = new URLSearchParams(params.queryParams).toString();
                    if (queryString) {
                        url += '?' + queryString;
                    }
                }

                // Create abort controller for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

                // Build request options
                const options = {
                    method: endpoint.method,
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal
                };

                // Add body for POST/DELETE
                if (endpoint.method !== 'GET' && params.bodyParams) {
                    options.body = JSON.stringify(params.bodyParams);
                }

                // Make request
                const response = await fetch(url, options);
                clearTimeout(timeoutId);
                const responseTime = Date.now() - startTime;

                let responseData;
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    responseData = await response.json();
                } else {
                    responseData = await response.text();
                }

                // Update test results
                this.apiExplorer.testResults[endpointKey] = {
                    status: response.ok ? 'success' : 'error',
                    statusCode: response.status,
                    response: responseData,
                    error: response.ok ? null : `HTTP ${response.status}: ${response.statusText}`,
                    responseTime,
                    timestamp: new Date().toISOString(),
                    headers: Object.fromEntries(response.headers.entries())
                };

                // Save to request history
                this.saveRequestHistory(endpoint, params, this.apiExplorer.testResults[endpointKey]);

                return this.apiExplorer.testResults[endpointKey];

            } catch (error) {
                const responseTime = Date.now() - startTime;

                // Provide better error message for timeouts
                let errorMessage = error.message;
                if (error.name === 'AbortError') {
                    errorMessage = 'Request timed out after 10 seconds';
                }

                this.apiExplorer.testResults[endpointKey] = {
                    status: 'error',
                    response: null,
                    error: errorMessage,
                    responseTime,
                    timestamp: new Date().toISOString()
                };

                this.saveRequestHistory(endpoint, params, this.apiExplorer.testResults[endpointKey]);

                return this.apiExplorer.testResults[endpointKey];
            }
        },

        // Test all GET endpoints
        async testAllGetEndpoints() {
            const getEndpoints = this.apiExplorer.endpoints.filter(e => e.method === 'GET' && !e.requiresParams);

            this.apiExplorer.isTestingAll = true;
            this.apiExplorer.testAllProgress = 0;
            this.apiExplorer.testAllTotal = getEndpoints.length;

            for (let i = 0; i < getEndpoints.length; i++) {
                const endpoint = getEndpoints[i];
                await this.testEndpoint(endpoint);
                this.apiExplorer.testAllProgress = i + 1;

                // Small delay between requests
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            this.apiExplorer.isTestingAll = false;

            // Show summary
            const results = Object.values(this.apiExplorer.testResults);
            const successCount = results.filter(r => r.status === 'success').length;
            const failCount = results.filter(r => r.status === 'error').length;

            alert(`Test Complete!\n\nPassed: ${successCount}\nFailed: ${failCount}\nTotal: ${results.length}`);
        },

        // Generate code for endpoint
        generateCode(endpoint, lang, params = {}) {
            // Build URL
            let url = `http://localhost:3000${endpoint.path}`;
            if (params.pathParams) {
                Object.entries(params.pathParams).forEach(([key, value]) => {
                    url = url.replace(`:${key}`, value);
                });
            }
            if (params.queryParams) {
                const queryString = new URLSearchParams(params.queryParams).toString();
                if (queryString) {
                    url += '?' + queryString;
                }
            }

            if (lang === 'python') {
                if (endpoint.method === 'GET') {
                    return `import requests

response = requests.get('${url}')
data = response.json()
print(data)`;
                } else {
                    const body = params.bodyParams ? JSON.stringify(params.bodyParams, null, 2) : '{}';
                    return `import requests

payload = ${body}
response = requests.${endpoint.method.toLowerCase()}('${url}', json=payload)
data = response.json()
print(data)`;
                }
            } else if (lang === 'javascript') {
                if (endpoint.method === 'GET') {
                    return `const response = await fetch('${url}');
const data = await response.json();
console.log(data);`;
                } else {
                    const body = params.bodyParams ? JSON.stringify(params.bodyParams, null, 2) : '{}';
                    return `const response = await fetch('${url}', {
  method: '${endpoint.method}',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(${body})
});
const data = await response.json();
console.log(data);`;
                }
            } else if (lang === 'curl') {
                if (endpoint.method === 'GET') {
                    return `curl -X GET '${url}'`;
                } else {
                    const body = params.bodyParams ? JSON.stringify(params.bodyParams) : '{}';
                    return `curl -X ${endpoint.method} '${url}' \\
  -H 'Content-Type: application/json' \\
  -d '${body}'`;
                }
            }

            return '# Unsupported language';
        },

        // Copy text to clipboard
        async copyToClipboard(text) {
            try {
                await navigator.clipboard.writeText(text);
                // Could add a toast notification here
                return true;
            } catch (error) {
                console.error('Failed to copy to clipboard:', error);
                // Fallback method
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    return true;
                } catch (err) {
                    document.body.removeChild(textarea);
                    return false;
                }
            }
        },

        // Save request to history
        saveRequestHistory(endpoint, params, result) {
            const historyItem = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                method: endpoint.method,
                path: endpoint.path,
                params,
                status: result.status,
                statusCode: result.statusCode,
                responseTime: result.responseTime
            };

            // Add to beginning of array
            this.apiExplorer.requestHistory.unshift(historyItem);

            // Keep only last 50 requests
            if (this.apiExplorer.requestHistory.length > 50) {
                this.apiExplorer.requestHistory = this.apiExplorer.requestHistory.slice(0, 50);
            }

            // Save to localStorage
            try {
                localStorage.setItem('apiExplorerHistory', JSON.stringify(this.apiExplorer.requestHistory));
            } catch (e) {
                console.error('Error saving API explorer history:', e);
            }
        },

        // Clear request history
        clearRequestHistory() {
            if (confirm('Clear all request history?')) {
                this.apiExplorer.requestHistory = [];
                localStorage.removeItem('apiExplorerHistory');
            }
        },

        // Toggle category expansion
        toggleCategory(category) {
            this.apiExplorer.expandedCategories[category] = !this.apiExplorer.expandedCategories[category];
        },

        // Toggle endpoint details expansion
        toggleEndpointDetails(endpoint) {
            const key = `${endpoint.method}:${endpoint.path}`;
            this.apiExplorer.expandedEndpoints[key] = !this.apiExplorer.expandedEndpoints[key];
        },

        // Get/set endpoint parameters
        getEndpointParams(endpoint) {
            const key = `${endpoint.method}:${endpoint.path}`;
            if (!this.apiExplorer.endpointParams[key]) {
                this.apiExplorer.endpointParams[key] = {};
            }
            return this.apiExplorer.endpointParams[key];
        },

        // Build params object for testEndpoint from stored endpoint parameters
        buildTestParams(endpoint) {
            const storedParams = this.getEndpointParams(endpoint);
            const params = {};

            // Build pathParams object if endpoint has path parameters
            if (endpoint.pathParams && endpoint.pathParams.length > 0) {
                params.pathParams = {};
                endpoint.pathParams.forEach(param => {
                    if (storedParams[param.name]) {
                        params.pathParams[param.name] = storedParams[param.name];
                    }
                });
            }

            // Build bodyParams object if endpoint has body parameters
            if (endpoint.bodyParams && endpoint.bodyParams.length > 0) {
                params.bodyParams = {};
                endpoint.bodyParams.forEach(param => {
                    if (storedParams[param.name]) {
                        params.bodyParams[param.name] = storedParams[param.name];
                    }
                });
            }

            // Build queryParams object if endpoint has query parameters
            if (endpoint.queryParams && endpoint.queryParams.length > 0) {
                params.queryParams = {};
                endpoint.queryParams.forEach(param => {
                    if (storedParams[param.name]) {
                        params.queryParams[param.name] = storedParams[param.name];
                    }
                });
            }

            return params;
        },

        // Get endpoints by category
        getEndpointsByCategory(category) {
            return this.apiExplorer.endpoints.filter(e => e.category === category);
        },

        // Get all categories
        getCategories() {
            return [...new Set(this.apiExplorer.endpoints.map(e => e.category))];
        },

        // Get test result for endpoint
        getTestResult(endpoint) {
            const key = `${endpoint.method}:${endpoint.path}`;
            return this.apiExplorer.testResults[key] || null;
        },

        // Check if endpoint details are expanded
        isEndpointExpanded(endpoint) {
            const key = `${endpoint.method}:${endpoint.path}`;
            return this.apiExplorer.expandedEndpoints[key] || false;
        },

        // Format JSON for display
        formatJson(obj) {
            try {
                return JSON.stringify(obj, null, 2);
            } catch (e) {
                return String(obj);
            }
        },

        // ========================
        // DDQD Testing Functions
        // ========================

        // Run quick DDQD test from admin page
        async runQuickDDQD(version, duration) {
            this.ddqd.version = version;
            this.ddqd.testDuration = duration;
            this.switchView('ddqd-testing');
            // Small delay to let view switch complete
            setTimeout(() => this.runDDQDTest(), 100);
        },

        // Run DDQD test with current settings
        async runDDQDTest() {
            if (this.ddqd.currentTest) {
                this.showNotification('Test already running', 'warning');
                return;
            }

            try {
                const response = await fetch('/api/ddqd/run', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Confirm-Action': 'true'
                    },
                    body: JSON.stringify({
                        duration: this.ddqd.testDuration,
                        maxWorkers: this.ddqd.maxWorkers,
                        version: this.ddqd.version,
                        verbose: this.ddqd.verbose
                    })
                });

                const data = await response.json();

                if (data.success) {
                    this.ddqd.currentTest = data.testId;
                    this.ddqd.testOutput = [];
                    this.ddqd.progress = 0;
                    this.showNotification('DDQD test started', 'success');
                    this.startDDQDPolling();
                } else {
                    this.showNotification('Failed to start test: ' + (data.error || 'Unknown error'), 'error');
                }
            } catch (error) {
                console.error('Error starting DDQD test:', error);
                this.showNotification('Failed to start test: ' + error.message, 'error');
            }
        },

        // Stop current DDQD test
        async stopDDQDTest() {
            if (!this.ddqd.currentTest) return;

            try {
                const response = await fetch(`/api/ddqd/stop/${this.ddqd.currentTest}`, {
                    method: 'POST'
                });

                const data = await response.json();

                if (data.success) {
                    this.showNotification('Test stopped', 'info');
                    this.stopDDQDPolling();
                    this.ddqd.currentTest = null;
                    this.fetchDDQDHistory();
                }
            } catch (error) {
                console.error('Error stopping DDQD test:', error);
                this.showNotification('Failed to stop test', 'error');
            }
        },

        // Start polling for DDQD test status
        startDDQDPolling() {
            this.stopDDQDPolling(); // Clear any existing interval
            this.ddqd.pollInterval = setInterval(() => this.pollDDQDStatus(), 2000);
        },

        // Stop polling for DDQD test status
        stopDDQDPolling() {
            if (this.ddqd.pollInterval) {
                clearInterval(this.ddqd.pollInterval);
                this.ddqd.pollInterval = null;
            }
        },

        // Poll DDQD test status
        async pollDDQDStatus() {
            if (!this.ddqd.currentTest) {
                this.stopDDQDPolling();
                return;
            }

            try {
                const response = await fetch(`/api/ddqd/status/${this.ddqd.currentTest}`);
                const data = await response.json();

                this.ddqd.progress = data.progress || 0;

                // Update output if available
                if (data.output && data.output.length > 0) {
                    const newLines = data.output.split('\n').filter(line => line.trim());
                    this.ddqd.testOutput = [...this.ddqd.testOutput, ...newLines].slice(-100); // Keep last 100 lines

                    // Auto-scroll if enabled
                    if (this.ddqd.autoScroll) {
                        this.$nextTick(() => {
                            const outputEl = this.$refs.ddqdOutput;
                            if (outputEl) {
                                outputEl.scrollTop = outputEl.scrollHeight;
                            }
                        });
                    }
                }

                // Check if test completed
                if (data.status === 'completed' || data.status === 'failed') {
                    this.stopDDQDPolling();
                    this.ddqd.currentTest = null;
                    this.ddqd.progress = 100;
                    this.showNotification(`Test ${data.status}`, data.status === 'completed' ? 'success' : 'error');
                    this.fetchDDQDHistory();
                }
            } catch (error) {
                console.error('Error polling DDQD status:', error);
            }
        },

        // Fetch DDQD test history
        async fetchDDQDHistory() {
            try {
                const response = await fetch('/api/ddqd/history');
                const data = await response.json();

                if (data.tests) {
                    this.ddqd.history = data.tests.slice(0, 10); // Keep last 10
                }

                // Also check for active tests and restore them
                await this.restoreActiveDDQDTest();
            } catch (error) {
                console.error('Error fetching DDQD history:', error);
            }
        },

        // Restore active DDQD test after page refresh
        async restoreActiveDDQDTest() {
            try {
                const response = await fetch('/api/ddqd/active');
                const data = await response.json();

                if (data.tests && data.tests.length > 0) {
                    // Restore the first active test
                    const activeTest = data.tests[0];
                    this.ddqd.currentTest = activeTest.testId;
                    this.ddqd.progress = activeTest.progress || 0;
                    this.ddqd.testOutput = [];

                    console.log('Restored active DDQD test:', activeTest.testId);

                    // Start polling for status
                    this.startDDQDPolling();
                }
            } catch (error) {
                console.error('Error restoring active DDQD test:', error);
            }
        },

        // Save DDQD schedule
        async saveDDQDSchedule() {
            try {
                const response = await fetch('/api/ddqd/schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        enabled: this.ddqd.schedule.enabled,
                        cronExpression: this.ddqd.schedule.cronExpression,
                        testConfig: {
                            duration: this.ddqd.testDuration,
                            version: this.ddqd.version
                        }
                    })
                });

                const data = await response.json();

                if (data.success) {
                    this.showNotification('Schedule saved successfully', 'success');
                    this.fetchDDQDSchedule();
                } else {
                    this.showNotification('Failed to save schedule', 'error');
                }
            } catch (error) {
                console.error('Error saving DDQD schedule:', error);
                this.showNotification('Failed to save schedule: ' + error.message, 'error');
            }
        },

        // Fetch DDQD schedule
        async fetchDDQDSchedule() {
            try {
                const response = await fetch('/api/ddqd/schedule');
                const data = await response.json();

                if (data.enabled !== undefined) {
                    this.ddqd.schedule.enabled = data.enabled;
                    this.ddqd.schedule.cronExpression = data.cronExpression || '0 2 * * *';
                    this.ddqd.schedule.nextRun = data.nextRun || null;
                }
            } catch (error) {
                console.error('Error fetching DDQD schedule:', error);
            }
        },

        // ========== MoE Analytics Functions ==========

        // Initialize MoE Analytics (called when switching to analytics view)
        async initMoeAnalytics() {
            await this.fetchAllMoeAnalytics();
            // Auto-refresh every 5 seconds
            if (this.moeAnalytics.refreshInterval) {
                clearInterval(this.moeAnalytics.refreshInterval);
            }
            this.moeAnalytics.refreshInterval = setInterval(() => {
                if (this.currentView === 'moe-analytics') {
                    this.fetchAllMoeAnalytics();
                }
            }, 5000);
        },

        // Fetch all MoE analytics metrics
        async fetchAllMoeAnalytics() {
            try {
                await Promise.all([
                    this.fetchRoutingAccuracyAnalytics(),
                    this.fetchConfidenceDistributionAnalytics(),
                    this.fetchPoolUtilizationAnalytics()
                ]);
                this.moeAnalytics.lastUpdate = new Date().toLocaleTimeString();
            } catch (error) {
                console.error('Error fetching MoE analytics:', error);
            }
        },

        // Fetch routing accuracy analytics
        async fetchRoutingAccuracyAnalytics() {
            try {
                const response = await fetch('/api/moe/accuracy');
                const data = await response.json();

                this.moeAnalytics.routingMetrics.accuracy = `${data.accuracy}%`;
                this.moeAnalytics.routingMetrics.avgConfidence = data.avg_confidence || '0.00';
                this.moeAnalytics.routingMetrics.decisions24h = data.last_24h?.decisions || 0;

                // Update status based on accuracy
                const accuracy = parseFloat(data.accuracy);
                if (accuracy >= 80) this.moeAnalytics.routingMetrics.status = 'healthy';
                else if (accuracy >= 60) this.moeAnalytics.routingMetrics.status = 'warning';
                else this.moeAnalytics.routingMetrics.status = 'critical';

                // Fetch routing decisions for strategy breakdown
                const routingResponse = await fetch('/api/moe/routing');
                const routingData = await routingResponse.json();
                const recentDecisions = routingData.decisions.slice(0, 20);

                const singleExpert = recentDecisions.filter(d => d.decision?.strategy === 'single_expert').length;
                const multiExpert = recentDecisions.filter(d => d.decision?.strategy === 'multi_expert_parallel').length;
                const sparseActivation = recentDecisions.length > 0
                    ? ((singleExpert / recentDecisions.length) * 100).toFixed(0)
                    : 0;

                this.moeAnalytics.routingMetrics.singleExpertCount = singleExpert;
                this.moeAnalytics.routingMetrics.multiExpertCount = multiExpert;
                this.moeAnalytics.routingMetrics.sparseActivation = `${sparseActivation}%`;
            } catch (error) {
                console.error('Error fetching routing accuracy analytics:', error);
            }
        },

        // Fetch confidence distribution analytics
        async fetchConfidenceDistributionAnalytics() {
            try {
                const response = await fetch('/api/moe/confidence-distribution');
                const data = await response.json();

                this.moeAnalytics.confidenceDistribution.ranges = data.ranges;

                // Update chart if it exists
                this.$nextTick(() => {
                    this.updateConfidenceChart();
                });
            } catch (error) {
                console.error('Error fetching confidence distribution analytics:', error);
            }
        },

        // Update or create confidence chart
        updateConfidenceChart() {
            if (typeof Chart === 'undefined') {
                console.error('Chart.js not loaded');
                return;
            }

            const canvas = document.getElementById('moe-confidence-chart');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const ranges = this.moeAnalytics.confidenceDistribution.ranges;

            const chartData = {
                labels: ranges.map(r => r.label),
                datasets: [{
                    label: 'Routing Decisions',
                    data: ranges.map(r => r.count),
                    backgroundColor: [
                        '#ef4444', // Low - Red
                        '#f59e0b', // Medium - Orange
                        '#3b82f6', // High - Blue
                        '#10b981'  // Excellent - Green
                    ],
                    borderWidth: 0
                }]
            };

            if (this.moeAnalytics.confidenceChart) {
                this.moeAnalytics.confidenceChart.data = chartData;
                this.moeAnalytics.confidenceChart.update();
            } else {
                this.moeAnalytics.confidenceChart = new Chart(ctx, {
                    type: 'bar',
                    data: chartData,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.1)'
                                },
                                ticks: {
                                    color: '#9ca3af',
                                    precision: 0
                                }
                            },
                            x: {
                                grid: {
                                    display: false
                                },
                                ticks: {
                                    color: '#9ca3af'
                                }
                            }
                        }
                    }
                });
            }
        },

        // Fetch pool utilization analytics
        async fetchPoolUtilizationAnalytics() {
            try {
                const response = await fetch('/api/moe/pool-utilization');
                const data = await response.json();

                const { utilization, pool_health } = data;

                this.moeAnalytics.poolUtilization.activeWorkers = pool_health.active;
                this.moeAnalytics.poolUtilization.status = pool_health.status;

                // Update worker counts
                this.moeAnalytics.poolUtilization.development = utilization.development;
                this.moeAnalytics.poolUtilization.security = utilization.security;
                this.moeAnalytics.poolUtilization.inventory = utilization.inventory;

                // Calculate percentages
                const maxCapacity = data.max_capacity || 64;
                this.moeAnalytics.poolUtilization.devPct = Math.min((utilization.development / maxCapacity * 100), 100);
                this.moeAnalytics.poolUtilization.secPct = Math.min((utilization.security / maxCapacity * 100), 100);
                this.moeAnalytics.poolUtilization.invPct = Math.min((utilization.inventory / maxCapacity * 100), 100);
            } catch (error) {
                console.error('Error fetching pool utilization analytics:', error);
            }
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
