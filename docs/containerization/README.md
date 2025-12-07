# Cortex Containerization Documentation

Welcome to the Cortex containerization documentation. This directory contains all the information you need to deploy, manage, and maintain Cortex in containerized environments.

## Quick Links

- **[Quick Start Guide](./QUICKSTART.md)** - Get running in 5 minutes
- **[Containerization Strategy](./CONTAINERIZATION-STRATEGY.md)** - Complete architecture and deployment guide
- **[Private Fork Setup](./PRIVATE-FORK-SETUP.md)** - Set up your private fork with upstream sync

## Documentation Structure

### Getting Started

1. **[QUICKSTART.md](./QUICKSTART.md)**
   - 5-minute deployment guide
   - Docker Compose setup
   - Kubernetes deployment
   - Verification steps
   - Common issues and solutions

### Architecture and Strategy

2. **[CONTAINERIZATION-STRATEGY.md](./CONTAINERIZATION-STRATEGY.md)**
   - Complete containerization architecture
   - Deployment options (Docker vs Kubernetes)
   - Configuration management
   - Secrets management
   - Security best practices
   - Monitoring and observability
   - Scaling strategies
   - Backup and disaster recovery
   - CI/CD pipelines
   - Operational procedures

### Fork Management

3. **[PRIVATE-FORK-SETUP.md](./PRIVATE-FORK-SETUP.md)**
   - Creating a private fork (IMPORTANT!)
   - Configuring upstream remote
   - Branch protection
   - Secrets configuration
   - Automated upstream sync
   - Security checklist

## File Locations

### Docker Files

Located in project root:

```
/Dockerfile                    # Multi-stage production image
/.dockerignore                 # Build context exclusions
/docker-compose.yml            # Base configuration
/docker-compose.dev.yml        # Development overrides
/docker-compose.prod.yml       # Production overrides
```

### Kubernetes Manifests

Located in `/k8s/`:

```
k8s/
├── namespace.yaml             # Dedicated namespace
├── configmap.yaml             # Non-sensitive config
├── secret.yaml.template       # Secrets template
├── deployment.yaml            # Application deployment
├── service.yaml               # Service definitions
├── ingress.yaml               # External access
├── pvc.yaml                   # Persistent volumes
├── serviceaccount.yaml        # RBAC configuration
└── network-policy.yaml        # Network security
```

### GitHub Actions

Located in `/.github/workflows/`:

```
.github/workflows/
├── docker-build.yml           # Build and test on PRs
├── docker-publish.yml         # Publish on releases
└── upstream-sync.yml          # Automated upstream sync
```

### Helper Scripts

Located in `/scripts/containerization/`:

```
scripts/containerization/
├── build-docker.sh            # Local Docker builds
├── run-docker.sh              # Run containers locally
├── deploy-k8s.sh              # Kubernetes deployment
└── test-container.sh          # Container testing
```

## Deployment Paths

### Path 1: Quick Test (5 minutes)

```bash
# Clone and start
git clone https://github.com/ry-ops/cortex.git
cd cortex
echo "ANTHROPIC_API_KEY=your-key" > .env
docker-compose up -d
```

**Best for:** Quick testing, evaluation

### Path 2: Development (10 minutes)

```bash
# Clone, configure, and start in dev mode
git clone https://github.com/YOUR-USERNAME/cortex-private.git
cd cortex-private
cat > .env << 'EOF'
ANTHROPIC_API_KEY=your-key
LOG_LEVEL=debug
EOF
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

**Best for:** Local development, testing features

### Path 3: Production (30 minutes)

```bash
# Set up Kubernetes deployment
kubectl create namespace cortex
kubectl create secret generic cortex-secrets \
  --from-literal=ANTHROPIC_API_KEY='your-key' \
  --namespace cortex
kubectl apply -f k8s/
```

**Best for:** Production deployments, high availability

## Key Features

### Security

- Non-root user (cortex:1000)
- Read-only root filesystem
- Automated vulnerability scanning
- Secrets management
- Network policies
- RBAC in Kubernetes

### Automation

- Automated Docker builds on PR
- Multi-architecture support (amd64, arm64)
- Automated security scanning
- Automated upstream sync (weekly)
- Automated releases

### Monitoring

- Health check endpoints
- Prometheus metrics
- Structured logging
- OpenTelemetry tracing
- Resource monitoring

### High Availability

- Kubernetes orchestration
- Rolling updates
- Self-healing
- Persistent storage
- Backup strategies

## Common Tasks

### Build Docker Image

```bash
# Local build
./scripts/containerization/build-docker.sh

