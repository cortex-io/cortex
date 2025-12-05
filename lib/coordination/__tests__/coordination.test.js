/**
 * Tests for Coordination Daemon
 */

const { createCoordinationDaemon, WorkerStatus, TaskStatus } = require('../index');
const { CoordinationClient } = require('../client');
const { StateStore, PersistenceStrategy } = require('../state-store');
const { MessageBus, Priority } = require('../message-bus');

// Helper to wait for condition
async function waitFor(condition, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timeout waiting for condition');
}

describe('StateStore', () => {
  let store;

  beforeEach(async () => {
    store = new StateStore({
      persistence: PersistenceStrategy.MEMORY_ONLY
    });
    await store.initialize();
  });

  afterEach(async () => {
    await store.shutdown();
  });

  test('should set and get values', () => {
    store.set('workers', 'worker-001', { id: 'worker-001', status: 'idle' });
    const worker = store.get('workers', 'worker-001');
    expect(worker).toEqual({ id: 'worker-001', status: 'idle' });
  });

  test('should update values', () => {
    store.set('workers', 'worker-001', { id: 'worker-001', status: 'idle' });
    store.update('workers', 'worker-001', { status: 'busy' });
    const worker = store.get('workers', 'worker-001');
    expect(worker.status).toBe('busy');
  });

  test('should delete values', () => {
    store.set('workers', 'worker-001', { id: 'worker-001' });
    store.delete('workers', 'worker-001');
    const worker = store.get('workers', 'worker-001');
    expect(worker).toBeUndefined();
  });

  test('should handle transactions', () => {
    const txnId = store.beginTransaction();
    expect(txnId).toBeTruthy();

    store.set('workers', 'worker-001', { id: 'worker-001' });
    store.set('workers', 'worker-002', { id: 'worker-002' });

    store.commitTransaction();

    expect(store.get('workers', 'worker-001')).toBeTruthy();
    expect(store.get('workers', 'worker-002')).toBeTruthy();
  });

  test('should rollback transactions', () => {
    store.beginTransaction();
    store.set('workers', 'worker-001', { id: 'worker-001' });
    store.rollbackTransaction();

    expect(store.get('workers', 'worker-001')).toBeUndefined();
  });

  test('should emit state-changed events', (done) => {
    store.on('state-changed', (data) => {
      expect(data.collection).toBe('workers');
      expect(data.operation).toBe('set');
      done();
    });

    store.set('workers', 'worker-001', { id: 'worker-001' });
  });

  test('should track metrics', () => {
    store.set('workers', 'worker-001', { id: 'worker-001' });
    store.set('tasks', 'task-001', { id: 'task-001' });

    const metrics = store.getMetrics();
    expect(metrics.operations).toBeGreaterThan(0);
    expect(metrics.collections.workers).toBe(1);
    expect(metrics.collections.tasks).toBe(1);
  });
});

describe('MessageBus', () => {
  let bus;

  beforeEach(() => {
    bus = new MessageBus();
    bus.start();
  });

  afterEach(() => {
    bus.stop();
  });

  test('should publish and receive messages', (done) => {
    bus.subscribe('test-topic', (message) => {
      expect(message.payload).toBe('test-data');
      done();
    });

    bus.publish('test-topic', 'test-data');
  });

  test('should handle priority messages', (done) => {
    const receivedMessages = [];

    bus.subscribe('test-topic', (message) => {
      receivedMessages.push(message.priority);

      if (receivedMessages.length === 3) {
        // Critical should be delivered first
        expect(receivedMessages[0]).toBe(Priority.CRITICAL);
        done();
      }
    });

    bus.publish('test-topic', 'low', { priority: Priority.LOW });
    bus.publish('test-topic', 'normal', { priority: Priority.NORMAL });
    bus.publish('test-topic', 'critical', { priority: Priority.CRITICAL });
  });

  test('should unsubscribe correctly', () => {
    let callCount = 0;

    const unsubscribe = bus.subscribe('test-topic', () => {
      callCount++;
    });

    bus.publish('test-topic', 'data-1');
    unsubscribe();
    bus.publish('test-topic', 'data-2');

    setTimeout(() => {
      expect(callCount).toBe(1);
    }, 100);
  });

  test('should track metrics', () => {
    bus.publish('test-topic', 'data');

    const metrics = bus.getMetrics();
    expect(metrics.messagesSent).toBeGreaterThan(0);
  });
});

