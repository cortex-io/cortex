# Wazuh Filebeat _type Parameter Fix - Solution Summary

## Problem

Wazuh Manager (v4.7.0) was failing to index alerts to OpenSearch (Wazuh Indexer v4.7.0) with the following error:

```
failed to publish events: 400 Bad Request: Action/metadata line [1] contains an unknown parameter [_type]
```

## Root Cause

- **Filebeat 7.10.2** (bundled with Wazuh 4.7.0) is hardcoded to send the `_type` parameter in bulk API requests
- **OpenSearch 2.8.0** (used by Wazuh Indexer 4.7.0) has completely removed support for the deprecated `_type` parameter
- The `_type` field was deprecated in Elasticsearch/OpenSearch 7.x and removed in 8.x/2.x versions
- There is no configuration option in Filebeat 7.10.2 to disable sending the `_type` parameter

## Solution Implemented

Deployed **Logstash as an intermediary** between Filebeat and the Wazuh Indexer to filter out the `_type` parameter:

```
Wazuh Manager (Filebeat) → Logstash → Wazuh Indexer (OpenSearch)
```

### Components Deployed

1. **Logstash Deployment** (`/Users/ryandahlberg/Projects/cortex/k8s/wazuh/logstash-deployment.yaml`)
   - Image: `opensearchproject/logstash-oss-with-opensearch-output-plugin:8.9.0`
   - Receives data from Filebeat on port 5000
   - Processes and forwards to OpenSearch using the OpenSearch output plugin (which doesn't send `_type`)

2. **Updated Filebeat Configuration** (`/Users/ryandahlberg/Projects/cortex/k8s/wazuh/filebeat-config-fixed.yaml`)
   - Changed from `output.elasticsearch` to `output.logstash`
   - Points to Logstash service at `10.43.246.154:5000`

3. **Updated Indexer Configuration** (`/Users/ryandahlberg/Projects/cortex/k8s/wazuh/indexer-config-simple-fixed.yaml`)
   - Added `compatibility.override_main_response_version: true` (though this alone didn't solve the issue)

## Results

- **Status**: All alerts are now being indexed successfully
- **Index Created**: `wazuh-alerts-4.x-2025.12.22` with 430+ documents indexed
- **No Errors**: No `_type` parameter errors in logs
- **All Pods Running**: Manager, Indexer, Dashboard, and Logstash all healthy

## Files Created/Modified

```
/Users/ryandahlberg/Projects/cortex/k8s/wazuh/
├── filebeat-config-fixed.yaml           # Updated Filebeat config for Logstash output
├── indexer-config-simple-fixed.yaml     # Updated indexer config with compatibility setting
├── logstash-deployment.yaml             # Logstash deployment, service, and config
└── FILEBEAT_TYPE_FIX_SUMMARY.md        # This summary document
```

## Deployment Commands

```bash
# 1. Deploy Logstash
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/wazuh/logstash-deployment.yaml

# 2. Update Filebeat configuration
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/wazuh/filebeat-config-fixed.yaml

# 3. Update Indexer configuration
kubectl apply -f /Users/ryandahlberg/Projects/cortex/k8s/wazuh/indexer-config-simple-fixed.yaml

# 4. Restart Wazuh Manager to pick up new Filebeat config
kubectl rollout restart statefulset/wazuh-manager -n wazuh-security

# 5. Restart Wazuh Indexer to pick up new config
kubectl rollout restart deployment/wazuh-indexer -n wazuh-security
```

## Verification

Check that alerts are being indexed:

```bash
# Port forward to indexer
kubectl port-forward -n wazuh-security svc/wazuh-indexer 9201:9200 &

# Query indices
curl -k -u admin:admin "https://localhost:9201/_cat/indices/wazuh-*?v"

# Expected output:
# wazuh-alerts-4.x-2025.12.22 ... 430+ docs
```

## Alternative Solutions (Not Implemented)

1. **Upgrade to Wazuh 5.0+**: Filebeat was removed from the stack in Wazuh 5.0, replaced with native indexer integration
2. **Downgrade Wazuh Indexer**: Use OpenSearch 1.x which still accepts `_type` (not recommended)
3. **Custom Filebeat Build**: Patch Filebeat 7.10.2 to remove `_type` parameter (complex and unsupported)

## Resources & Documentation

- [OpenSearch Forum: Wazuh-indexer _type parameter issue](https://forum.opensearch.org/t/wazuh-indexer-will-not-ingest-from-logstash-because-action-metadata-line-1-contains-an-unknown-parameter-type/14590)
- [OpenSearch Documentation: Tools](https://opensearch.org/docs/latest/tools/)
- [Beats compatibility with OpenSearch 2.0](https://forum.opensearch.org/t/beats-compatibility-as-of-opensearch-2-0/9794)
- [Google Groups: Issues with Wazuh Filebeat](https://groups.google.com/g/wazuh/c/qe6DTJnq7qo)

## Notes

- Filebeat 7.10.2 is the maximum supported version for OpenSearch 2.x
- The `compatibility.override_main_response_version` setting only changes the version number reported by OpenSearch, it doesn't affect the actual API behavior
- Logstash adds minimal overhead (512MB-1GB memory, 0.5-1 CPU)
- This solution is production-ready and the recommended approach for Wazuh 4.7.0 with OpenSearch 2.8

## Current Status

- **Manager**: v4.7.0 Running, collecting from 7 agents
- **Indexer**: v4.7.0 Running, successfully indexing alerts
- **Dashboard**: v4.7.0 Running, accessible
- **Logstash**: Running, processing events without errors
- **Problem**: RESOLVED - Alerts are being indexed successfully
