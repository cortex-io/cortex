# UniFi Syslog Server Implementation

## Project Overview
Deploy a lightweight syslog receiver in K3s to capture logging from UniFi network devices for testing purposes. UniFi already handles internal logging and alerting - this is supplementary for centralized log visibility and potential Cortex chat integration.

## Requirements
- Simple syslog receiver (rsyslog or syslog-ng)
- Minimal resource footprint (<100MB RAM)
- Persistent storage for log retention
- LoadBalancer service for UniFi devices to send logs
- Optional: Forward to existing Loki infrastructure
- Optional: MCP server for Cortex chat log queries

## Architecture

```
UniFi Devices → Syslog LoadBalancer (10.88.145.x:514)
                        ↓
                  Rsyslog Container (K3s)
                        ↓
                  Persistent Volume
                        ↓
              (Optional: Forward to Loki)
                        ↓
              (Optional: Syslog MCP Server)
                        ↓
                    Cortex Chat
```

## Implementation Steps

### Phase 1: Basic Syslog Receiver

1. **Create Namespace**
   ```bash
   kubectl create namespace syslog
   ```

2. **Deploy Rsyslog Container**
   - Image: `rsyslog/syslog_appliance_alpine` or custom
   - Port: 514/UDP (syslog), 514/TCP (syslog-tcp)
   - Volume: PVC for log storage (10-20GB)
   - Resource limits: 128Mi RAM, 100m CPU

3. **Create LoadBalancer Service**
   - Type: LoadBalancer
   - Port: 514/UDP, 514/TCP
   - MetalLB will assign IP in 10.88.145.x range

4. **Configure Rsyslog**
   - Accept remote logs
   - Parse UniFi log format
   - Rotate logs (size-based or time-based)
   - Optional: Filter by severity

### Phase 2: Storage Configuration

1. **Persistent Volume**
   - Size: 10-20GB (adjust based on log volume)
   - StorageClass: local-path (K3s default)
   - Mount: `/var/log/remote`

2. **Log Rotation**
   - Daily rotation
   - Keep 7-14 days
   - Compress old logs

### Phase 3: UniFi Configuration

1. **Configure UniFi to Send Syslog**
   - Settings → System → Advanced
   - Remote Syslog Server: `<LoadBalancer-IP>:514`
   - Protocol: UDP (standard) or TCP (reliable)

2. **Test Log Flow**
   - Generate test events in UniFi
   - Verify logs arriving in rsyslog container
   - Check log format and parsing

### Phase 4: Optional - Loki Integration

1. **Forward to Loki**
   - Configure rsyslog to forward to existing Loki instance
   - Use Loki's syslog receiver or rsyslog-to-loki bridge
   - Benefit: View logs in Grafana dashboards

2. **Loki Configuration**
   - Create UniFi log stream
   - Add labels: device, severity, facility
   - Create Grafana dashboard for UniFi logs

### Phase 5: Optional - Cortex MCP Integration

1. **Build Syslog MCP Server**
   - Read from persistent volume or query Loki
   - Tools:
     - `search_logs(query, time_range, severity)`
     - `get_recent_logs(device, count)`
     - `get_alerts(severity, time_range)`
     - `tail_logs(device, lines)`

2. **Deploy MCP Server**
   - Docker image with Python + MCP SDK
   - Mount same PVC as rsyslog (read-only)
   - Expose via service for Cortex orchestrator

3. **Integrate with Cortex Chat**
   - Add syslog tools to orchestrator
   - Test queries like "show me recent UniFi errors"
   - Enable log analysis via Claude

## Deployment Files Needed

### 1. `syslog-deployment.yaml`
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rsyslog
  namespace: syslog
