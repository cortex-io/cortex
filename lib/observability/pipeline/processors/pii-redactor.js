// lib/observability/pipeline/processors/pii-redactor.js
// PII Redactor Processor - redacts sensitive data from events
// Weeks 3-4 Implementation
//
// Functionality:
// - Detect and redact email addresses, phone numbers
// - Detect and redact API keys, tokens, passwords
// - Detect and redact SSN, credit cards
// - Configurable redaction patterns
// - Multiple redaction modes (mask, hash, remove)

const { Processor } = require('../base');
const crypto = require('crypto');

class PIIRedactorProcessor extends Processor {
  constructor(config = {}) {
    super({
      name: config.name || 'PIIRedactorProcessor',
      ...config
    });

    // Redaction mode: 'mask', 'hash', 'remove'
    this.redactionMode = config.redactionMode || 'mask';

    // Custom patterns to detect (regex)
    this.customPatterns = config.patterns || [];

    // Enable/disable specific PII types
    this.detectEmail = config.detectEmail !== false;
    this.detectPhone = config.detectPhone !== false;
    this.detectSSN = config.detectSSN !== false;
    this.detectCreditCard = config.detectCreditCard !== false;
    this.detectAPIKey = config.detectAPIKey !== false;
    this.detectPassword = config.detectPassword !== false;
    this.detectIPAddress = config.detectIPAddress !== false;

    // Fields to scan (default: scan everything)
    this.fieldsToScan = config.fieldsToScan || null; // null means all fields

    // Fields to skip
    this.fieldsToSkip = config.fieldsToSkip || ['_id', 'timestamp', 'type', '_source', '_destination', '_enrichment'];

    // Hash salt for hash mode
    this.hashSalt = config.hashSalt || 'cortex-pii-redactor';

    // Stats
    this.redactionStats = {
      total_events_scanned: 0,
      total_events_redacted: 0,
      total_fields_redacted: 0,
      by_type: {
        email: 0,
        phone: 0,
        ssn: 0,
        credit_card: 0,
        api_key: 0,
        password: 0,
        ip_address: 0,
        custom: 0
      }
    };

    // Compile patterns
    this.patterns = this.compilePatterns();
  }

