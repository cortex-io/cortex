/**
 * Commit-Relay Dashboard - Frontend JavaScript
 * Real-time monitoring and visualization
 */

// WebSocket connection
let ws = null;
let reconnectInterval = null;
let charts = {};

// Connection management
function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus(true);
        clearInterval(reconnectInterval);
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleMessage(message);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);

        // Attempt to reconnect every 3 seconds
        if (!reconnectInterval) {
            reconnectInterval = setInterval(() => {
                console.log('Attempting to reconnect...');
                connect();
            }, 3000);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };
}

// Update connection status indicator
function updateConnectionStatus(connected) {
    const dot = document.getElementById('connectionDot');
    const status = document.getElementById('connectionStatus');

    if (connected) {
        dot.classList.add('connected');
        status.textContent = 'Connected';
    } else {
        dot.classList.remove('connected');
        status.textContent = 'Disconnected';
    }
}

// Handle incoming WebSocket messages
function handleMessage(message) {
    if (message.type === 'initial' || message.type === 'update') {
        updateDashboard(message.data);
    }
}

// Update all dashboard components with new data
function updateDashboard(metrics) {
    if (!metrics) return;

    // Update stat cards
    updateStatCards(metrics);

    // Update charts
    updateCharts(metrics);

    // Update master agents
    updateMasters(metrics);

    // Update tasks
    updateTasks(metrics);

    // Update timestamp
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();
}

// Update stat cards
function updateStatCards(metrics) {
    const { workers, tokens, tasks } = metrics;

    document.getElementById('activeWorkers').textContent = workers.active;
    document.getElementById('successRate').textContent = `${workers.successRate}%`;
    document.getElementById('inProgressTasks').textContent = tasks.inProgress;
    document.getElementById('tokenUsage').textContent = `${tokens.usagePercentage}%`;
}

// Update charts
function updateCharts(metrics) {
    updateTokenChart(metrics.tokens);
    updateWorkerChart(metrics.workers);
}

// Token Budget Chart
function updateTokenChart(tokens) {
    const ctx = document.getElementById('tokenChart');

    if (!charts.token) {
        charts.token = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [
                    'Coordinator Master',
                    'Security Master',
                    'Development Master',
                    'Workers Allocated',
                    'Available',
                    'Emergency Reserve'
                ],
                datasets: [{
                    data: [0, 0, 0, 0, 0, 0],
                    backgroundColor: [
                        '#667eea',
                        '#f56565',
                        '#48bb78',
                        '#ed8936',
                        '#4299e1',
                        '#9f7aea'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                return `${label}: ${value.toLocaleString()} tokens`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Update data
    charts.token.data.datasets[0].data = [
        tokens.mastersUsed || 0,
        0, // Security will be calculated from masters detail
        0, // Development will be calculated from masters detail
        tokens.workersAllocated || 0,
        tokens.available || 0,
        tokens.emergencyReserve || 0
    ];

    charts.token.update();

    // Update legend
    updateTokenLegend(tokens);
}

// Worker Status Chart
function updateWorkerChart(workers) {
    const ctx = document.getElementById('workerChart');

    if (!charts.worker) {
        charts.worker = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Active', 'Completed', 'Failed'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: [
                        '#ed8936',
                        '#48bb78',
                        '#f56565'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                return `${label}: ${value} workers`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Update data
    charts.worker.data.datasets[0].data = [
        workers.active || 0,
        workers.completed || 0,
        workers.failed || 0
    ];

    charts.worker.update();

    // Update legend
    updateWorkerLegend(workers);
}

// Update token chart legend
function updateTokenLegend(tokens) {
    const legend = document.getElementById('tokenLegend');
    legend.innerHTML = `
        <div class="legend-item">
            <div class="legend-color" style="background: #667eea;"></div>
            <span>Masters: ${tokens.mastersUsed?.toLocaleString() || 0}</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #ed8936;"></div>
            <span>Workers: ${tokens.workersAllocated?.toLocaleString() || 0}</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #4299e1;"></div>
            <span>Available: ${tokens.available?.toLocaleString() || 0}</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #9f7aea;"></div>
            <span>Emergency: ${tokens.emergencyReserve?.toLocaleString() || 0}</span>
        </div>
    `;
}

// Update worker chart legend
function updateWorkerLegend(workers) {
    const legend = document.getElementById('workerLegend');
    legend.innerHTML = `
        <div class="legend-item">
            <div class="legend-color" style="background: #ed8936;"></div>
            <span>Active: ${workers.active || 0}</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #48bb78;"></div>
            <span>Completed: ${workers.completed || 0}</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #f56565;"></div>
            <span>Failed: ${workers.failed || 0}</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #4299e1;"></div>
            <span>Success Rate: ${workers.successRate || 0}%</span>
        </div>
    `;
}

// Update master agents
function updateMasters(metrics) {
    const { masters } = metrics;

    // Coordinator
    updateMaster('coord', masters.coordinator);

    // Security
    updateMaster('sec', masters.security);

    // Development
    updateMaster('dev', masters.development);
}

// Update individual master
function updateMaster(prefix, data) {
    document.getElementById(`${prefix}Allocated`).textContent =
        `${data.allocated?.toLocaleString() || 0} tokens`;
    document.getElementById(`${prefix}Used`).textContent =
        `${data.used?.toLocaleString() || 0} tokens`;
    document.getElementById(`${prefix}Pool`).textContent =
        `${data.workerPool?.toLocaleString() || 0} tokens`;

    const percentage = data.allocated > 0
        ? (data.used / data.allocated) * 100
        : 0;
    document.getElementById(`${prefix}Progress`).style.width = `${percentage}%`;
}

// Update tasks section
function updateTasks(metrics) {
    const { tasks } = metrics;

    // Update task counts
    document.getElementById('pendingCount').textContent = tasks.pending || 0;
    document.getElementById('inProgressCount').textContent = tasks.inProgress || 0;
    document.getElementById('completedCount').textContent = tasks.completed || 0;

    // Fetch and display task list
    fetchTasks();
}

// Fetch full task list from API
async function fetchTasks() {
    try {
        const response = await fetch('/api/tasks');
        const data = await response.json();

        if (data.tasks) {
            renderTasksList(data.tasks);
        }
    } catch (error) {
        console.error('Error fetching tasks:', error);
    }
}

// Render tasks list
function renderTasksList(tasks) {
    const tasksList = document.getElementById('tasksList');

    // Show only recent tasks (last 10)
    const recentTasks = tasks.slice(-10).reverse();

    if (recentTasks.length === 0) {
        tasksList.innerHTML = '<div class="task-item"><div class="task-info">No tasks yet</div></div>';
        return;
    }

    tasksList.innerHTML = recentTasks.map(task => `
        <div class="task-item">
            <div class="task-info">
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-meta">
                    ${task.type} • ${task.priority} • ${task.assigned_to}
                    ${task.repository ? ` • ${task.repository}` : ''}
                </div>
            </div>
            <div class="task-badge ${task.status.replace('-', ' ')}">${task.status}</div>
        </div>
    `).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing dashboard...');

    // Connect WebSocket
    connect();

    // Fetch initial data via HTTP (fallback)
    fetch('/api/metrics')
        .then(res => res.json())
        .then(data => {
            console.log('Initial metrics loaded');
            updateDashboard(data);
        })
        .catch(error => {
            console.error('Error fetching initial metrics:', error);
        });

    // Poll for updates every 5 seconds as fallback
    setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            fetch('/api/metrics')
                .then(res => res.json())
                .then(data => updateDashboard(data))
                .catch(error => console.error('Error polling metrics:', error));
        }
    }, 5000);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
});
