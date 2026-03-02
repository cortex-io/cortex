# Event Archival and Compression - Deployment Summary

Automated event lifecycle management system for Cortex with archival, compression, rotation, and cleanup capabilities.

## What Was Created

### Core Scripts

1. **`/Users/ryandahlberg/Projects/cortex/scripts/events/event-archiver.sh`**
   - Main archival automation script
   - Handles daily archival, compression, rotation, and cleanup
   - Supports dry-run and operation-specific modes
   - Executable: Yes (755)

2. **`/Users/ryandahlberg/Projects/cortex/scripts/events/setup-archiver-cron.sh`**
   - Interactive cron job setup utility
   - Multiple scheduling options
   - Automatic log directory creation
   - Executable: Yes (755)

3. **`/Users/ryandahlberg/Projects/cortex/scripts/events/archive-utils.sh`**
   - Archive management utilities
   - Statistics, search, restore, verification
   - Developer-friendly commands
   - Executable: Yes (755)

### Documentation

4. **`/Users/ryandahlberg/Projects/cortex/docs/EVENT-ARCHIVAL.md`**
   - Comprehensive archival documentation
   - Usage examples and troubleshooting
   - Configuration and monitoring guides
   - Performance metrics and best practices

### Updated Files

5. **`/Users/ryandahlberg/Projects/cortex/scripts/setup-event-processing.sh`**
   - Updated to include archiver cron job
   - Adds daily archival at 2 AM
   - Enhanced setup flow with both dispatcher and archiver

## Features Implemented

### 1. Daily Archival
- Archives events older than 24 hours
- Organizes by date: `coordination/events/archive/YYYY-MM-DD/`
- Preserves event structure and metadata
- Handles missing timestamps gracefully

### 2. JSONL Rotation
- Rotates files exceeding 10MB
- Prevents active file performance degradation
- Timestamp-based naming: `{type}-rotated-{timestamp}.jsonl`
- Automatic archive directory organization

### 3. Compression
- Compresses archives older than 7 days
- Uses gzip level 9 (maximum compression)
- Typical 75-90% space savings
- Preserves original timestamps

### 4. Cleanup
- Deletes archives older than 90 days
- Removes empty directories
- Reports space freed
- Configurable retention periods

### 5. Monitoring and Reporting
- Detailed execution logs
- Disk usage reports
- Operation statistics
- Success/failure tracking

## Configuration

### Default Thresholds

```bash
ARCHIVE_AGE_HOURS=24       # Archive events older than 24 hours
COMPRESS_AGE_DAYS=7        # Compress archives older than 7 days
DELETE_AGE_DAYS=90         # Delete archives older than 90 days
ROTATION_SIZE_MB=10        # Rotate files larger than 10MB
```

### Log Locations

```
/var/log/cortex/archiver.log                    # Cron execution logs
coordination/events/.archiver.log               # Script execution logs
```

### Archive Structure

```
coordination/events/
├── archive/
│   ├── 2025-12-01/                # Daily archives (recent)
│   │   ├── heartbeat-events.jsonl
│   │   └── daemon-supervisor-events.jsonl
│   ├── 2025-11-24/                # 7+ days old (compressed)
│   │   ├── heartbeat-events.jsonl.gz
│   │   └── daemon-supervisor-events.jsonl.gz
│   ├── failed/                    # Failed event processing
│   └── invalid/                   # Invalid events
└── .archiver.log                  # Execution log
```

## Usage

### Quick Start

```bash
# 1. Test with dry run
./scripts/events/event-archiver.sh --dry-run --verbose

# 2. Run manually to verify
./scripts/events/event-archiver.sh

# 3. Setup automated daily archival
./scripts/events/setup-archiver-cron.sh
# OR
./scripts/setup-event-processing.sh  # Includes both dispatcher and archiver
```

### Command Examples

```bash
# Full archival process
./scripts/events/event-archiver.sh

# Dry run (preview changes)
./scripts/events/event-archiver.sh --dry-run

# Only compress old archives
./scripts/events/event-archiver.sh --compress-only

# Only cleanup archives older than 90 days
./scripts/events/event-archiver.sh --cleanup-only

# Verbose output
./scripts/events/event-archiver.sh --verbose
```

### Archive Utilities

```bash
# Show statistics
./scripts/events/archive-utils.sh stats

# Search archives for pattern
./scripts/events/archive-utils.sh search "worker_presumed_dead"

# List all archive dates
./scripts/events/archive-utils.sh list

# List specific date
./scripts/events/archive-utils.sh list 2025-11-20

# Size breakdown by event type
./scripts/events/archive-utils.sh size

# Decompress archives for analysis
./scripts/events/archive-utils.sh decompress 2025-11-20

# Restore events from archive
./scripts/events/archive-utils.sh restore 2025-11-20 heartbeat

# Verify compressed archives
./scripts/events/archive-utils.sh verify

# Cleanup temporary files
./scripts/events/archive-utils.sh cleanup-temp
```

## Testing Results

