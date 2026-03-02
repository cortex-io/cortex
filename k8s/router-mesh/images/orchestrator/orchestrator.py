from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
import httpx
import redis.asyncio as redis
import hashlib
import json
import os
import time
import logging
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Prometheus Metrics
route_counter = Counter("router_decisions_total", "Total routing decisions", ["route", "layer"])
latency_hist = Histogram("router_latency_seconds", "Routing latency", ["layer"])
cache_hits = Counter("router_cache_hits_total", "Cache hits")
cache_misses = Counter("router_cache_misses_total", "Cache misses")
errors_counter = Counter("router_errors_total", "Total errors", ["type"])
active_requests = Gauge("router_active_requests", "Active routing requests")

# LLM-D inspired metrics
prefill_latency = Histogram("router_prefill_latency_seconds", "L1 model latency (prefill phase)")
decode_latency = Histogram("router_decode_latency_seconds", "L2 model latency (decode phase)")
ttft_hist = Histogram("router_ttft_seconds", "Time to first token (route decision)")
endpoint_load = Gauge("router_endpoint_load", "Current load on MCP endpoints", ["endpoint"])

# Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://redis.cortex-system.svc.cluster.local:6379/2")
L1_URL = os.getenv("L1_URL", "http://localhost:8081/classify")
L2_URL = os.getenv("L2_URL", "http://localhost:8082/classify")
CORTEX_URL = os.getenv("CORTEX_URL", "http://relay-core.cortex.svc:8000")
L1_CONFIDENCE = float(os.getenv("L1_CONFIDENCE", "0.85"))
L2_CONFIDENCE = float(os.getenv("L2_CONFIDENCE", "0.75"))
CACHE_TTL = int(os.getenv("CACHE_TTL", "3600"))

ROUTES = {
    "unifi": os.getenv("UNIFI_URL", "http://unifi-mcp.mcp-servers.svc:8000"),
    "proxmox": os.getenv("PROXMOX_URL", "http://proxmox-mcp.mcp-servers.svc:8000"),
    "grafana": os.getenv("GRAFANA_URL", "http://grafana-mcp.mcp-servers.svc:8000"),
    "elastic": os.getenv("ELASTIC_URL", "http://elastic-mcp.mcp-servers.svc:8000"),
    "k3s": os.getenv("K3S_URL", "http://k3s-mcp.mcp-servers.svc:8000"),
    "netdata": os.getenv("NETDATA_URL", "http://netdata-mcp.mcp-servers.svc:8000"),
    "cortex": CORTEX_URL,
}

redis_client: redis.Redis = None
http_client: httpx.AsyncClient = None


class RouteRequest(BaseModel):
    message: str
    context: dict | None = None


class RouteResponse(BaseModel):
    route: str
    route_url: str
    confidence: float
    layer: str
    latency_ms: float
    cached: bool = False
    ttft_ms: float | None = None  # Time to first token (route decision)


@app.on_event("startup")
async def startup():
    global redis_client, http_client
    logger.info(f"Connecting to Redis: {REDIS_URL}")
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    http_client = httpx.AsyncClient(timeout=10.0)
    logger.info("Orchestrator started successfully")


@app.on_event("shutdown")
async def shutdown():
    await redis_client.close()
    await http_client.aclose()


