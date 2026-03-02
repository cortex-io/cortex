# YouTube Ingestion Service - Quick Start

## 🚀 Deploy in 3 Steps

### 1. Prerequisites Check
```bash
# Verify k3s is running
kubectl get nodes

# Verify Redis is deployed
kubectl get svc -n cortex | grep redis

# Create Anthropic API key secret
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=YOUR_ANTHROPIC_API_KEY \
  -n cortex
```

### 2. Deploy
```bash
cd /Users/ryandahlberg/Projects/cortex/k3s-deployments/youtube-ingestion
./scripts/build-and-deploy.sh
```

### 3. Test
```bash
# Port forward
kubectl port-forward -n cortex svc/youtube-ingestion 8080:8080 &

# Test ingestion
curl -X POST http://localhost:8080/ingest \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## 📖 Full Documentation
- [README.md](README.md) - Complete documentation
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Project overview
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture
- [docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md) - Integration examples

## 🎯 What It Does

1. **Detects** YouTube URLs automatically in messages
2. **Extracts** transcripts with timestamps
3. **Classifies** content using Claude AI
4. **Stores** knowledge in searchable database
5. **Analyzes** for self-improvement opportunities
6. **Reviews** patterns across multiple videos

## 🔌 Key Endpoints

```bash
# Health check
curl http://localhost:8080/health

# Ingest video
curl -X POST http://localhost:8080/ingest -d '{"url": "YOUTUBE_URL"}'

# Search knowledge
curl -X POST http://localhost:8080/search -d '{"category": "tutorial"}'

# Get stats
curl http://localhost:8080/stats

# List videos
curl http://localhost:8080/videos?limit=10
```

## ✅ Success Indicators

After deployment, you should see:
```
[Redis] Connected successfully
[KnowledgeStore] Storage initialized
[Server] YouTube Ingestion Service listening on port 8080
```

## 🆘 Troubleshooting

**Pod not starting?**
```bash
kubectl describe pod -n cortex -l app=youtube-ingestion
kubectl logs -n cortex -l app=youtube-ingestion
```

**Redis connection failed?**
- Service falls back to filesystem-only mode
- Check Redis: `kubectl get pods -n cortex | grep redis`

**Transcript extraction fails?**
- Verify video has captions
- Try different video
- Check logs for rate limiting

## 📞 Support

1. Check [DEPLOYMENT.md](DEPLOYMENT.md) troubleshooting section
2. Review logs: `kubectl logs -n cortex -l app=youtube-ingestion`
3. Run tests: `./scripts/test-service.sh`

---

**Built by Larry - Ready for Production 🎉**