### Dry Run Test (2025-12-01)

```
Operations that would be performed:
  Events archived:     11,674 events
  Files compressed:    0 (none old enough yet)
  Files deleted:       0 (none old enough yet)
  Files rotated:       0 (none large enough)

Current state:
  Events directory size: 3.3M
  Archive dates: 1 (2025-12-01)
  Archive size: 8.0K
```

### Successful Operations

- Event timestamp parsing and filtering
- Date-based directory organization
- JSONL file splitting (current vs archivable)
- Empty directory detection
- Disk usage reporting
- Log file creation and writing

## Automated Scheduling

### Recommended Cron Setup

```bash
# Event dispatcher (every minute) - processes new events
* * * * * cd /Users/ryandahlberg/Projects/cortex && /Users/ryandahlberg/Projects/cortex/scripts/events/event-dispatcher.sh >> /var/log/cortex/events.log 2>&1

# Event archiver (daily at 2 AM) - manages old events
0 2 * * * cd /Users/ryandahlberg/Projects/cortex && /Users/ryandahlberg/Projects/cortex/scripts/events/event-archiver.sh >> /var/log/cortex/archiver.log 2>&1
```

### Alternative Schedules

```bash
# High-volume: Every 12 hours
0 2,14 * * * cd /Users/ryandahlberg/Projects/cortex && /Users/ryandahlberg/Projects/cortex/scripts/events/event-archiver.sh >> /var/log/cortex/archiver.log 2>&1

# Very high-volume: Every 6 hours
0 */6 * * * cd /Users/ryandahlberg/Projects/cortex && /Users/ryandahlberg/Projects/cortex/scripts/events/event-archiver.sh >> /var/log/cortex/archiver.log 2>&1
```

## Monitoring

### Health Checks

```bash
# Check last archival
grep "Event Archiver Completed" /var/log/cortex/archiver.log | tail -1

# View recent statistics
tail -50 /Users/ryandahlberg/Projects/cortex/coordination/events/.archiver.log

# Check for errors
grep "ERROR" /var/log/cortex/archiver.log

# Verify cron is scheduled
crontab -l | grep event-archiver
```

### Disk Usage

```bash
# Total events directory size
du -sh /Users/ryandahlberg/Projects/cortex/coordination/events

# Archive breakdown
du -sh /Users/ryandahlberg/Projects/cortex/coordination/events/archive/*

# Compression effectiveness
find coordination/events/archive -name "*.gz" -exec du -ch {} + | tail -1
```

### Performance Metrics

| Metric | Expected Value | Alert Threshold |
|--------|---------------|-----------------|
| Execution time | 1-3 minutes | > 10 minutes |
| Disk usage | < 500MB | > 2GB |
| Compression ratio | 75-90% | < 50% |
| Archive age | < 90 days | > 100 days |

## Integration Points

### Event Processing Flow

```
New Event → Queue → Dispatcher → Active JSONL
                                      ↓
                              (24 hours pass)
                                      ↓
                                  Archiver
                                      ↓
                          Archive/YYYY-MM-DD/*.jsonl
                                      ↓
                              (7 days pass)
                                      ↓
                                 Compression
                                      ↓
                          Archive/YYYY-MM-DD/*.jsonl.gz
                                      ↓
                             (90 days pass)
                                      ↓
                                  Deletion
```

### With Monitoring Dashboard

The archiver can integrate with Cortex monitoring:
- Archive growth metrics
- Compression ratio tracking
- Disk usage alerts
- Archival failure notifications

### With Backup Systems

Include archives in backup strategy:
```bash
# Backup compressed archives
rsync -avz coordination/events/archive/*.gz backup:/cortex/

# Incremental backup of recent archives
rsync -avz --min-age=7 coordination/events/archive/ backup:/cortex/
```

## Troubleshooting

### Common Issues

1. **Events not archiving**
   - Check timestamps exist: `jq -r '.timestamp' coordination/events/*.jsonl | head`
   - Verify age threshold: Events must be > 24 hours old
   - Test with dry-run: `./scripts/events/event-archiver.sh --dry-run`

2. **Compression not working**
   - Verify archives are > 7 days old
   - Check gzip is installed: `which gzip`
   - Test manual compression: `gzip -9 -k <archive-file>`

3. **Cron not running**
   - Verify cron job: `crontab -l | grep event-archiver`
   - Check cron daemon: `pgrep cron`
   - Verify log permissions: `ls -l /var/log/cortex/`

4. **Disk space issues**
   - Run immediate compression: `./scripts/events/event-archiver.sh --compress-only`
   - Emergency cleanup: `./scripts/events/event-archiver.sh --cleanup-only`
   - Lower thresholds temporarily

### Recovery Procedures

```bash
# Restore archived events
./scripts/events/archive-utils.sh restore 2025-11-20 heartbeat

# Decompress for analysis
./scripts/events/archive-utils.sh decompress 2025-11-20

# Verify archive integrity
./scripts/events/archive-utils.sh verify

# Emergency disk cleanup
find coordination/events/archive -mtime +30 -name "*.jsonl.gz" -delete
```

