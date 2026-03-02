# Manual Wazuh Dashboard Creation Guide

Since NDJSON import is encountering errors, this guide provides step-by-step instructions to manually create both dashboards in the Wazuh UI.

## Access Wazuh

1. Navigate to: **http://wazuh.cortex.local** or **http://10.88.145.208**
2. Log in with admin credentials

---

## Dashboard 1: K3s Cluster Security

### Step 1: Create Index Pattern (if not exists)

1. Go to **Management → Stack Management → Index Patterns**
2. Click **Create index pattern**
3. Enter pattern: `wazuh-alerts-*`
4. Click **Next step**
5. Select **@timestamp** as time field
6. Click **Create index pattern**

### Step 2: Create Dashboard

1. Go to **Dashboards** in the left menu
2. Click **Create dashboard**
3. Click **Save** and name it: **K3s Cluster Security - Larry & the Darryl's**
4. Add description: **Comprehensive security monitoring for all 8 K3s nodes**

### Step 3: Add Visualizations

#### Panel 1: K3s Cluster Health - All Nodes
- Click **Add** → **Aggregation based**
- Select **Metric**
- **Data Source**: `wazuh-alerts-*`
- **Metrics**:
  - Aggregation: **Unique Count**
  - Field: **agent.name**
- **Bucket** filter:
  ```
  agent.name:(k3s-master01 OR k3s-master02 OR k3s-master03 OR k3s-worker01 OR k3s-worker02 OR k3s-worker03-agent OR k3s-worker04)
  ```
- Click **Update** → **Save** → Title: **K3s Cluster Health - All Nodes**
- Position: Top left (x:0, y:0, w:6, h:4)

#### Panel 2: Security Events (24h)
- Click **Add** → **Aggregation based** → **Metric**
- **Data Source**: `wazuh-alerts-*`
- **Metrics**:
  - Aggregation: **Count**
- **Bucket** filter:
  ```
  agent.name:(k3s-master01 OR k3s-master02 OR k3s-master03 OR k3s-worker01 OR k3s-worker02 OR k3s-worker03-agent OR k3s-worker04)
  ```
- **Save** → Title: **Security Events (24h)**
- Position: (x:6, y:0, w:6, h:4)

#### Panel 3: Critical Alerts
- Click **Add** → **Aggregation based** → **Metric**
- **Metrics**: **Count**
- **Bucket** filter:
  ```
  rule.level:[12 TO 15] AND agent.name:(k3s-master01 OR k3s-master02 OR k3s-master03 OR k3s-worker01 OR k3s-worker02 OR k3s-worker03-agent OR k3s-worker04)
  ```
- **Save** → Title: **Critical Alerts**
- Position: (x:12, y:0, w:6, h:4)

#### Panel 4: Pod Exec Events
- Click **Add** → **Aggregation based** → **Metric**
- **Metrics**: **Count**
- **Bucket** filter:
  ```
  data.audit.objectRef.subresource:exec AND agent.name:(k3s-master*)
  ```
- **Save** → Title: **Pod Exec Events**
- Position: (x:18, y:0, w:6, h:4)

#### Panel 5: Master Nodes - Security Timeline
- Click **Add** → **Aggregation based** → **Line** (or **Area**)
- **Metrics**: **Count**
- **Buckets**:
  - **X-Axis**:
    - Aggregation: **Date Histogram**
    - Field: **@timestamp**
    - Interval: **Auto**
  - **Split Series**:
    - Aggregation: **Terms**
    - Field: **agent.name**
- **Filter**:
  ```
  agent.name:(k3s-master01 OR k3s-master02 OR k3s-master03)
  ```
- **Save** → Title: **Master Nodes - Security Timeline**
- Position: (x:0, y:4, w:12, h:6)

#### Panel 6: Worker Nodes - Security Timeline
- Same as Panel 5, but with filter:
  ```
  agent.name:(k3s-worker01 OR k3s-worker02 OR k3s-worker03-agent OR k3s-worker04)
  ```
- **Save** → Title: **Worker Nodes - Security Timeline**
- Position: (x:12, y:4, w:12, h:6)

#### Panel 7: Kubernetes Audit Events by Type
- Click **Add** → **Aggregation based** → **Pie**
- **Metrics**: **Count**
- **Buckets**:
  - **Split Slices**:
    - Aggregation: **Terms**
    - Field: **data.audit.verb**
    - Size: **10**