@app.post("/route", response_model=RouteResponse)
async def route_request(req: RouteRequest, background_tasks: BackgroundTasks):
    """
    Intelligent routing inspired by LLM-D architecture:
    - Prefill phase (L1): Fast classification with SmolLM
    - Decode phase (L2): Smarter classification with Qwen if needed
    - KV cache sharing: Redis caching for similar requests
    - Endpoint picking: Route to appropriate MCP server based on classification
    """
    start = time.perf_counter()
    active_requests.inc()

    try:
        # KV Cache sharing (Redis)
        cache_key = f"route:{hashlib.sha256(req.message.encode()).hexdigest()[:16]}"
        try:
            cached = await redis_client.get(cache_key)
            if cached:
                cache_hits.inc()
                data = json.loads(cached)
                data["cached"] = True
                data["latency_ms"] = (time.perf_counter() - start) * 1000
                logger.info(f"Cache hit for: {req.message[:50]}...")
                return RouteResponse(**data)
            cache_misses.inc()
        except Exception as e:
            logger.warning(f"Cache read error: {e}")
            errors_counter.labels(type="cache_read").inc()

        # Prefill Phase: L1 (SmolLM) - Fast model for simple routing
        ttft_start = time.perf_counter()
        try:
            with prefill_latency.time():
                l1_result = await http_client.post(L1_URL, json={"text": req.message})
                l1_data = l1_result.json()

            ttft = (time.perf_counter() - ttft_start) * 1000
            ttft_hist.observe(ttft / 1000)

            if l1_data["confidence"] >= L1_CONFIDENCE:
                result = RouteResponse(
                    route=l1_data["route"],
                    route_url=ROUTES.get(l1_data["route"], CORTEX_URL),
                    confidence=l1_data["confidence"],
                    layer="L1",
                    latency_ms=(time.perf_counter() - start) * 1000,
                    ttft_ms=ttft
                )
                route_counter.labels(route=result.route, layer="L1").inc()
                endpoint_load.labels(endpoint=result.route).inc()
                background_tasks.add_task(cache_result, cache_key, result)
                logger.info(f"L1 routed: {req.message[:50]}... -> {result.route} ({result.confidence:.2f})")
                return result
        except Exception as e:
            logger.error(f"L1 inference error: {e}")
            errors_counter.labels(type="l1_inference").inc()

        # Decode Phase: L2 (Qwen) - Smarter model for complex routing
        try:
            with decode_latency.time():
                l2_result = await http_client.post(L2_URL, json={"text": req.message})
                l2_data = l2_result.json()

            if l2_data["confidence"] >= L2_CONFIDENCE:
                result = RouteResponse(
                    route=l2_data["route"],
                    route_url=ROUTES.get(l2_data["route"], CORTEX_URL),
                    confidence=l2_data["confidence"],
                    layer="L2",
                    latency_ms=(time.perf_counter() - start) * 1000,
                    ttft_ms=(time.perf_counter() - ttft_start) * 1000
                )
                route_counter.labels(route=result.route, layer="L2").inc()
                endpoint_load.labels(endpoint=result.route).inc()
                background_tasks.add_task(cache_result, cache_key, result)
                logger.info(f"L2 routed: {req.message[:50]}... -> {result.route} ({result.confidence:.2f})")
                return result
        except Exception as e:
            logger.error(f"L2 inference error: {e}")
            errors_counter.labels(type="l2_inference").inc()
            l2_data = {"confidence": 0.0}

        # Escalation: Route to Cortex for complex multi-step tasks
        result = RouteResponse(
            route="cortex",
            route_url=CORTEX_URL,
            confidence=l2_data.get("confidence", 0.0),
            layer="escalated",
            latency_ms=(time.perf_counter() - start) * 1000,
            ttft_ms=(time.perf_counter() - ttft_start) * 1000
        )
        route_counter.labels(route="cortex", layer="escalated").inc()
        endpoint_load.labels(endpoint="cortex").inc()
        logger.info(f"Escalated: {req.message[:50]}... -> cortex (low confidence)")
        return result

    finally:
        active_requests.dec()


async def cache_result(key: str, result: RouteResponse):
    """Cache routing decision for similar future requests"""
    try:
        data = result.model_dump()
        data.pop("cached", None)
        data.pop("latency_ms", None)
        data.pop("ttft_ms", None)
        await redis_client.setex(key, CACHE_TTL, json.dumps(data))
    except Exception as e:
        logger.warning(f"Cache write error: {e}")
        errors_counter.labels(type="cache_write").inc()


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/health")
async def health():
    """Health check endpoint"""
    try:
        await redis_client.ping()
        redis_status = "connected"
    except:
        redis_status = "disconnected"

    return {
        "status": "healthy",
        "redis": redis_status,
        "l1_url": L1_URL,
        "l2_url": L2_URL,
        "routes": len(ROUTES)
    }


@app.get("/routes")
async def list_routes():
    """List all available routes and endpoints"""
    return ROUTES


@app.get("/stats")
async def stats():
    """Current routing statistics"""
    return {
        "cache_hit_rate": cache_hits._value.get() / max(cache_hits._value.get() + cache_misses._value.get(), 1),
        "total_requests": sum(route_counter.labels(route=r, layer=l)._value.get()
                             for r in ROUTES.keys() for l in ["L1", "L2", "escalated"]),
        "active_requests": active_requests._value.get()
    }