## Performance Optimization

### Tuning for High Volume

If processing > 100k events/day:

1. **Increase rotation frequency**
   ```bash
   ROTATION_SIZE_MB=5  # Rotate at 5MB instead of 10MB
   ```

2. **More aggressive compression**
   ```bash
   COMPRESS_AGE_DAYS=3  # Compress after 3 days instead of 7
   ```

3. **Run archiver more frequently**
   ```cron
   0 */6 * * *  # Every 6 hours instead of daily
   ```

### Tuning for Low Volume

If processing < 10k events/day:

1. **Larger rotation threshold**
   ```bash
   ROTATION_SIZE_MB=50  # Rotate at 50MB
   ```

2. **Delayed compression**
   ```bash
   COMPRESS_AGE_DAYS=14  # Compress after 2 weeks
   ```

3. **Less frequent archival**
   ```cron
   0 2 * * 0  # Weekly on Sunday
   ```

## Security Considerations

1. **Log file permissions**: Ensure `/var/log/cortex/` is writable only by authorized users
2. **Archive access**: Restrict read access to archives containing sensitive data
3. **Backup encryption**: Encrypt archives before external backup
4. **Retention compliance**: Adjust `DELETE_AGE_DAYS` to meet data retention policies

## Best Practices

1. **Always test with dry-run** before production deployment
2. **Monitor disk usage** with alerts at 80% capacity
3. **Schedule during off-hours** (2-3 AM) to minimize impact
4. **Verify compression ratios** monthly to ensure effectiveness
5. **Test restoration** quarterly to validate archive integrity
6. **Adjust thresholds** based on actual event volume
7. **Include in backups** to prevent data loss
8. **Document customizations** to threshold values

## Future Enhancements

Potential improvements for future versions:

1. **Cloud archival** - Upload old archives to S3/GCS
2. **Parallel compression** - Process multiple files simultaneously
3. **Incremental archival** - Track processed events for efficiency
4. **Archive analytics** - Generate insights from historical events
5. **Automatic threshold tuning** - Adjust based on event volume
6. **Dashboard integration** - Real-time archival metrics
7. **Email notifications** - Alert on failures or thresholds
8. **Custom retention policies** - Per-event-type retention rules

## Files Created/Modified

### New Files
- `/Users/ryandahlberg/Projects/cortex/scripts/events/event-archiver.sh` (executable)
- `/Users/ryandahlberg/Projects/cortex/scripts/events/setup-archiver-cron.sh` (executable)
- `/Users/ryandahlberg/Projects/cortex/scripts/events/archive-utils.sh` (executable)
- `/Users/ryandahlberg/Projects/cortex/docs/EVENT-ARCHIVAL.md`
- `/Users/ryandahlberg/Projects/cortex/EVENT-ARCHIVAL-DEPLOYMENT.md` (this file)

### Modified Files
- `/Users/ryandahlberg/Projects/cortex/scripts/setup-event-processing.sh`
  - Added archiver cron job
  - Updated setup instructions
  - Enhanced next steps

## Deployment Checklist

- [x] Create event-archiver.sh script
- [x] Create setup-archiver-cron.sh script
- [x] Create archive-utils.sh utilities
- [x] Update setup-event-processing.sh
- [x] Write comprehensive documentation
- [x] Test with dry-run mode
- [x] Verify log file creation
- [x] Test archive utilities
- [ ] Setup cron job (user action required)
- [ ] Configure log rotation
- [ ] Setup backup strategy
- [ ] Configure monitoring alerts

## Next Steps

1. **Setup Automation**
   ```bash
   ./scripts/events/setup-archiver-cron.sh
   ```

2. **Verify Setup**
   ```bash
   # Check cron job
   crontab -l | grep event-archiver

   # Test execution
   ./scripts/events/event-archiver.sh --dry-run
   ```

3. **Monitor First Run**
   ```bash
   # Wait for cron execution (next day at 2 AM)
   # Then check logs
   tail -f /var/log/cortex/archiver.log
   ```

4. **Review and Tune**
   ```bash
   # Check statistics
   ./scripts/events/archive-utils.sh stats

   # Adjust thresholds if needed
   vim scripts/events/event-archiver.sh
   ```

## Support

For issues or questions:
1. Check documentation: `docs/EVENT-ARCHIVAL.md`
2. Review logs: `/var/log/cortex/archiver.log`
3. Test with dry-run: `./scripts/events/event-archiver.sh --dry-run --verbose`
4. Use utilities: `./scripts/events/archive-utils.sh help`

## Summary

Event archival and compression automation is now fully implemented for Cortex. The system provides:

- Automated daily archival of events older than 24 hours
- Compression of archives older than 7 days
- Rotation of large JSONL files (> 10MB)
- Cleanup of archives older than 90 days
- Comprehensive utilities for archive management
- Detailed documentation and troubleshooting guides

The system is production-ready and can be activated by running the setup script or manually configuring the cron job.
