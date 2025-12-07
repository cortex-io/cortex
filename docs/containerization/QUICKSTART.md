# Cortex Containerization - Quick Start Guide

Get Cortex running in a container in under 5 minutes!

## Prerequisites

- Docker installed ([Get Docker](https://docs.docker.com/get-docker/))
- Docker Compose installed (included with Docker Desktop)
- Anthropic API key ([Get one here](https://console.anthropic.com/))

## Option 1: Docker Compose (Recommended for Getting Started)

### Step 1: Clone Repository

```bash
# Clone your private fork (or upstream for testing)
git clone https://github.com/ry-ops/cortex.git
cd cortex
```

### Step 2: Configure Environment

```bash
# Create .env file with your API key
cat > .env << 'EOF'
ANTHROPIC_API_KEY=your-anthropic-api-key-here
OPENAI_API_KEY=your-openai-api-key-here  # Optional
LOG_LEVEL=info
EOF
```

### Step 3: Start Cortex

```bash
# Start in development mode
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Or for production mode
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Step 4: Verify It's Running

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f cortex

# Test health endpoint
curl http://localhost:3000/health

# Access dashboard
open http://localhost:3001
```

### Step 5: Use Cortex

```bash
# Execute a shell in the container
docker-compose exec cortex bash

# Inside container, run Cortex commands
cd /app
./scripts/daemon-control.sh status
```

### Stop Cortex

```bash
# Stop containers
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

## Option 2: Docker Run (Simple Test)

```bash
# Build image locally
docker build -t cortex:latest .

# Run container
docker run -d \
  --name cortex \
  -e ANTHROPIC_API_KEY=your-key-here \
  -p 3000:3000 \
  -p 3001:3001 \
  -v $(pwd)/data/coordination:/app/coordination \
  cortex:latest

# Check logs
docker logs -f cortex

# Stop container
docker stop cortex && docker rm cortex
```

## Option 3: Pre-built Image from GHCR

```bash
# Pull latest image
docker pull ghcr.io/ry-ops/cortex:latest

# Run with docker-compose
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  cortex:
    image: ghcr.io/ry-ops/cortex:latest
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    ports:
      - "3000:3000"
      - "3001:3001"
    volumes:
      - ./data/coordination:/app/coordination
    restart: unless-stopped
EOF

docker-compose up -d
```

## Option 4: Kubernetes (Production)

### Prerequisites

- Kubernetes cluster (local: minikube, kind, or cloud: EKS, GKE, AKS)
- kubectl configured

### Step 1: Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### Step 2: Create Secrets

```bash
# Create secret with your API key
kubectl create secret generic cortex-secrets \
  --from-literal=ANTHROPIC_API_KEY='your-key-here' \
  --namespace cortex
```

### Step 3: Deploy Cortex

```bash
# Apply all manifests
kubectl apply -f k8s/

# Or one by one
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/serviceaccount.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

### Step 4: Verify Deployment

```bash
# Check pod status
kubectl get pods -n cortex

# View logs
kubectl logs -f -n cortex deployment/cortex

# Check services
kubectl get svc -n cortex
```

### Step 5: Access Cortex

```bash
# Port forward to access locally
kubectl port-forward -n cortex svc/cortex 3000:3000 3001:3001

# Or use ingress (configure DNS first)
kubectl apply -f k8s/ingress.yaml
```

## Verification Checklist

After deployment, verify:

```bash
# 1. Container is running
docker ps | grep cortex
# OR
kubectl get pods -n cortex

# 2. Health check passes
curl http://localhost:3000/health
# Expected: {"status":"ok"}

# 3. Dashboard accessible
curl http://localhost:3001
# Expected: HTML response

# 4. Logs show no errors
docker-compose logs cortex | grep ERROR
# Expected: No critical errors

# 5. Coordination directory created
docker-compose exec cortex ls -la /app/coordination
# Expected: tasks/, events/, metrics/ directories
```

## Common First-Run Issues

### Issue: Container exits immediately

```bash
# Check logs for error
docker logs cortex

# Common causes:
# - Missing ANTHROPIC_API_KEY
# - Port already in use
# - Volume mount permissions
```

**Solution:**
```bash
# Ensure .env file has valid API key
cat .env | grep ANTHROPIC_API_KEY

# Check if ports are available
lsof -i :3000
lsof -i :3001

# Fix volume permissions
chmod -R 755 ./data
```

### Issue: Health check fails

```bash
# Test health endpoint directly
docker exec cortex curl -f http://localhost:3000/health
```

**Solution:**
```bash
# Increase startup time
# Edit docker-compose.yml healthcheck:
#   start_period: 60s  # Increase if needed
```

### Issue: Can't access dashboard

**Solution:**
```bash
# Verify port mapping
docker port cortex

# Test from host
curl http://localhost:3001

# Check firewall
# Allow ports 3000, 3001 through firewall
```

## Next Steps

Once running:

1. **Explore the Dashboard:** http://localhost:3001
2. **Run Your First Task:** See [Usage Guide](../../README.md)
3. **Configure MCP Servers:** See [Configuration Guide](./configuration-management.md)
4. **Set Up Monitoring:** See [Monitoring Guide](./monitoring-observability.md)
5. **Deploy to Production:** See [Kubernetes Deployment Guide](./kubernetes-deployment-guide.md)

## Development Workflow

```bash
# Start in development mode with live reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Make changes to code locally
# Container automatically picks up changes via volume mounts

# View logs in real-time
docker-compose logs -f cortex

# Restart if needed
docker-compose restart cortex

# Rebuild after dependency changes
docker-compose build cortex
```

## Useful Commands

```bash
# View resource usage
docker stats cortex

# Execute commands in container
docker-compose exec cortex bash -c "cd /app && ./scripts/daemon-control.sh status"

# Copy files from container
docker cp cortex:/app/coordination/task-queue.json ./

# Copy files to container
docker cp ./config.json cortex:/app/config/

# Clean up everything
docker-compose down -v
docker system prune -a
```

## Getting Help

- **Documentation:** `/docs/containerization/`
- **Troubleshooting:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Issues:** [GitHub Issues](https://github.com/ry-ops/cortex/issues)
- **Logs:** Always check logs first: `docker-compose logs -f cortex`

## Success Criteria

You've successfully deployed Cortex when:

- ✅ Container is running (`docker ps` shows cortex)
- ✅ Health check passes (`curl http://localhost:3000/health`)
- ✅ Dashboard loads (`open http://localhost:3001`)
- ✅ No errors in logs (`docker-compose logs cortex`)
- ✅ Coordination directory populated (`ls data/coordination/`)

---

**Need more control?** See the full [Containerization Strategy](./CONTAINERIZATION-STRATEGY.md)

**Ready for production?** See the [Kubernetes Deployment Guide](./kubernetes-deployment-guide.md)