# Multi-architecture build
./scripts/containerization/build-docker.sh --platform both

# Build without cache
./scripts/containerization/build-docker.sh --no-cache
```

### Deploy to Kubernetes

```bash
# Initial deployment
kubectl apply -f k8s/

# Update deployment
kubectl set image deployment/cortex \
  cortex=ghcr.io/ry-ops/cortex:v2.1.0 \
  -n cortex

# Rollback
kubectl rollout undo deployment/cortex -n cortex
```

### View Logs

```bash
# Docker Compose
docker-compose logs -f cortex

# Kubernetes
kubectl logs -f -n cortex deployment/cortex
```

### Update Configuration

```bash
# Docker Compose: Edit .env and restart
vim .env
docker-compose restart cortex

# Kubernetes: Update ConfigMap and restart
kubectl edit configmap cortex-config -n cortex
kubectl rollout restart deployment/cortex -n cortex
```

## Troubleshooting

### Container won't start

1. Check logs: `docker logs cortex` or `kubectl logs -n cortex deployment/cortex`
2. Verify API key is set
3. Check port availability
4. Verify volume permissions

### Health check failing

1. Test endpoint: `curl http://localhost:3000/health`
2. Increase startup time in health check
3. Check application logs
4. Verify all dependencies available

### Can't access dashboard

1. Verify port mapping: `docker port cortex`
2. Check firewall rules
3. Test locally: `curl http://localhost:3001`
4. For Kubernetes, use port-forward: `kubectl port-forward -n cortex svc/cortex 3001:3001`

### Persistent volume issues

1. Check PVC status: `kubectl get pvc -n cortex`
2. Verify storage class exists
3. Check permissions: `kubectl exec -n cortex cortex-xxx -- ls -la /app/coordination`
4. Fix permissions: `kubectl exec -n cortex cortex-xxx -- chown -R 1000:1000 /app/coordination`

## Best Practices

### Development

- Use development docker-compose for local work
- Mount source code for live reload
- Enable debug logging
- Use local storage for volumes

### Production

- Use production docker-compose or Kubernetes
- Pull images from GHCR
- Enable security hardening
- Configure monitoring and alerts
- Set up automated backups
- Use external secret management

### Security

- Never commit secrets to git
- Use platform-native secret storage
- Rotate secrets regularly
- Enable vulnerability scanning
- Apply network policies
- Use least-privilege access

### Maintenance

- Monitor upstream for updates
- Review security scan results weekly
- Keep base images updated
- Test updates in staging first
- Maintain backup procedures
- Document customizations

## Support

### Documentation

- This directory contains all containerization docs
- Main README: [/README.md](/README.md)
- Architecture docs: [/docs/](/docs/)

### Getting Help

1. Check [QUICKSTART.md](./QUICKSTART.md) for common scenarios
2. Review [CONTAINERIZATION-STRATEGY.md](./CONTAINERIZATION-STRATEGY.md) for details
3. Check logs for errors
4. Search existing issues on GitHub
5. Create new issue with logs and configuration

### Useful Commands

```bash
# Docker Compose
docker-compose ps                    # List containers
docker-compose logs -f cortex        # View logs
docker-compose exec cortex bash      # Access shell
docker-compose restart cortex        # Restart
docker-compose down -v               # Clean up

# Kubernetes
kubectl get pods -n cortex           # List pods
kubectl logs -f -n cortex cortex-xxx # View logs
kubectl exec -it -n cortex cortex-xxx -- bash  # Access shell
kubectl rollout restart deployment/cortex -n cortex  # Restart
kubectl delete namespace cortex      # Clean up

# Docker
docker ps                            # List containers
docker logs -f cortex                # View logs
docker exec -it cortex bash          # Access shell
docker stats cortex                  # Resource usage
docker system prune -a               # Clean up
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2025-12-07 | Initial containerization release |

## Contributing

When contributing containerization improvements:

1. Test locally with Docker Compose
2. Test in Kubernetes (minikube or kind)
3. Run security scans
4. Update documentation
5. Create PR with detailed description

## License

Cortex is licensed under the MIT License. See [LICENSE](/LICENSE) for details.

---

**Ready to get started?** Jump to the [Quick Start Guide](./QUICKSTART.md)

**Need more details?** Read the [Containerization Strategy](./CONTAINERIZATION-STRATEGY.md)

**Setting up a fork?** Follow the [Private Fork Setup](./PRIVATE-FORK-SETUP.md)
