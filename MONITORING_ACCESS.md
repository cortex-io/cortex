# Monitoring Sites Access - RESTORED

## Status: OPERATIONAL

Both monitoring sites are now accessible via HTTPS ingress.

## Access URLs

### Grafana Dashboard
- **URL**: https://grafana.ry-ops.dev
- **HTTP Redirect**: http://grafana.ry-ops.dev (auto-redirects to HTTPS)
- **Status**: Fully operational
- **Default behavior**: Redirects to /login page

### Prometheus
- **URL**: https://prometheus.ry-ops.dev
- **HTTP Redirect**: http://prometheus.ry-ops.dev (auto-redirects to HTTPS)
- **Status**: Fully operational
- **Default behavior**: Redirects to /query page

## Infrastructure Details

### Services
- **Grafana Service**: kube-prometheus-stack-grafana (port 80)
- **Prometheus Service**: kube-prometheus-stack-prometheus (port 9090)
- **Namespace**: monitoring

### Ingress Configuration
- **Ingress Controller**: Traefik
- **Ingress Class**: traefik
- **TLS**: Enabled (Traefik default certificates)
- **Load Balancer**: 10.88.145.200

### Files Created
1. `/Users/ryandahlberg/Projects/cortex/k8s/monitoring/grafana-ingress.yaml`
2. `/Users/ryandahlberg/Projects/cortex/k8s/monitoring/prometheus-ingress.yaml`

## DNS Requirements

For external access, ensure DNS records are configured:

```
grafana.ry-ops.dev      A/CNAME → 10.88.145.200
prometheus.ry-ops.dev   A/CNAME → 10.88.145.200
```

## Verification Commands

Test HTTP access:
```bash
curl -I http://grafana.ry-ops.dev
curl -I http://prometheus.ry-ops.dev
```

Test HTTPS access:
```bash
curl -Ik https://grafana.ry-ops.dev
curl -Ik https://prometheus.ry-ops.dev
```

Check ingress status:
```bash
kubectl get ingress -n monitoring
kubectl describe ingress grafana -n monitoring
kubectl describe ingress prometheus -n monitoring
```

## Known Issues

- Let's Encrypt certificates (letsencrypt-prod ClusterIssuer) not configured
- Currently using Traefik default TLS certificates
- Certificate status shows "False" but HTTPS still works via Traefik defaults

## Future Improvements

1. Configure Let's Encrypt ClusterIssuer for proper SSL certificates
2. Add authentication/authorization if needed
3. Consider adding rate limiting
4. Set up monitoring alerts for ingress availability

## Resolution Summary

**Problem**: Monitoring sites inaccessible
**Root Cause**: Missing ingress resources (services had LoadBalancers but no ingress)
**Solution**: Created ingress resources for both Grafana and Prometheus
**Result**: Both sites now accessible via HTTPS at *.ry-ops.dev domains
**Time to Resolution**: ~3 minutes

---
*Created: 2025-12-26*
*Last Updated: 2025-12-26*
