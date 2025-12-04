// lib/observability/pipeline/destinations/jsonl.js
// JSONL Destination - writes events to JSONL files
// Maintains backward compatibility with existing Cortex logging

const { Destination } = require('../base');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class JSONLDestination extends Destination {
  constructor(config = {}) {
    super({
      name: config.name || 'JSONLDestination',
      bufferSize: config.bufferSize || 100,
      flushInterval: config.flushInterval || 5000,
      ...config
    });

    this.outputPath = config.outputPath;
    this.rotateDaily = config.rotateDaily !== false; // Default: true
    this.compression = config.compression || false; // Future: gzip support
    this.currentFile = null;
    this.currentDate = null;
  }

  async initialize() {
    if (!this.outputPath) {
      throw new Error('JSONLDestination requires outputPath configuration');
    }

    // Ensure output directory exists
    const dir = path.dirname(this.outputPath);
    await fs.mkdir(dir, { recursive: true });

    // Start auto-flushing
    this.startAutoFlush();

    return true;
  }

  async send(event) {
    const filePath = this.getCurrentFilePath();
    const line = JSON.stringify(event) + '\n';

    try {
      await fs.appendFile(filePath, line, 'utf8');
    } catch (error) {
      this.emit('error', { destination: this.name, filePath, error });
      throw error;
    }
  }

  async sendBatch(events) {
    const filePath = this.getCurrentFilePath();
    const lines = events.map(event => JSON.stringify(event)).join('\n') + '\n';

    try {
      await fs.appendFile(filePath, lines, 'utf8');
      this.emit('batch_written', { count: events.length, filePath });
    } catch (error) {
      this.emit('error', { destination: this.name, filePath, error, eventCount: events.length });
      throw error;
    }
  }

  getCurrentFilePath() {
    if (!this.rotateDaily) {
      return this.outputPath;
    }

    // Daily rotation: append date to filename
    const today = new Date().toISOString().split('T')[0];

    if (today !== this.currentDate) {
      this.currentDate = today;

      const ext = path.extname(this.outputPath);
      const basename = path.basename(this.outputPath, ext);
      const dir = path.dirname(this.outputPath);

      this.currentFile = path.join(dir, `${basename}-${today}${ext}`);
    }

    return this.currentFile;
  }

  async getFileSize() {
    try {
      const filePath = this.getCurrentFilePath();
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  async getLineCount() {
    try {
      const filePath = this.getCurrentFilePath();
      const content = await fs.readFile(filePath, 'utf8');
      return content.split('\n').filter(line => line.trim()).length;
    } catch (error) {
      return 0;
    }
  }

  getHealth() {
    return {
      ...super.getHealth(),
      outputPath: this.outputPath,
      currentFile: this.currentFile,
      rotateDaily: this.rotateDaily,
      bufferSize: this.buffer.length
    };
  }
}

module.exports = JSONLDestination;