- **Filter**:
  ```
  data.audit.verb:* AND agent.name:(k3s-master*)
  ```
- **Save** → Title: **Kubernetes Audit Events by Type**
- Position: (x:0, y:10, w:8, h:6)

#### Panel 8: Alert Severity Distribution
- Click **Add** → **Aggregation based** → **Pie**
- **Metrics**: **Count**
- **Buckets**:
  - **Split Slices**:
    - Aggregation: **Range**
    - Field: **rule.level**
    - Ranges:
      - 1 to 4: **Low (1-4)**
      - 5 to 7: **Medium (5-7)**
      - 8 to 11: **High (8-11)**
      - 12 to 15: **Critical (12+)**
- **Filter**:
  ```
  agent.name:(k3s-master* OR k3s-worker*)
  ```
- **Save** → Title: **Alert Severity Distribution**
- Position: (x:8, y:10, w:8, h:6)

#### Panel 9: Top Security Rules Triggered
- Click **Add** → **Aggregation based** → **Pie**
- **Metrics**: **Count**
- **Buckets**:
  - **Split Slices**:
    - Aggregation: **Terms**
    - Field: **rule.description.keyword**
    - Size: **10**
- **Filter**:
  ```
  agent.name:(k3s-master* OR k3s-worker*)
  ```
- **Save** → Title: **Top Security Rules Triggered**
- Position: (x:16, y:10, w:8, h:6)

#### Panel 10: Node Status Overview (Table)
- Click **Add** → **Aggregation based** → **Data Table**
- **Metrics**: **Count**
- **Buckets**:
  - **Split Rows**:
    - Aggregation: **Terms**
    - Field: **agent.name**
- **Columns to display**:
  - **agent.name**
  - **agent.ip**
  - **rule.level** (Max aggregation)
  - **rule.description**
  - **@timestamp**
- **Filter**:
  ```
  agent.name:(k3s-master* OR k3s-worker*)
  ```
- **Save** → Title: **Node Status Overview**
- Position: (x:0, y:16, w:24, h:6)

#### Panel 11: Kubernetes RBAC Changes (Table)
- Click **Add** → **Discover** or **Data Table**
- **Columns**:
  - **@timestamp**
  - **data.audit.verb**
  - **data.audit.objectRef.name**
  - **data.audit.user.username**
- **Filter**:
  ```
  data.audit.objectRef.resource:*authorization* AND agent.name:(k3s-master*)
  ```
- **Sort**: **@timestamp desc**
- **Save** → Title: **Kubernetes RBAC Changes**
- Position: (x:0, y:22, w:12, h:6)

#### Panel 12: Secrets Access Events (Table)
- Same as Panel 11, but with filter:
  ```
  data.audit.objectRef.resource:secrets AND agent.name:(k3s-master*)
  ```
- **Columns**:
  - **@timestamp**
  - **data.audit.verb**
  - **data.audit.objectRef.namespace**
  - **data.audit.user.username**
- **Save** → Title: **Secrets Access Events**
- Position: (x:12, y:22, w:12, h:6)

#### Panel 13: Recent Security Events - All Nodes (Table)
- Click **Add** → **Discover**
- **Columns**:
  - **@timestamp**
  - **agent.name**
  - **rule.level**
  - **rule.description**
  - **rule.mitre.technique**
- **Filter**:
  ```
  agent.name:(k3s-master* OR k3s-worker*)
  ```
- **Sort**: **@timestamp desc**
- **Rows**: **25**
- **Save** → Title: **Recent Security Events - All Nodes**
- Position: (x:0, y:28, w:24, h:8)

### Step 4: Configure Dashboard Settings

1. Click **Edit** on the dashboard
2. Click **Options** (gear icon)
3. Set:
   - **Use margins**: Enabled
   - **Refresh interval**: 30 seconds
   - **Time range**: Last 24 hours (default)
4. Click **Save**

---

## Dashboard 2: UniFi Network Security - Syslog Events

### Step 1: Verify Index Pattern

Use the same `wazuh-alerts-*` index pattern created above.

### Step 2: Create Dashboard