spec:
  replicas: 1
  selector:
    matchLabels:
      app: rsyslog
  template:
    metadata:
      labels:
        app: rsyslog
    spec:
      containers:
      - name: rsyslog
        image: rsyslog/syslog_appliance_alpine:latest
        ports:
        - containerPort: 514
          protocol: UDP
          name: syslog-udp
        - containerPort: 514
          protocol: TCP
          name: syslog-tcp
        volumeMounts:
        - name: logs
          mountPath: /var/log/remote
        - name: config
          mountPath: /etc/rsyslog.d
        resources:
          limits:
            memory: "128Mi"
            cpu: "100m"
          requests:
            memory: "64Mi"
            cpu: "50m"
      volumes:
      - name: logs
        persistentVolumeClaim:
          claimName: syslog-pvc
      - name: config
        configMap:
          name: rsyslog-config
```

### 2. `syslog-pvc.yaml`
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: syslog-pvc
  namespace: syslog
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: local-path
```

### 3. `syslog-service.yaml`
```yaml
apiVersion: v1
kind: Service
metadata:
  name: rsyslog
  namespace: syslog
spec:
  type: LoadBalancer
  selector:
    app: rsyslog
  ports:
  - name: syslog-udp
    port: 514
    targetPort: 514
    protocol: UDP
  - name: syslog-tcp
    port: 514
    targetPort: 514
    protocol: TCP
```

### 4. `rsyslog-config.yaml` (ConfigMap)
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rsyslog-config
  namespace: syslog
data:
  remote.conf: |
    # Listen on UDP/TCP
    module(load="imudp")
    input(type="imudp" port="514")

    module(load="imtcp")
    input(type="imtcp" port="514")

    # Template for UniFi logs
    template(name="UniFiLog" type="string"
      string="/var/log/remote/unifi/%HOSTNAME%/%$YEAR%-%$MONTH%-%$DAY%.log")

    # Route UniFi logs
    if $fromhost-ip startswith '10.88.140.' then {
      action(type="omfile" dynaFile="UniFiLog")
      stop
    }

    # Rotate logs daily
    $outchannel log_rotation, /var/log/remote/unifi.log, 104857600, /usr/sbin/logrotate
```

## Testing

1. **Verify Deployment**
   ```bash
   kubectl get all -n syslog
   kubectl get pvc -n syslog
   kubectl get svc rsyslog -n syslog  # Note the EXTERNAL-IP
   ```

2. **Test Syslog Reception**
   ```bash
   # From any machine
   logger -n <EXTERNAL-IP> -P 514 "Test message from UniFi"

   # Check logs
   kubectl exec -n syslog -it deployment/rsyslog -- tail -f /var/log/remote/unifi.log
   ```

3. **Configure UniFi**
   - Add syslog server IP in UniFi console
   - Generate test event (e.g., reboot AP)
   - Verify log appears

## Maintenance

- **View Logs**: `kubectl exec -n syslog -it deployment/rsyslog -- tail -f /var/log/remote/unifi.log`
- **Log Rotation**: Automatic via rsyslog configuration
- **Storage Monitoring**: Check PVC usage periodically
- **Backup**: Logs stored in persistent volume (backed up with K3s)

## Optional Enhancements

1. **Grafana Dashboard**: If forwarding to Loki, create UniFi log dashboard
2. **Alerting**: Configure alerts for critical UniFi events
3. **MCP Integration**: Query logs via Cortex chat
4. **Log Parsing**: Parse structured UniFi log format for better analysis
5. **Multi-tenant**: Separate logs by UniFi site if multiple sites

## Resources

- Rsyslog Documentation: https://www.rsyslog.com/doc/
- UniFi Syslog Format: Check UniFi documentation for log structure
- Loki Syslog Receiver: https://grafana.com/docs/loki/latest/send-data/promtail/stages/syslog/

## Notes

- UniFi already provides comprehensive internal logging and alerting
- This is primarily for centralized visibility and testing
- Can be extended for other network devices (switches, firewalls, etc.)
- Consider security: syslog is unencrypted by default (TLS optional)
- MetalLB will assign LoadBalancer IP automatically from pool

## Status

**Phase**: Not started
**Priority**: Low (nice-to-have for testing)
**Dependencies**: None (Loki optional)
**Estimated Time**: 1-2 hours for basic setup
