#!/usr/bin/env node

/**
 * Access Control System
 * Restricts worker operations to whitelisted resources and actions
 * Prevents unauthorized file access, external network requests, and dangerous operations
 */

const path = require('path');

class AccessControl {
  constructor(config = {}) {
    this.config = {
      // File access whitelist
      allowedReadPaths: config.allowedReadPaths || [
        'src/**',
        'lib/**',
        'coordination/**',
        'docs/**',
        'scripts/**',
        '*.md',
        '*.json',
        'package.json',
        'package-lock.json'
      ],
      allowedWritePaths: config.allowedWritePaths || [
        'src/**',
        'lib/**',
        'docs/**',
        'coordination/tasks/**',
        'coordination/events/**',
        'coordination/metrics/**'
      ],
      // Blocked file patterns (never allow)
      blockedPatterns: config.blockedPatterns || [
        '.env',
        '.env.*',
        'credentials*',
        '*secret*',
        '*password*',
        '*.key',
        '*.pem',
        'node_modules/**',
        '.git/config'
      ],
      // Allowed git remotes
      allowedGitRemotes: config.allowedGitRemotes || [
        'github.com/ry-ops/*'
      ],
      // Allowed network hosts
      allowedNetworkHosts: config.allowedNetworkHosts || [
        'localhost',
        '127.0.0.1',
        'github.com',
        'api.github.com'
      ],
      // Dangerous commands
      blockedCommands: config.blockedCommands || [
        'rm -rf',
        'dd if=',
        'mkfs',
        '> /dev/sda',
        'curl | sh',
        'wget | sh',
        ':(){:|:&};:',  // Fork bomb
        'chmod 777',
        'chown root'
      ]
    };
  }

  /**
   * Check if file read operation is allowed
   */
  canReadFile(filepath) {
    // Check against blocked patterns first
    if (this.isBlockedPath(filepath)) {
      return {
        allowed: false,
        reason: 'File matches blocked pattern',
        filepath
      };
    }

    // Check against allowed read paths
    if (!this.matchesPattern(filepath, this.config.allowedReadPaths)) {
      return {
        allowed: false,
        reason: 'File not in allowed read paths',
        filepath
      };
    }

    return { allowed: true };
  }

  /**
   * Check if file write operation is allowed
   */
  canWriteFile(filepath) {
    // Check against blocked patterns
    if (this.isBlockedPath(filepath)) {
      return {
        allowed: false,
        reason: 'File matches blocked pattern',
        filepath
      };
    }

    // Check against allowed write paths (more restrictive)
    if (!this.matchesPattern(filepath, this.config.allowedWritePaths)) {
      return {
        allowed: false,
        reason: 'File not in allowed write paths',
        filepath
      };
    }

    return { allowed: true };
  }

  /**
   * Check if git remote operation is allowed
   */
  canAccessGitRemote(remoteUrl) {
    const allowed = this.config.allowedGitRemotes.some(pattern => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(remoteUrl);
    });

    if (!allowed) {
      return {
        allowed: false,
        reason: 'Git remote not in allowed list',
        remoteUrl
      };
    }

    return { allowed: true };
  }

  /**
   * Check if network request is allowed
   */
  canAccessNetwork(hostname) {
    const allowed = this.config.allowedNetworkHosts.some(host => {
      return hostname === host || hostname.endsWith(`.${host}`);
    });

    if (!allowed) {
      return {
        allowed: false,
        reason: 'Network host not in allowed list',
        hostname
      };
    }

    return { allowed: true };
  }

  /**
   * Check if command execution is allowed
   */
  canExecuteCommand(command) {
    // Check for dangerous command patterns
    for (const blocked of this.config.blockedCommands) {
      if (command.includes(blocked)) {
        return {
          allowed: false,
          reason: 'Command contains blocked pattern',
          command,
          blockedPattern: blocked
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if path matches blocked patterns
   */
  isBlockedPath(filepath) {
    return this.config.blockedPatterns.some(pattern => {
      const regex = this.globToRegex(pattern);
      return regex.test(filepath);
    });
  }

  /**
   * Check if path matches any allowed pattern
   */
  matchesPattern(filepath, patterns) {
    return patterns.some(pattern => {
      const regex = this.globToRegex(pattern);
      return regex.test(filepath);
    });
  }

  /**
   * Convert glob pattern to regex
   */
  globToRegex(glob) {
    const regexStr = glob
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regexStr}$`);
  }

  /**
   * Comprehensive operation validation
   */
  validateOperation(operation) {
    const { type, target } = operation;

    switch (type) {
      case 'file_read':
        return this.canReadFile(target);

      case 'file_write':
        return this.canWriteFile(target);

      case 'git_remote':
        return this.canAccessGitRemote(target);

      case 'network_request':
        return this.canAccessNetwork(target);

      case 'command_execution':
        return this.canExecuteCommand(target);

      default:
        return {
          allowed: false,
          reason: `Unknown operation type: ${type}`
        };
    }
  }

  /**
   * Get audit log entry for operation
   */
  createAuditEntry(operation, result, context = {}) {
    return {
      timestamp: new Date().toISOString(),
      operation: operation.type,
      target: operation.target,
      allowed: result.allowed,
      reason: result.reason || 'Operation allowed',
      worker_id: context.workerId,
      task_id: context.taskId,
      master: context.master
    };
  }
}

module.exports = { AccessControl };