1. Go to **Dashboards**
2. Click **Create dashboard**
3. **Save** → Name: **UniFi Network Security - Syslog Events**
4. Description: **Real-time monitoring of UniFi network devices and events**

### Step 3: Add Visualizations

#### Panel 1: Total UniFi Events (24h)
- Click **Add** → **Metric**
- **Metrics**: **Count**
- **Filter**:
  ```
  syslog.hostname:(Dream-Machine* OR U6* OR U7* OR USW*) OR data.srcip:10.88.140.*
  ```
- **Save** → Title: **Total UniFi Events (24h)**
- Position: (x:0, y:0, w:6, h:4)

#### Panel 2: Active UniFi Devices
- Click **Add** → **Metric**
- **Metrics**:
  - Aggregation: **Unique Count**
  - Field: **syslog.hostname**
- **Filter**:
  ```
  syslog.hostname:(Dream-Machine* OR U6* OR U7* OR USW*)
  ```
- **Save** → Title: **Active UniFi Devices**
- Position: (x:6, y:0, w:6, h:4)

#### Panel 3: Client Connections (24h)
- Click **Add** → **Metric**
- **Metrics**: **Count**
- **Filter**:
  ```
  data.message:(*STA_LEAVE* OR *STA_JOIN* OR *ASSOC* OR *DISASSOC*)
  ```
- **Save** → Title: **Client Connections (24h)**
- Position: (x:12, y:0, w:6, h:4)

#### Panel 4: Security Alerts
- Click **Add** → **Metric**
- **Metrics**: **Count**
- **Filter**:
  ```
  (syslog.hostname:Dream-Machine* OR U6* OR U7*) AND rule.level:[8 TO 15]
  ```
- **Save** → Title: **Security Alerts**
- Position: (x:18, y:0, w:6, h:4)

#### Panel 5: UniFi Network Events Timeline
- Click **Add** → **Area** (or **Line**)
- **Metrics**: **Count**
- **Buckets**:
  - **X-Axis**:
    - Aggregation: **Date Histogram**
    - Field: **@timestamp**
    - Interval: **Auto**
  - **Split Series**:
    - Aggregation: **Terms**
    - Field: **syslog.hostname**
- **Filter**:
  ```
  syslog.hostname:(Dream-Machine* OR U6* OR U7* OR USW*)
  ```
- **Save** → Title: **UniFi Network Events Timeline**
- Position: (x:0, y:4, w:24, h:6)

#### Panel 6: Events by Device Type
- Click **Add** → **Pie**
- **Metrics**: **Count**
- **Buckets**:
  - **Split Slices**:
    - Aggregation: **Terms**
    - Field: **syslog.hostname**
    - Size: **10**
- **Filter**:
  ```
  syslog.hostname:(Dream-Machine* OR U6* OR U7* OR USW*)
  ```
- **Save** → Title: **Events by Device Type**
- Position: (x:0, y:10, w:8, h:6)

#### Panel 7: Top Event Types
- Click **Add** → **Pie**
- **Buckets**:
  - **Split Slices**:
    - Aggregation: **Terms**
    - Field: **syslog.program**
    - Size: **10**
- **Filter**: (same as Panel 6)
- **Save** → Title: **Top Event Types**
- Position: (x:8, y:10, w:8, h:6)

#### Panel 8: Network Services
- Click **Add** → **Pie**
- **Buckets**:
  - **Split Slices**:
    - Aggregation: **Terms**
    - Field: **data.program**
    - Size: **10**
- **Filter**:
  ```
  syslog.hostname:Dream-Machine*
  ```
- **Save** → Title: **Network Services**
- Position: (x:16, y:10, w:8, h:6)

#### Panel 9: UDM Pro - System Events (Table)
- Click **Add** → **Discover**
- **Columns**:
  - **@timestamp**
  - **syslog.program**
  - **data.message**
  - **rule.level**
- **Filter**:
  ```
  syslog.hostname:Dream-Machine-Pro
  ```
- **Sort**: **@timestamp desc**
- **Save** → Title: **UDM Pro - System Events**
- Position: (x:0, y:16, w:12, h:6)

#### Panel 10: Access Points - Wireless Events (Table)
- Click **Add** → **Discover**
- **Columns**:
  - **@timestamp**
  - **syslog.hostname**
  - **data.message**