  compilePatterns() {
    const patterns = {};

    // Email pattern
    if (this.detectEmail) {
      patterns.email = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    }

    // Phone patterns (US format with various delimiters)
    if (this.detectPhone) {
      patterns.phone = /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
    }

    // SSN pattern (XXX-XX-XXXX)
    if (this.detectSSN) {
      patterns.ssn = /\b\d{3}-\d{2}-\d{4}\b/g;
    }

    // Credit card patterns (various formats)
    if (this.detectCreditCard) {
      patterns.credit_card = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
    }

    // API key patterns (common formats)
    if (this.detectAPIKey) {
      patterns.api_key = /\b(sk-[a-zA-Z0-9]{32,}|[a-zA-Z0-9]{32,}[-_][a-zA-Z0-9]{16,})\b/g;
    }

    // Password patterns (in common formats)
    if (this.detectPassword) {
      patterns.password = /(?:password|passwd|pwd)[\s]*[=:]\s*['"']?([^\s'"]+)['"']?/gi;
    }

    // IP address pattern
    if (this.detectIPAddress) {
      patterns.ip_address = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    }

    // Add custom patterns
    for (const customPattern of this.customPatterns) {
      if (customPattern.name && customPattern.regex) {
        try {
          patterns[customPattern.name] = new RegExp(customPattern.regex, customPattern.flags || 'g');
        } catch (error) {
          console.warn(`Invalid custom pattern: ${customPattern.name}`, error);
        }
      }
    }

    return patterns;
  }

  async initialize() {
    // Validate redaction mode
    const validModes = ['mask', 'hash', 'remove'];
    if (!validModes.includes(this.redactionMode)) {
      throw new Error(`Invalid redactionMode: ${this.redactionMode}. Must be one of: ${validModes.join(', ')}`);
    }

    return true;
  }

  async process(event) {
    if (!event) return event;

    this.redactionStats.total_events_scanned++;

    // Create a deep copy to avoid mutating original
    const redactedEvent = JSON.parse(JSON.stringify(event));

    // Track if any redaction was done
    let redacted = false;
    const redactedFields = [];

    // Scan and redact all fields
    this.scanObject(redactedEvent, '', (path, value) => {
      if (this.shouldSkipField(path)) {
        return value;
      }

      const redactionResult = this.redactValue(value);

      if (redactionResult.redacted) {
        redacted = true;
        redactedFields.push({
          field: path,
          type: redactionResult.type,
          original_value_hint: this.getValueHint(value)
        });

        this.redactionStats.total_fields_redacted++;
        this.redactionStats.by_type[redactionResult.type]++;
      }

      return redactionResult.value;
    });

    if (redacted) {
      this.redactionStats.total_events_redacted++;

      // Add redaction metadata
      redactedEvent._redaction = {
        redacted: true,
        mode: this.redactionMode,
        fields: redactedFields,
        timestamp: new Date().toISOString()
      };
    }

    return redactedEvent;
  }

  scanObject(obj, path, callback) {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    for (const key in obj) {
      const currentPath = path ? `${path}.${key}` : key;
      const value = obj[key];

      if (typeof value === 'string') {
        // Redact string value
        obj[key] = callback(currentPath, value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively scan nested objects
        this.scanObject(value, currentPath, callback);
      }
    }
  }

  shouldSkipField(fieldPath) {
    // Check if field should be skipped
    if (this.fieldsToSkip.some(skip => fieldPath.includes(skip))) {
      return true;
    }

    // If specific fields to scan are defined, only scan those
    if (this.fieldsToScan && !this.fieldsToScan.some(scan => fieldPath.includes(scan))) {
      return true;
    }

    return false;
  }

  redactValue(value) {
    if (typeof value !== 'string') {
      return { value, redacted: false };
    }

    let redactedValue = value;
    let redacted = false;
    let redactionType = null;

    // Check each pattern
    for (const [type, pattern] of Object.entries(this.patterns)) {
      const matches = value.match(pattern);

      if (matches && matches.length > 0) {
        redacted = true;
        redactionType = type;

        // Apply redaction based on mode
        switch (this.redactionMode) {
          case 'mask':
            redactedValue = this.maskMatches(redactedValue, pattern, type);
            break;

          case 'hash':
            redactedValue = this.hashMatches(redactedValue, pattern);
            break;

          case 'remove':
            redactedValue = this.removeMatches(redactedValue, pattern);
            break;
        }
      }
    }

    return {
      value: redactedValue,
      redacted,
      type: redactionType
    };
  }

  maskMatches(value, pattern, type) {
    return value.replace(pattern, (match) => {
      // Different masking strategies for different types
      if (type === 'email') {
        const [local, domain] = match.split('@');
        const maskedLocal = local.charAt(0) + '***' + local.charAt(local.length - 1);
        return `${maskedLocal}@${domain}`;
      }

      if (type === 'phone') {
        return match.replace(/\d/g, (d, i) => i < 3 || i > match.length - 3 ? d : '*');
      }

      if (type === 'credit_card') {
        return match.replace(/\d(?=\d{4})/g, '*');
      }

      // Default: mask most characters
      const visibleChars = Math.min(4, Math.floor(match.length * 0.2));
      const prefix = match.substring(0, visibleChars);
      const masked = '*'.repeat(match.length - visibleChars);
      return prefix + masked;
    });
  }

  hashMatches(value, pattern) {
    return value.replace(pattern, (match) => {
      const hash = crypto.createHash('sha256')
        .update(match + this.hashSalt)
        .digest('hex')
        .substring(0, 16);

      return `[REDACTED:${hash}]`;
    });
  }

  removeMatches(value, pattern) {
    return value.replace(pattern, '[REDACTED]');
  }

  getValueHint(value) {
    // Provide a hint about the original value without exposing it
    if (typeof value !== 'string') {
      return `${typeof value}`;
    }

    return `string(length=${value.length})`;
  }

  getHealth() {
    const total = this.redactionStats.total_events_scanned;

    return {
      ...super.getHealth(),
      type: 'pii-redactor',
      redactionMode: this.redactionMode,
      patterns: Object.keys(this.patterns),
      stats: {
        ...this.redactionStats,
        redaction_rate: total > 0 ? (this.redactionStats.total_events_redacted / total) : 0
      }
    };
  }

  getRedactionStats() {
    const total = this.redactionStats.total_events_scanned;

    return {
      ...this.redactionStats,
      redaction_rate: total > 0 ? (this.redactionStats.total_events_redacted / total) : 0,
      patterns_active: Object.keys(this.patterns).length
    };
  }

  resetStats() {
    this.redactionStats = {
      total_events_scanned: 0,
      total_events_redacted: 0,
      total_fields_redacted: 0,
      by_type: {
        email: 0,
        phone: 0,
        ssn: 0,
        credit_card: 0,
        api_key: 0,
        password: 0,
        ip_address: 0,
        custom: 0
      }
    };
  }
}

module.exports = PIIRedactorProcessor;
