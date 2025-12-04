// lib/observability/pipeline/sources/file-watcher.js
// File Watcher Source - watches JSONL files for new events
// Provides tail-like functionality for event streams

const { Source } = require('../base');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class FileWatcherSource extends Source {
  constructor(config = {}) {
    super({
      name: config.name || 'FileWatcherSource',
      ...config
    });

    this.filePath = config.filePath;
    this.watchInterval = config.watchInterval || 1000; // 1 second
    this.position = 0; // Current read position
    this.watcher = null;
    this.intervalId = null;
    this.fileStats = null;
  }

  async initialize() {
    if (!this.filePath) {
      throw new Error('FileWatcherSource requires filePath configuration');
    }

    // Ensure file exists
    try {
      this.fileStats = await fs.stat(this.filePath);
      this.position = this.fileStats.size; // Start from end (tail behavior)
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, will watch for it
        this.position = 0;
      } else {
        throw error;
      }
    }

    return true;
  }

  async start() {
    if (this.intervalId) {
      return; // Already started
    }

    // Poll file for changes
    this.intervalId = setInterval(async () => {
      await this.checkForNewEvents();
    }, this.watchInterval);

    this.emit('started', { filePath: this.filePath });
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.emit('stopped', { filePath: this.filePath });
  }

  async checkForNewEvents() {
    try {
      const stats = await fs.stat(this.filePath);

      // Check if file has grown
      if (stats.size > this.position) {
        await this.readNewLines(stats.size);
      } else if (stats.size < this.position) {
        // File was truncated or rotated
        this.position = 0;
        await this.readNewLines(stats.size);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.emit('error', { source: this.name, error });
      }
    }
  }

  async readNewLines(endPosition) {
    try {
      const fileHandle = await fs.open(this.filePath, 'r');
      const buffer = Buffer.alloc(endPosition - this.position);

      await fileHandle.read(buffer, 0, buffer.length, this.position);
      await fileHandle.close();

      const content = buffer.toString('utf8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          this.emitEvent(event);
        } catch (parseError) {
          this.emit('parse_error', { line, error: parseError });
        }
      }

      this.position = endPosition;
    } catch (error) {
      this.emit('error', { source: this.name, error });
    }
  }

  async shutdown() {
    await this.stop();
    await super.shutdown();
  }

  getHealth() {
    return {
      ...super.getHealth(),
      filePath: this.filePath,
      position: this.position,
      watching: !!this.intervalId
    };
  }
}

module.exports = FileWatcherSource;
