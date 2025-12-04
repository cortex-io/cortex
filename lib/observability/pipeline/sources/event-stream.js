// lib/observability/pipeline/sources/event-stream.js
// Event Stream Source - collects events from Cortex event system
// Listens to real-time events from masters, workers, and system components

const { Source } = require('../base');
const path = require('path');
const fs = require('fs').promises;

class EventStreamSource extends Source {
  constructor(config = {}) {
    super({
      name: config.name || 'EventStreamSource',
      ...config
    });

    this.eventTypes = config.eventTypes || ['all']; // Filter event types
    this.eventsDir = config.eventsDir || 'coordination/events';
    this.fileWatchers = new Map();
  }

  async initialize() {
    // Ensure events directory exists
    try {
      await fs.mkdir(this.eventsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    return true;
  }

  async start() {
    // Discover event files
    const eventFiles = await this.discoverEventFiles();

    // Create file watchers for each event type
    for (const eventFile of eventFiles) {
      await this.watchEventFile(eventFile);
    }

    this.emit('started', { eventFiles: eventFiles.length });
  }

  async stop() {
    // Stop all file watchers
    for (const [fileName, watcher] of this.fileWatchers) {
      if (watcher.stop) {
        await watcher.stop();
      }
    }
    this.fileWatchers.clear();

    this.emit('stopped');
  }

  async discoverEventFiles() {
    try {
      const files = await fs.readdir(this.eventsDir);
      return files
        .filter(file => file.endsWith('.jsonl'))
        .filter(file => this.shouldWatchFile(file))
        .map(file => path.join(this.eventsDir, file));
    } catch (error) {
      this.emit('error', { source: this.name, error });
      return [];
    }
  }

  shouldWatchFile(fileName) {
    if (this.eventTypes.includes('all')) {
      return true;
    }

    // Check if file matches any of the event types
    return this.eventTypes.some(type => fileName.includes(type));
  }

  async watchEventFile(filePath) {
    const FileWatcherSource = require('./file-watcher');

    const watcher = new FileWatcherSource({
      name: `EventStreamSource:${path.basename(filePath)}`,
      filePath: filePath,
      watchInterval: this.config.watchInterval || 1000
    });

    await watcher.initialize();

    // Forward events from file watcher to our pipeline
    watcher.on('event', (event) => {
      // Enrich with event file metadata
      const enrichedEvent = {
        ...event,
        _eventFile: path.basename(filePath)
      };
      this.emitEvent(enrichedEvent);
    });

    watcher.on('error', (error) => {
      this.emit('error', { source: this.name, filePath, error });
    });

    await watcher.start();
    this.fileWatchers.set(path.basename(filePath), watcher);
  }

  async shutdown() {
    await this.stop();
    await super.shutdown();
  }

  getHealth() {
    return {
      ...super.getHealth(),
      eventTypes: this.eventTypes,
      watchedFiles: Array.from(this.fileWatchers.keys())
    };
  }
}

module.exports = EventStreamSource;
