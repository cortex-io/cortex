/**
 * Trace Waterfall Visualization
 * Part of Phase 2: Dashboard Trace Visualization
 *
 * Provides an interactive waterfall view of distributed traces.
 */

class TraceVisualization {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            minBarWidth: 3,
            maxTimelineMarks: 10,
            animationDelay: 50,
            ...options
        };

        this.currentTrace = null;
        this.selectedSpan = null;
    }

    /**
     * Fetch and render a trace by ID
     */
    async loadTrace(traceId) {
        if (!this.container) {
            console.error('Trace container not found');
            return;
        }

        this.showLoading();

        try {
            const response = await fetch(`/api/traces/${traceId}`);

            if (!response.ok) {
                throw new Error(`Failed to load trace: ${response.statusText}`);
            }

            const trace = await response.json();
            this.currentTrace = trace;
            this.render(trace);
        } catch (error) {
            console.error('Error loading trace:', error);
            this.showError(error.message);
        }
    }

    /**
     * Render a trace object directly
     */
    render(trace) {
        if (!trace || !trace.trace_id) {
            this.showEmpty();
            return;
        }

        this.currentTrace = trace;
        const html = this.buildTraceHTML(trace);
        this.container.innerHTML = html;
        this.attachEventListeners();
    }

    /**
     * Build the complete trace HTML
     */
    buildTraceHTML(trace) {
        const spans = trace.spans || [];
        const totalDuration = trace.duration_ms || this.calculateTotalDuration(spans);
        const spanTree = this.buildSpanTree(spans);

        return `
            <div class="trace-container">
                ${this.buildHeader(trace)}
                ${this.buildSummary(trace, spans)}
                ${this.buildTimeline(totalDuration)}
                <div class="trace-waterfall">
                    ${this.buildSpanRows(spanTree, totalDuration, trace.start_time)}
                </div>
            </div>
        `;
    }

    /**
     * Build trace header
     */
    buildHeader(trace) {
        const status = trace.status || 'unknown';
        const statusClass = status === 'error' ? 'error' : (status === 'completed' ? 'completed' : 'active');
        const duration = this.formatDuration(trace.duration_ms);
        const startTime = new Date(trace.start_time).toLocaleString();

        return `
            <div class="trace-header">
                <div>
                    <h2>Trace Details</h2>
                    <span class="trace-id">${trace.trace_id}</span>
                </div>
                <div class="trace-meta">
                    <div class="trace-meta-item">
                        <span class="trace-status ${statusClass}">${status}</span>
                    </div>
                    <div class="trace-meta-item">
                        <span class="trace-meta-label">Duration:</span>
                        <span class="trace-meta-value">${duration}</span>
                    </div>
                    <div class="trace-meta-item">
                        <span class="trace-meta-label">Started:</span>
                        <span class="trace-meta-value">${startTime}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Build summary statistics
     */
    buildSummary(trace, spans) {
        const spanCount = spans.length;
        const errorCount = trace.error_count || spans.filter(s => s.status === 'error').length;
        const avgDuration = spanCount > 0
            ? Math.round(spans.reduce((sum, s) => sum + (s.duration_ms || 0), 0) / spanCount)
            : 0;
        const criticalPathSpan = this.findCriticalPath(spans);

        return `
            <div class="trace-summary">
                <div class="trace-stat">
                    <div class="trace-stat-value">${spanCount}</div>
                    <div class="trace-stat-label">Spans</div>
                </div>
                <div class="trace-stat">
                    <div class="trace-stat-value">${this.formatDuration(trace.duration_ms)}</div>
                    <div class="trace-stat-label">Total Duration</div>
                </div>
                <div class="trace-stat">
                    <div class="trace-stat-value">${this.formatDuration(avgDuration)}</div>
                    <div class="trace-stat-label">Avg Span</div>
                </div>
                <div class="trace-stat">
                    <div class="trace-stat-value" style="color: ${errorCount > 0 ? 'var(--danger)' : 'var(--success)'}">${errorCount}</div>
                    <div class="trace-stat-label">Errors</div>
                </div>
            </div>
        `;
    }

    /**
     * Build timeline ruler
     */
    buildTimeline(totalDuration) {
        const marks = [];
        const numMarks = Math.min(this.options.maxTimelineMarks, 10);

        for (let i = 0; i <= numMarks; i++) {
            const time = Math.round((totalDuration * i) / numMarks);
            marks.push(`<span class="timeline-mark">${this.formatDuration(time)}</span>`);
        }

        return `
            <div class="trace-timeline">
                <div class="timeline-ruler">
                    ${marks.join('')}
                </div>
            </div>
        `;
    }

    /**
     * Build span rows recursively
     */
    buildSpanRows(spans, totalDuration, traceStartTime, depth = 0) {
        let html = '';
        let index = 0;

        for (const span of spans) {
            const children = span.children || [];
            html += this.buildSpanRow(span, totalDuration, traceStartTime, depth, index);

            if (children.length > 0) {
                html += this.buildSpanRows(children, totalDuration, traceStartTime, depth + 1);
            }

            index++;
        }

        return html;
    }

    /**
     * Build a single span row
     */
    buildSpanRow(span, totalDuration, traceStartTime, depth, index) {
        const startOffset = span.start_time - traceStartTime;
        const duration = span.duration_ms || 0;

        // Calculate position as percentage
        const left = totalDuration > 0 ? (startOffset / totalDuration) * 100 : 0;
        const width = totalDuration > 0 ? Math.max((duration / totalDuration) * 100, 0.5) : 0.5;

        const kind = span.kind || 'internal';
        const status = span.status || 'ok';
        const barClass = status === 'error' ? 'error' : kind;
        const isCritical = span.isCritical ? 'critical-path' : '';

        return `
            <div class="span-row ${isCritical}" style="--depth: ${depth}; --index: ${index}">
                <div class="span-label">
                    <span class="span-depth" style="--depth: ${depth}"></span>
                    <span class="span-name" data-span-id="${span.span_id}" title="${span.name}">
                        ${'  '.repeat(depth)}${span.name}
                    </span>
                </div>
                <div class="span-bar-container">
                    <div class="span-bar ${barClass}"
                         style="left: ${left}%; width: ${width}%"
                         data-span-id="${span.span_id}">
                        <span class="span-duration">${this.formatDuration(duration)}</span>
                    </div>
                </div>
            </div>
            <div class="span-details" id="details-${span.span_id}">
                ${this.buildSpanDetails(span)}
            </div>
        `;
    }

    /**
     * Build span details panel
     */
    buildSpanDetails(span) {
        const attributes = span.attributes || {};
        const events = span.events || [];

        let attributesHtml = '';
        for (const [key, value] of Object.entries(attributes)) {
            attributesHtml += `
                <div class="span-attribute">
                    <span class="attribute-key">${key}</span>
                    <span class="attribute-value">${this.formatValue(value)}</span>
                </div>
            `;
        }

        // Add standard span info
        attributesHtml += `
            <div class="span-attribute">
                <span class="attribute-key">Span ID</span>
                <span class="attribute-value">${span.span_id}</span>
            </div>
            <div class="span-attribute">
                <span class="attribute-key">Parent</span>
                <span class="attribute-value">${span.parent_span_id || 'none (root)'}</span>
            </div>
            <div class="span-attribute">
                <span class="attribute-key">Kind</span>
                <span class="attribute-value">${span.kind || 'internal'}</span>
            </div>
            <div class="span-attribute">
                <span class="attribute-key">Status</span>
                <span class="attribute-value">${span.status || 'ok'}</span>
            </div>
        `;

        let eventsHtml = '';
        if (events.length > 0) {
            eventsHtml = `
                <div class="span-events">
                    <div class="span-events-title">Events (${events.length})</div>
                    ${events.map(event => `
                        <div class="span-event">
                            <span class="event-time">${this.formatTime(event.timestamp - span.start_time)}</span>
                            <span class="event-name">${event.name}</span>
                            ${Object.keys(event.attributes || {}).length > 0
                                ? `<span class="event-attributes">${JSON.stringify(event.attributes)}</span>`
                                : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        return `
            <div class="span-details-header">
                <span class="span-details-title">${span.name}</span>
                <button class="span-details-close" data-span-id="${span.span_id}">&times;</button>
            </div>
            <div class="span-attributes">
                ${attributesHtml}
            </div>
            ${eventsHtml}
        `;
    }

    /**
     * Build span tree from flat list
     */
    buildSpanTree(spans) {
        const spanMap = new Map();
        const roots = [];

        // First pass: create map
        for (const span of spans) {
            spanMap.set(span.span_id, { ...span, children: [] });
        }

        // Second pass: build tree
        for (const span of spans) {
            const node = spanMap.get(span.span_id);

            if (span.parent_span_id && spanMap.has(span.parent_span_id)) {
                spanMap.get(span.parent_span_id).children.push(node);
            } else {
                roots.push(node);
            }
        }

        // Sort by start time
        const sortByStart = (a, b) => a.start_time - b.start_time;
        roots.sort(sortByStart);

        const sortChildren = (node) => {
            if (node.children.length > 0) {
                node.children.sort(sortByStart);
                node.children.forEach(sortChildren);
            }
        };
        roots.forEach(sortChildren);

        return roots;
    }

    /**
     * Find the critical path (longest chain)
     */
    findCriticalPath(spans) {
        // Simple implementation: find span with longest duration
        let maxDuration = 0;
        let criticalSpan = null;

        for (const span of spans) {
            if ((span.duration_ms || 0) > maxDuration) {
                maxDuration = span.duration_ms;
                criticalSpan = span;
            }
        }

        return criticalSpan;
    }

    /**
     * Calculate total duration from spans
     */
    calculateTotalDuration(spans) {
        if (spans.length === 0) return 0;

        let minStart = Infinity;
        let maxEnd = 0;

        for (const span of spans) {
            minStart = Math.min(minStart, span.start_time);
            const endTime = span.end_time || (span.start_time + (span.duration_ms || 0));
            maxEnd = Math.max(maxEnd, endTime);
        }

        return maxEnd - minStart;
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Span name click - show details
        this.container.querySelectorAll('.span-name, .span-bar').forEach(el => {
            el.addEventListener('click', (e) => {
                const spanId = e.target.dataset.spanId;
                this.toggleSpanDetails(spanId);
            });
        });

        // Close button
        this.container.querySelectorAll('.span-details-close').forEach(el => {
            el.addEventListener('click', (e) => {
                const spanId = e.target.dataset.spanId;
                this.hideSpanDetails(spanId);
            });
        });
    }

    /**
     * Toggle span details visibility
     */
    toggleSpanDetails(spanId) {
        const details = document.getElementById(`details-${spanId}`);
        if (details) {
            const isVisible = details.classList.contains('visible');

            // Hide all other details
            this.container.querySelectorAll('.span-details').forEach(el => {
                el.classList.remove('visible');
            });

            // Toggle this one
            if (!isVisible) {
                details.classList.add('visible');
                this.selectedSpan = spanId;
            } else {
                this.selectedSpan = null;
            }
        }
    }

    /**
     * Hide span details
     */
    hideSpanDetails(spanId) {
        const details = document.getElementById(`details-${spanId}`);
        if (details) {
            details.classList.remove('visible');
        }
        if (this.selectedSpan === spanId) {
            this.selectedSpan = null;
        }
    }

    /**
     * Format duration for display
     */
    formatDuration(ms) {
        if (!ms && ms !== 0) return '-';

        if (ms < 1) {
            return '<1ms';
        } else if (ms < 1000) {
            return `${Math.round(ms)}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(2)}s`;
        } else {
            const mins = Math.floor(ms / 60000);
            const secs = ((ms % 60000) / 1000).toFixed(0);
            return `${mins}m ${secs}s`;
        }
    }

    /**
     * Format time offset
     */
    formatTime(ms) {
        return `+${this.formatDuration(ms)}`;
    }

    /**
     * Format attribute value
     */
    formatValue(value) {
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.container.innerHTML = `
            <div class="trace-container">
                <div class="trace-loading">
                    <div class="trace-loading-spinner"></div>
                    <span>Loading trace...</span>
                </div>
            </div>
        `;
    }

    /**
     * Show error state
     */
    showError(message) {
        this.container.innerHTML = `
            <div class="trace-container">
                <div class="trace-error">
                    <div class="trace-error-icon">!</div>
                    <p>Error loading trace: ${message}</p>
                </div>
            </div>
        `;
    }

    /**
     * Show empty state
     */
    showEmpty() {
        this.container.innerHTML = `
            <div class="trace-container">
                <div class="trace-empty">
                    <div class="trace-empty-icon">-</div>
                    <p>No trace data available</p>
                </div>
            </div>
        `;
    }
}

/**
 * Create a trace link element
 */
function createTraceLink(traceId, label = 'View Trace') {
    return `
        <a href="#" class="trace-link" onclick="openTraceModal('${traceId}'); return false;">
            <span class="trace-link-icon">~</span>
            ${label}
        </a>
    `;
}

/**
 * Open trace in modal
 */
function openTraceModal(traceId) {
    let modal = document.getElementById('trace-modal');

    if (!modal) {
        // Create modal
        modal = document.createElement('div');
        modal.id = 'trace-modal';
        modal.className = 'trace-modal';
        modal.innerHTML = `
            <div class="trace-modal-content" id="trace-modal-content"></div>
            <button class="trace-modal-close" onclick="closeTraceModal()">&times;</button>
        `;
        document.body.appendChild(modal);

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeTraceModal();
            }
        });

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeTraceModal();
            }
        });
    }

    // Show modal
    modal.classList.add('visible');

    // Load trace
    const viz = new TraceVisualization('trace-modal-content');
    viz.loadTrace(traceId);
}

/**
 * Close trace modal
 */
function closeTraceModal() {
    const modal = document.getElementById('trace-modal');
    if (modal) {
        modal.classList.remove('visible');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TraceVisualization, createTraceLink, openTraceModal, closeTraceModal };
}
