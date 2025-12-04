// lib/observability/pipeline/processors/passthrough.js
// Passthrough Processor - passes all events through unchanged
// Useful for testing and as a base example

const { Processor } = require('../base');

class PassthroughProcessor extends Processor {
  constructor(config = {}) {
    super({
      name: config.name || 'PassthroughProcessor',
      ...config
    });
  }

  async initialize() {
    return true;
  }

  async process(event) {
    // Simply return the event unchanged
    return event;
  }

  getHealth() {
    return {
      ...super.getHealth(),
      type: 'passthrough'
    };
  }
}

module.exports = PassthroughProcessor;