describe('CoordinationDaemon', () => {
  let daemon;

  beforeEach(async () => {
    daemon = createCoordinationDaemon({
      port: 9600, // Use different port to avoid conflicts
      wsPort: 9601,
      persistence: PersistenceStrategy.MEMORY_ONLY
    });
    await daemon.start();
  });

  afterEach(async () => {
    if (daemon) {
      await daemon.stop();
    }
  });

  test('should start successfully', () => {
    expect(daemon).toBeTruthy();
  });

  test('should register workers', async () => {
    const result = await daemon.registerWorker('worker-001', ['development']);
    expect(result.success).toBe(true);
    expect(result.worker.id).toBe('worker-001');
    expect(result.worker.status).toBe(WorkerStatus.IDLE);
  });

  test('should unregister workers', async () => {
    await daemon.registerWorker('worker-001', ['development']);
    const result = await daemon.unregisterWorker('worker-001');
    expect(result.success).toBe(true);
  });

  test('should assign tasks to workers', async () => {
    await daemon.registerWorker('worker-001', ['development']);

    const result = await daemon.assignTask('task-001', 'worker-001', {
      title: 'Test task',
      type: 'development'
    });

    expect(result.success).toBe(true);
    expect(result.task.status).toBe(TaskStatus.ASSIGNED);
    expect(result.workerId).toBe('worker-001');
  });

  test('should auto-assign tasks to available workers', async () => {
    await daemon.registerWorker('worker-001', ['development']);

    const result = await daemon.assignTask('task-001', null, {
      title: 'Test task',
      capabilities: ['development']
    });

    expect(result.success).toBe(true);
    expect(result.workerId).toBe('worker-001');
  });

  test('should complete tasks', async () => {
    await daemon.registerWorker('worker-001', ['development']);
    await daemon.assignTask('task-001', 'worker-001', { title: 'Test task' });

    const result = await daemon.completeTask('task-001', { status: 'success' });

    expect(result.success).toBe(true);
    expect(result.task.status).toBe(TaskStatus.COMPLETED);
  });

  test('should fail tasks', async () => {
    await daemon.registerWorker('worker-001', ['development']);
    await daemon.assignTask('task-001', 'worker-001', { title: 'Test task' });

    const result = await daemon.failTask('task-001', { message: 'Task failed' });

    expect(result.success).toBe(true);
    expect(result.task.status).toBe(TaskStatus.FAILED);
  });

  test('should get state', async () => {
    await daemon.registerWorker('worker-001', ['development']);
    await daemon.assignTask('task-001', 'worker-001', { title: 'Test task' });

    const state = daemon.getState();

    expect(state.workers.length).toBe(1);
    expect(state.tasks.length).toBe(1);
    expect(state.metadata.totalWorkers).toBe(1);
    expect(state.metadata.totalTasks).toBe(1);
  });

  test('should get metrics', async () => {
    const metrics = daemon.getMetrics();

    expect(metrics.daemon).toBeTruthy();
    expect(metrics.stateStore).toBeTruthy();
    expect(metrics.messageBus).toBeTruthy();
  });

  test('should emit events', (done) => {
    daemon.on('worker-registered', (data) => {
      expect(data.workerId).toBe('worker-001');
      done();
    });

    daemon.registerWorker('worker-001', ['development']);
  });

  test('should handle HTTP health check', async () => {
    const response = await fetch('http://localhost:9600/health');
    const data = await response.json();

    expect(data.status).toBe('healthy');
  });

  test('should handle HTTP metrics endpoint', async () => {
    const response = await fetch('http://localhost:9600/api/metrics');
    const data = await response.json();

    expect(data.daemon).toBeTruthy();
  });
});

