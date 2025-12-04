// lib/observability/pipeline/destinations/console.js
// Console Destination - outputs events to console (for debugging)

const { Destination } = require('../base');

class ConsoleDestination extends Destination {
  constructor(config = {}) {
    super({
      name: config.name || 'ConsoleDestination',
      bufferSize: 1, // Immediate output
      ...config
    });

    this.pretty = config.pretty !== false; // Pretty print by default
    this.colors = config.colors !== false; // Colorize output
  }

  async initialize() {
    return true;
  }

  async send(event) {
    if (this.pretty) {
      console.log(JSON.stringify(event, null, 2));
    } else {
      console.log(JSON.stringify(event));
    }
  }

  async sendBatch(events) {
    for (const event of events) {
      await this.send(event);
    }
  }

  getHealth() {
    return {
      ...super.getHealth(),
      pretty: this.pretty,
      colors: this.colors
    };
  }
}

module.exports = ConsoleDestination;
