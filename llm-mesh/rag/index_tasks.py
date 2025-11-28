#!/usr/bin/env python3
"""
Script to index tasks from coordination directory.
Handles various task file formats.
"""

import json
import logging
from pathlib import Path
from indexer import RAGIndexer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def extract_task_info(task_data, task_file_path):
    """Extract task information from various formats."""
    task_id = task_data.get('task_id') or task_data.get('id') or Path(task_file_path).stem

    # Description
    description = (
        task_data.get('description') or
        task_data.get('task') or
        task_data.get('title') or
        ''
    )

    # Outcome
    outcome = task_data.get('outcome', '')
    if not outcome:
        # Try to build outcome from results
        results = task_data.get('results', {})
        if results:
            outcome_parts = []
            if 'status' in results:
                outcome_parts.append(f"Status: {results['status']}")
            if 'findings_summary' in results:
                outcome_parts.append("Findings: " + "; ".join(results['findings_summary']))
            if 'recommendations' in results:
                outcome_parts.append("Recommendations: " + "; ".join(results['recommendations']))
            outcome = " | ".join(outcome_parts)

    # Metadata
    master = task_data.get('master') or task_data.get('assigned_to') or task_data.get('type') or ''
    category = task_data.get('category') or task_data.get('type') or ''

    status = task_data.get('status', '')
    success = (
        status == 'completed' or
        status == 'success' or
        task_data.get('results', {}).get('status') == 'success'
    )

    duration = task_data.get('duration') or task_data.get('duration_seconds', 0)

    metadata = {
        'master': master,
        'category': category,
        'success': success,
        'duration': duration,
        'priority': task_data.get('priority', ''),
        'created_by': task_data.get('created_by', '')
    }

    return task_id, description, outcome, metadata


def index_from_coordination(coordination_path='/Users/ryandahlberg/Projects/cortex/coordination'):
    """Index tasks from coordination directory."""
    coord_path = Path(coordination_path)
    indexer = RAGIndexer()

    # Find all task files
    task_files = []

    # Check completed tasks
    completed_dir = coord_path / 'tasks' / 'completed'
    if completed_dir.exists():
        task_files.extend(completed_dir.glob('*.json'))

    # Check tasks directory
    tasks_dir = coord_path / 'tasks'
    if tasks_dir.exists():
        task_files.extend([f for f in tasks_dir.glob('*.json') if f.is_file()])

    logger.info(f"Found {len(task_files)} task files")

    # Prepare tasks for batch indexing
    tasks_to_index = []

    for task_file in task_files:
        try:
            with open(task_file, 'r') as f:
                task_data = json.load(f)

            task_id, description, outcome, metadata = extract_task_info(task_data, task_file)

            # Only index if we have meaningful content
            if description and (outcome or task_data.get('status') == 'completed'):
                tasks_to_index.append({
                    'task_id': task_id,
                    'description': description,
                    'outcome': outcome or 'Task completed',
                    'metadata': metadata
                })
                logger.info(f"Prepared task: {task_id}")
            else:
                logger.debug(f"Skipped task {task_id}: insufficient data")

        except Exception as e:
            logger.warning(f"Error reading {task_file}: {e}")

    # Batch index
    logger.info(f"Indexing {len(tasks_to_index)} tasks...")
    if tasks_to_index:
        indexer.index_batch_tasks(tasks_to_index)
        indexer.save()

    logger.info(f"Indexing complete!")

    # Print stats
    stats = indexer.get_stats()
    logger.info(f"Stats: {json.dumps(stats, indent=2)}")

    return stats


def add_sample_patterns():
    """Add some sample code patterns."""
    indexer = RAGIndexer()

    patterns = [
        {
            'pattern_type': 'authentication',
            'code': '''const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

module.exports = authenticateToken;''',
            'description': 'JWT authentication middleware for Express.js with bearer token extraction',
            'metadata': {
                'language': 'javascript',
                'framework': 'express',
                'success_rate': 0.95
            }
        },
        {
            'pattern_type': 'database_connection',
            'code': '''const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;''',
            'description': 'PostgreSQL connection pool with environment configuration and error handling',
            'metadata': {
                'language': 'javascript',
                'framework': 'node.js',
                'database': 'postgresql',
                'success_rate': 0.98
            }
        },
        {
            'pattern_type': 'error_handling',
            'code': '''class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  } else {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  }
};

module.exports = { AppError, errorHandler };''',
            'description': 'Custom error class and Express error handling middleware with environment-specific responses',
            'metadata': {
                'language': 'javascript',
                'framework': 'express',
                'success_rate': 0.92
            }
        },
        {
            'pattern_type': 'bash_error_handling',
            'code': '''#!/bin/bash
set -euo pipefail

# Error handler
error_exit() {
    local line=$1
    local msg="${2:-Unknown error}"
    echo "Error at line $line: $msg" >&2
    cleanup
    exit 1
}

trap 'error_exit ${LINENO}' ERR

# Cleanup function
cleanup() {
    echo "Cleaning up..."
    # Cleanup code here
}

# Register cleanup on exit
trap cleanup EXIT

# Main script logic
main() {
    echo "Starting process..."
    # Your code here
}

main "$@"''',
            'description': 'Bash script template with error handling, cleanup traps, and safe defaults',
            'metadata': {
                'language': 'bash',
                'success_rate': 0.90
            }
        },
        {
            'pattern_type': 'async_retry',
            'code': '''async function retryOperation(operation, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      if (attempt === maxRetries) {
        throw new Error(`Operation failed after ${maxRetries} attempts: ${error.message}`);
      }
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
}

// Usage:
// const result = await retryOperation(() => fetchData(url));''',
            'description': 'Async retry pattern with exponential backoff for Node.js operations',
            'metadata': {
                'language': 'javascript',
                'framework': 'node.js',
                'success_rate': 0.94
            }
        }
    ]

    logger.info(f"Adding {len(patterns)} sample code patterns...")
    indexer.index_batch_patterns(patterns)
    indexer.save()
    logger.info("Sample patterns added!")


if __name__ == '__main__':
    import sys

    # Index tasks
    stats = index_from_coordination()

    # Add sample patterns
    add_sample_patterns()

    print("\n" + "="*60)
    print("RAG INDEXING COMPLETE")
    print("="*60)
    print(f"Tasks indexed: {stats['task_index_size']}")
    print(f"Patterns indexed: 5")
    print("="*60)