- **Filter**:
  ```
  syslog.hostname:(U6* OR U7*)
  ```
- **Sort**: **@timestamp desc**
- **Save** → Title: **Access Points - Wireless Events**
- Position: (x:12, y:16, w:12, h:6)

#### Panel 11: Client Disconnection Events (Table)
- Click **Add** → **Discover**
- **Columns**:
  - **@timestamp**
  - **syslog.hostname**
  - **data.message**
- **Filter**:
  ```
  data.message:(*STA_LEAVE* OR *disassoc* OR *DEAUTH*)
  ```
- **Sort**: **@timestamp desc**
- **Save** → Title: **Client Disconnection Events**
- Position: (x:0, y:22, w:12, h:6)

#### Panel 12: DHCP & DNS Activity (Table)
- Click **Add** → **Discover**
- **Columns**:
  - **@timestamp**
  - **syslog.program**
  - **data.message**
- **Filter**:
  ```
  syslog.program:(dnsmasq OR dhcpd)
  ```
- **Sort**: **@timestamp desc**
- **Save** → Title: **DHCP & DNS Activity**
- Position: (x:12, y:22, w:12, h:6)

#### Panel 13: BGP Routing Events (Table)
- Click **Add** → **Discover**
- **Columns**:
  - **@timestamp**
  - **data.message**
- **Filter**:
  ```
  syslog.hostname:Dream-Machine-Pro AND syslog.program:bgpd
  ```
- **Sort**: **@timestamp desc**
- **Save** → Title: **BGP Routing Events**
- Position: (x:0, y:28, w:12, h:6)

#### Panel 14: Security & Authentication Events (Table)
- Click **Add** → **Discover**
- **Columns**:
  - **@timestamp**
  - **syslog.hostname**
  - **data.message**
  - **rule.level**
- **Filter**:
  ```
  (data.message:*WPA* OR *auth* OR *security*) AND syslog.hostname:(U6* OR U7* OR Dream-Machine*)
  ```
- **Sort**: **@timestamp desc**
- **Save** → Title: **Security & Authentication Events**
- Position: (x:12, y:28, w:12, h:6)

#### Panel 15: All UniFi Events - Recent (Table)
- Click **Add** → **Discover**
- **Columns**:
  - **@timestamp**
  - **syslog.hostname**
  - **syslog.program**
  - **data.message**
  - **rule.level**
- **Filter**:
  ```
  syslog.hostname:(Dream-Machine* OR U6* OR U7* OR USW*) OR data.srcip:10.88.140.*
  ```
- **Sort**: **@timestamp desc**
- **Page size**: **25**
- **Save** → Title: **All UniFi Events - Recent**
- Position: (x:0, y:34, w:24, h:8)

### Step 4: Configure Dashboard Settings

1. Click **Edit**
2. Click **Options**
3. Set:
   - **Refresh interval**: 30 seconds
   - **Time range**: Last 24 hours
4. Click **Save**

---

## Troubleshooting

### No Data Showing in Panels

**Check if data exists**:
```bash
# K3s agents
kubectl exec -n wazuh-security wazuh-manager-0 -- /var/ossec/bin/agent_control -l

# UniFi syslog
kubectl logs -n default -l app=unifi-syslog --tail=50
```

### Field Not Found Error

Some fields may need `.keyword` appended for aggregations:
- Use **rule.description.keyword** instead of **rule.description** for Terms aggregations
- Use **agent.name.keyword** if **agent.name** doesn't work

### Visualization Not Updating

1. Check time range (top right) - ensure it covers data
2. Click **Refresh** button
3. Verify auto-refresh is enabled (30s)

---

## Quick Tips

1. **Save frequently** - Wazuh doesn't auto-save
2. **Use filters liberally** - They make dashboards much faster
3. **Test queries in Discover first** - Verify data before creating visualizations
4. **Clone panels** - Right-click a panel → **Clone** to duplicate similar visualizations
5. **Export when done** - **Dashboard → Share → Download as JSON** for backup

---

**Estimated Time**:
- K3s Dashboard: 30-45 minutes
- UniFi Dashboard: 30-45 minutes

**Created by**: Larry (Claude) for Cortex Holdings Infrastructure Monitoring
**Last Updated**: 2025-12-21
