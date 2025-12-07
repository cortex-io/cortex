# Cortex Docker

Private containerized version of Cortex with Docker and Kubernetes support.

## Quick Start

See `docs/containerization/QUICKSTART.md` for deployment instructions.

## Documentation

- [Containerization Strategy](docs/containerization/CONTAINERIZATION-STRATEGY.md)
- [Private Fork Setup](docs/containerization/PRIVATE-FORK-SETUP.md)
- [Quick Start Guide](docs/containerization/QUICKSTART.md)

## Container Images

Images are automatically built and published to GitHub Container Registry:
- `ghcr.io/ry-ops/cortex-docker:latest`
- `ghcr.io/ry-ops/cortex-docker:<version>`

## Deployment Options

1. **Docker Compose**: `docker-compose up -d`
2. **Kubernetes**: `kubectl apply -f k8s/`
3. **Pre-built images**: Pull from GHCR

---

🤖 Built with MoE orchestration
