/**
 * Dashboard Server Tests
 * Tests for API endpoints and core functionality
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

// Test configuration
const BASE_URL = 'http://localhost:3001'; // Use different port for testing
const TIMEOUT = 5000;

// Helper function to make HTTP requests
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, TIMEOUT);

        http.get(url, (res) => {
            clearTimeout(timeoutId);
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ status: res.statusCode, data: jsonData });
                } catch (error) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        }).on('error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });
    });
}

// Test suite
describe('Dashboard Server', function() {
    this.timeout(TIMEOUT);

    describe('Health Check', () => {
        it('should return healthy status', async () => {
            try {
                const { status, data } = await httpGet(`${BASE_URL}/api/health`);
                assert.strictEqual(status, 200, 'Status should be 200');
                assert.strictEqual(data.status, 'healthy', 'Should return healthy status');
                assert.ok(data.uptime >= 0, 'Should have uptime');
                assert.ok(data.timestamp, 'Should have timestamp');
            } catch (error) {
                if (error.message.includes('ECONNREFUSED')) {
                    console.log('⚠️  Dashboard server not running. Skipping test.');
                    this.skip();
                } else {
                    throw error;
                }
            }
        });
    });

    describe('Metrics Endpoint', () => {
        it('should return metrics data', async () => {
            try {
                const { status, data } = await httpGet(`${BASE_URL}/api/metrics`);
                assert.strictEqual(status, 200, 'Status should be 200');

                // Check structure
                assert.ok(data.workers, 'Should have workers data');
                assert.ok(data.tokens, 'Should have tokens data');
                assert.ok(data.tasks, 'Should have tasks data');
                assert.ok(data.masters, 'Should have masters data');
                assert.ok(data.timestamp, 'Should have timestamp');
            } catch (error) {
                if (error.message.includes('ECONNREFUSED')) {
                    console.log('⚠️  Dashboard server not running. Skipping test.');
                    this.skip();
                } else {
                    throw error;
                }
            }
        });

        it('should have correct workers structure', async () => {
            try {
                const { data } = await httpGet(`${BASE_URL}/api/metrics`);

                assert.ok(typeof data.workers.active === 'number', 'Active should be number');
                assert.ok(typeof data.workers.completed === 'number', 'Completed should be number');
                assert.ok(typeof data.workers.failed === 'number', 'Failed should be number');
                assert.ok(typeof data.workers.successRate === 'number', 'Success rate should be number');
            } catch (error) {
                if (error.message.includes('ECONNREFUSED')) {
                    this.skip();
                } else {
                    throw error;
                }
            }
        });

        it('should have correct tokens structure', async () => {
            try {
                const { data } = await httpGet(`${BASE_URL}/api/metrics`);

                assert.ok(typeof data.tokens.total === 'number', 'Total should be number');
                assert.ok(typeof data.tokens.used === 'number', 'Used should be number');
                assert.ok(typeof data.tokens.available === 'number', 'Available should be number');
                assert.ok(typeof data.tokens.usagePercentage === 'number', 'Usage percentage should be number');
            } catch (error) {
                if (error.message.includes('ECONNREFUSED')) {
                    this.skip();
                } else {
                    throw error;
                }
            }
        });

        it('should have correct tasks structure', async () => {
            try {
                const { data } = await httpGet(`${BASE_URL}/api/metrics`);

                assert.ok(typeof data.tasks.pending === 'number', 'Pending should be number');
                assert.ok(typeof data.tasks.inProgress === 'number', 'In progress should be number');
                assert.ok(typeof data.tasks.completed === 'number', 'Completed should be number');
            } catch (error) {
                if (error.message.includes('ECONNREFUSED')) {
                    this.skip();
                } else {
                    throw error;
                }
            }
        });

        it('should have all three master agents', async () => {
            try {
                const { data } = await httpGet(`${BASE_URL}/api/metrics`);

                assert.ok(data.masters.coordinator, 'Should have coordinator master');
                assert.ok(data.masters.security, 'Should have security master');
                assert.ok(data.masters.development, 'Should have development master');
            } catch (error) {
                if (error.message.includes('ECONNREFUSED')) {
                    this.skip();
                } else {
                    throw error;
                }
            }
        });
    });

    describe('Workers Endpoint', () => {
        it('should return worker pool data', async () => {
            try {
                const { status, data } = await httpGet(`${BASE_URL}/api/workers`);
                assert.strictEqual(status, 200, 'Status should be 200');

                assert.ok(Array.isArray(data.active_workers), 'Should have active_workers array');
                assert.ok(Array.isArray(data.completed_workers), 'Should have completed_workers array');
                assert.ok(Array.isArray(data.failed_workers), 'Should have failed_workers array');
            } catch (error) {
                if (error.message.includes('ECONNREFUSED')) {
                    this.skip();
                } else {
                    throw error;
                }
            }
        });
    });

    describe('Tasks Endpoint', () => {
        it('should return task queue data', async () => {
            try {
                const { status, data } = await httpGet(`${BASE_URL}/api/tasks`);
                assert.strictEqual(status, 200, 'Status should be 200');

                assert.ok(Array.isArray(data.tasks), 'Should have tasks array');
                assert.ok(data.version, 'Should have version');
            } catch (error) {
                if (error.message.includes('ECONNREFUSED')) {
                    this.skip();
                } else {
                    throw error;
                }
            }
        });
    });

    describe('Static Files', () => {
        it('should serve index.html', async () => {
            try {
                const { status } = await httpGet(BASE_URL);
                assert.strictEqual(status, 200, 'Should serve index page');
            } catch (error) {
                if (error.message.includes('ECONNREFUSED')) {
                    this.skip();
                } else {
                    throw error;
                }
            }
        });
    });
});

// Run tests if executed directly
if (require.main === module) {
    console.log('Running dashboard server tests...\n');

    // Simple test runner
    const tests = [
        {
            name: 'Health Check',
            fn: async () => {
                const { status, data } = await httpGet(`${BASE_URL}/api/health`);
                assert.strictEqual(status, 200);
                assert.strictEqual(data.status, 'healthy');
                console.log('✓ Health check passed');
            }
        },
        {
            name: 'Metrics Endpoint',
            fn: async () => {
                const { status, data } = await httpGet(`${BASE_URL}/api/metrics`);
                assert.strictEqual(status, 200);
                assert.ok(data.workers && data.tokens && data.tasks);
                console.log('✓ Metrics endpoint passed');
            }
        },
        {
            name: 'Workers Endpoint',
            fn: async () => {
                const { status, data } = await httpGet(`${BASE_URL}/api/workers`);
                assert.strictEqual(status, 200);
                assert.ok(Array.isArray(data.active_workers));
                console.log('✓ Workers endpoint passed');
            }
        },
        {
            name: 'Tasks Endpoint',
            fn: async () => {
                const { status, data } = await httpGet(`${BASE_URL}/api/tasks`);
                assert.strictEqual(status, 200);
                assert.ok(Array.isArray(data.tasks));
                console.log('✓ Tasks endpoint passed');
            }
        }
    ];

    (async () => {
        let passed = 0;
        let failed = 0;

        for (const test of tests) {
            try {
                await test.fn();
                passed++;
            } catch (error) {
                if (error.message.includes('ECONNREFUSED')) {
                    console.log('\n⚠️  Dashboard server not running on port 3001');
                    console.log('Start the server with: DASHBOARD_PORT=3001 npm start');
                    process.exit(1);
                }
                console.log(`✗ ${test.name} failed:`, error.message);
                failed++;
            }
        }

        console.log(`\nTests: ${passed} passed, ${failed} failed`);
        process.exit(failed > 0 ? 1 : 0);
    })();
}

module.exports = { httpGet };