describe('CoordinationClient', () => {
  let daemon;
  let client;

  beforeEach(async () => {
    daemon = createCoordinationDaemon({
      port: 9700,
      wsPort: 9701,
      persistence: PersistenceStrategy.MEMORY_ONLY
    });
    await daemon.start();

    client = new CoordinationClient({
      workerId: 'test-worker',
      capabilities: ['testing'],
      wsUrl: 'ws://localhost:9701',
      httpUrl: 'http://localhost:9700'
    });
  });

  afterEach(async () => {
    if (client && client.connected) {
      client.disconnect();
    }
    if (daemon) {
      await daemon.stop();
    }
  });

  test('should connect to daemon', async () => {
    await client.connect();
    expect(client.connected).toBe(true);
  });

  test('should receive task assignments', async () => {
    const taskReceived = new Promise((resolve) => {
      client.on('task_assigned', (task) => {
        resolve(task);
      });
    });

    await client.connect();

    // Wait for connection to be established
    await waitFor(() => client.connected);

    // Assign task from daemon
    await daemon.assignTask('test-task', 'test-worker', {
      title: 'Test task'
    });

    const task = await taskReceived;
    expect(task.id).toBe('test-task');
  });

  test('should complete tasks', async () => {
    await client.connect();
    await waitFor(() => client.connected);

    await daemon.assignTask('test-task', 'test-worker', { title: 'Test task' });

    client.completeTask('test-task', { status: 'success' });

    // Wait for task to be completed
    await waitFor(async () => {
      const state = daemon.getState();
      const task = state.tasks.find(t => t.id === 'test-task');
      return task && task.status === TaskStatus.COMPLETED;
    });

    const state = daemon.getState();
    const task = state.tasks.find(t => t.id === 'test-task');
    expect(task.status).toBe(TaskStatus.COMPLETED);
  });

  test('should reconnect on disconnection', async () => {
    await client.connect();

    const reconnectedPromise = new Promise((resolve) => {
      client.on('reconnected', resolve);
    });

    // Simulate disconnection by stopping and restarting daemon
    await daemon.stop();

    daemon = createCoordinationDaemon({
      port: 9700,
      wsPort: 9701,
      persistence: PersistenceStrategy.MEMORY_ONLY
    });
    await daemon.start();

    await reconnectedPromise;
    expect(client.connected).toBe(true);
  }, 15000);
});

describe('Performance', () => {
  let daemon;

  beforeEach(async () => {
    daemon = createCoordinationDaemon({
      port: 9800,
      wsPort: 9801,
      persistence: PersistenceStrategy.MEMORY_ONLY
    });
    await daemon.start();
  });

  afterEach(async () => {
    if (daemon) {
      await daemon.stop();
    }
  });

  test('should handle 100 workers', async () => {
    const workerPromises = [];

    for (let i = 0; i < 100; i++) {
      workerPromises.push(
        daemon.registerWorker(`worker-${i}`, ['testing'])
      );
    }

    await Promise.all(workerPromises);

    const state = daemon.getState();
    expect(state.workers.length).toBe(100);
  });

  test('should handle 1000 task assignments', async () => {
    // Register 10 workers
    for (let i = 0; i < 10; i++) {
      await daemon.registerWorker(`worker-${i}`, ['testing']);
    }

    const startTime = Date.now();
    const taskPromises = [];

    // Create 1000 tasks
    for (let i = 0; i < 1000; i++) {
      taskPromises.push(
        daemon.assignTask(`task-${i}`, null, {
          title: `Task ${i}`,
          capabilities: ['testing']
        })
      );
    }

    await Promise.all(taskPromises);
    const duration = Date.now() - startTime;

    const tasksPerSecond = 1000 / (duration / 1000);

    console.log(`Task assignment rate: ${tasksPerSecond.toFixed(2)} tasks/sec`);
    console.log(`Duration: ${duration}ms`);

    // Verify all tasks were assigned
    const state = daemon.getState();
    expect(state.tasks.length).toBe(1000);
  }, 30000);

  test('should maintain low latency', async () => {
    await daemon.registerWorker('worker-001', ['testing']);

    // Warm up
    for (let i = 0; i < 10; i++) {
      await daemon.assignTask(`warmup-${i}`, 'worker-001', { title: 'Warmup' });
    }

    // Measure latency
    const latencies = [];

    for (let i = 0; i < 100; i++) {
      const start = Date.now();
      await daemon.assignTask(`test-${i}`, 'worker-001', { title: 'Test' });
      latencies.push(Date.now() - start);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log(`Average latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`Max latency: ${Math.max(...latencies)}ms`);
    console.log(`Min latency: ${Math.min(...latencies)}ms`);

    // Target: <100ms average latency
    expect(avgLatency).toBeLessThan(100);
  });
});
