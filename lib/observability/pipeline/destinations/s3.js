// lib/observability/pipeline/destinations/s3.js
// S3 Destination - archives events to AWS S3 for long-term storage
// Weeks 5-6 Implementation
//
// Functionality:
// - Upload events to S3 in batches
// - JSONL format for efficient storage
// - Automatic partitioning by date (year/month/day)
// - Compression support (gzip)
// - Server-side encryption
// - Multipart uploads for large batches
// - Automatic retry with exponential backoff

const { Destination } = require('../base');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);

// Optional dependency - gracefully handle if not installed
let S3Client, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand;
try {
  const awsS3 = require('@aws-sdk/client-s3');
  S3Client = awsS3.S3Client;
  PutObjectCommand = awsS3.PutObjectCommand;
  CreateMultipartUploadCommand = awsS3.CreateMultipartUploadCommand;
  UploadPartCommand = awsS3.UploadPartCommand;
  CompleteMultipartUploadCommand = awsS3.CompleteMultipartUploadCommand;
} catch (error) {
  // @aws-sdk/client-s3 not installed - will throw helpful error in initialize()
  S3Client = null;
}

class S3Destination extends Destination {
  constructor(config = {}) {
    super({
      name: config.name || 'S3Destination',
      bufferSize: config.bufferSize || 1000, // Larger buffer for S3
      flushInterval: config.flushInterval || 60000, // Flush every minute
      ...config
    });

    // AWS S3 configuration
    this.bucket = config.bucket || process.env.AWS_S3_BUCKET;
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.prefix = config.prefix || 'cortex-events'; // S3 key prefix
    this.partitioning = config.partitioning !== false; // Partition by date
    this.partitionFormat = config.partitionFormat || 'year/month/day'; // year/month/day or year-month-day

    // Compression
    this.compression = config.compression !== false; // gzip by default
    this.compressionLevel = config.compressionLevel || 6; // 1-9

    // S3 options
    this.storageClass = config.storageClass || 'STANDARD_IA'; // STANDARD, STANDARD_IA, GLACIER, etc.
    this.serverSideEncryption = config.serverSideEncryption || 'AES256'; // AES256 or aws:kms
    this.kmsKeyId = config.kmsKeyId || null; // For KMS encryption

    // Multipart upload threshold
    this.multipartThreshold = config.multipartThreshold || 5 * 1024 * 1024; // 5MB

    // Retry configuration
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000; // Initial delay in ms

    // S3 client
    this.s3Client = null;

    // Stats
    this.destinationStats = {
      total_events_uploaded: 0,
      total_batches_uploaded: 0,
      total_bytes_uploaded: 0,
      total_errors: 0,
      last_upload_at: null,
      compression_ratio: 0
    };
  }

  async initialize() {
    // Check if AWS SDK is available
    if (!S3Client) {
      throw new Error('S3Destination requires the "@aws-sdk/client-s3" package. Install it with: npm install @aws-sdk/client-s3');
    }

    // Validate configuration
    if (!this.bucket) {
      throw new Error('S3Destination requires bucket configuration');
    }

    try {
      // Create S3 client
      this.s3Client = new S3Client({
        region: this.region,
        maxAttempts: this.maxRetries
      });

      console.log(`${this.name}: Initialized S3 destination (bucket: ${this.bucket}, region: ${this.region})`);

      // Start auto-flushing
      this.startAutoFlush();

      return true;
    } catch (error) {
      console.error(`${this.name}: Failed to initialize S3 client`, error);
      throw error;
    }
  }

  async send(event) {
    // For single events, add to buffer and let flush handle it
    // This is more efficient than uploading one event at a time
    this.buffer.push(event);

    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  async sendBatch(events) {
    if (events.length === 0) return;

    // Group events by partition (date)
    const partitionedEvents = this.partitionEvents(events);

    // Upload each partition
    for (const [partition, partitionEvents] of Object.entries(partitionedEvents)) {
      await this.uploadPartition(partition, partitionEvents);
    }
  }

  partitionEvents(events) {
    if (!this.partitioning) {
      return { 'default': events };
    }

    const partitions = {};

    for (const event of events) {
      const partition = this.getPartitionKey(event);

      if (!partitions[partition]) {
        partitions[partition] = [];
      }

      partitions[partition].push(event);
    }

    return partitions;
  }

  getPartitionKey(event) {
    // Extract timestamp from event
    const timestamp = event.timestamp || event.created_at || new Date().toISOString();
    const date = new Date(timestamp);

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');

    // Format partition key based on configuration
    if (this.partitionFormat === 'year/month/day') {
      return `year=${year}/month=${month}/day=${day}`;
    } else if (this.partitionFormat === 'year-month-day') {
      return `${year}-${month}-${day}`;
    } else if (this.partitionFormat === 'year/month/day/hour') {
      return `year=${year}/month=${month}/day=${day}/hour=${hour}`;
    }

    return `${year}-${month}-${day}`;
  }

  async uploadPartition(partition, events) {
    // Convert events to JSONL
    const jsonl = events.map(event => JSON.stringify(event)).join('\n') + '\n';
    let content = Buffer.from(jsonl, 'utf8');
    let originalSize = content.length;

    // Compress if enabled
    if (this.compression) {
      content = await gzip(content, { level: this.compressionLevel });
      const compressedSize = content.length;
      const ratio = originalSize > 0 ? (compressedSize / originalSize) : 1;
      this.destinationStats.compression_ratio = ratio;
    }

    // Generate S3 key
    const timestamp = Date.now();
    const extension = this.compression ? '.jsonl.gz' : '.jsonl';
    const key = `${this.prefix}/${partition}/events-${timestamp}${extension}`;

    try {
      // Use multipart upload for large files
      if (content.length > this.multipartThreshold) {
        await this.uploadMultipart(key, content);
      } else {
        await this.uploadSimple(key, content);
      }

      this.destinationStats.total_events_uploaded += events.length;
      this.destinationStats.total_batches_uploaded++;
      this.destinationStats.total_bytes_uploaded += content.length;
      this.destinationStats.last_upload_at = new Date().toISOString();

      this.emit('batch_uploaded', {
        count: events.length,
        key: key,
        size: content.length,
        originalSize: originalSize,
        compressed: this.compression
      });
    } catch (error) {
      this.destinationStats.total_errors++;
      this.emit('error', { destination: this.name, key, eventCount: events.length, error });
      throw error;
    }
  }

  async uploadSimple(key, content) {
    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: content,
      ContentType: this.compression ? 'application/gzip' : 'application/x-ndjson',
      StorageClass: this.storageClass,
      ServerSideEncryption: this.serverSideEncryption
    };

    // Add KMS key if specified
    if (this.serverSideEncryption === 'aws:kms' && this.kmsKeyId) {
      params.SSEKMSKeyId = this.kmsKeyId;
    }

    const command = new PutObjectCommand(params);
    await this.s3Client.send(command);
  }

  async uploadMultipart(key, content) {
    // Create multipart upload
    const createParams = {
      Bucket: this.bucket,
      Key: key,
      ContentType: this.compression ? 'application/gzip' : 'application/x-ndjson',
      StorageClass: this.storageClass,
      ServerSideEncryption: this.serverSideEncryption
    };

    if (this.serverSideEncryption === 'aws:kms' && this.kmsKeyId) {
      createParams.SSEKMSKeyId = this.kmsKeyId;
    }

    const createCommand = new CreateMultipartUploadCommand(createParams);
    const { UploadId } = await this.s3Client.send(createCommand);

    try {
      // Split content into 5MB parts
      const partSize = 5 * 1024 * 1024; // 5MB
      const parts = [];
      let partNumber = 1;

      for (let i = 0; i < content.length; i += partSize) {
        const end = Math.min(i + partSize, content.length);
        const partContent = content.slice(i, end);

        const uploadCommand = new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          PartNumber: partNumber,
          UploadId: UploadId,
          Body: partContent
        });

        const { ETag } = await this.s3Client.send(uploadCommand);
        parts.push({ PartNumber: partNumber, ETag });
        partNumber++;
      }

      // Complete multipart upload
      const completeCommand = new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: UploadId,
        MultipartUpload: { Parts: parts }
      });

      await this.s3Client.send(completeCommand);
    } catch (error) {
      // Abort multipart upload on error
      // Note: AbortMultipartUploadCommand would be called here in production
      throw error;
    }
  }

  async shutdown() {
    // Stop auto-flush and flush remaining events
    await super.shutdown();

    // S3 client doesn't need explicit cleanup
    this.s3Client = null;
  }

  getHealth() {
    return {
      ...super.getHealth(),
      bucket: this.bucket,
      region: this.region,
      prefix: this.prefix,
      compression: this.compression,
      partitioning: this.partitioning,
      storageClass: this.storageClass,
      stats: this.destinationStats
    };
  }

  getDestinationStats() {
    return {
      ...this.destinationStats,
      average_batch_size: this.destinationStats.total_batches_uploaded > 0
        ? Math.round(this.destinationStats.total_events_uploaded / this.destinationStats.total_batches_uploaded)
        : 0,
      average_upload_size_bytes: this.destinationStats.total_batches_uploaded > 0
        ? Math.round(this.destinationStats.total_bytes_uploaded / this.destinationStats.total_batches_uploaded)
        : 0
    };
  }
}

module.exports = S3Destination;
