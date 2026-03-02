from fastapi import FastAPI
from pydantic import BaseModel
from llama_cpp import Llama
import math
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

MODEL_PATH = os.getenv("MODEL_PATH", "/models/model.gguf")
ROUTES = ["unifi", "proxmox", "grafana", "elastic", "k3s", "netdata", "cortex"]

logger.info(f"Loading model from: {MODEL_PATH}")

try:
    llm = Llama(
        model_path=MODEL_PATH,
        n_ctx=512,
        n_threads=int(os.getenv("THREADS", "4")),
        n_batch=32,
        verbose=False
    )
    logger.info("Model loaded successfully")
except Exception as e:
    logger.error(f"Failed to load model: {e}")
    llm = None

PROMPT_TEMPLATE = """You are a router. Respond with ONLY the route name, nothing else.

Routes:
- unifi: network devices, APs, clients, firewall, VLANs, switches, wireless, WiFi, ubiquiti
- proxmox: VMs, containers, nodes, storage, clusters, virtualization, LXC, hypervisor
- grafana: dashboards, metrics, alerts, visualization, graphs, panels, prometheus
- elastic: logs, indices, search, observability, kibana, elasticsearch, ELK
- k3s: kubernetes, pods, deployments, services, ingress, helm, kubectl, containers
- netdata: system metrics, CPU, memory, disk, real-time monitoring, performance
- cortex: complex multi-step tasks, ambiguous requests, general questions, multiple systems

User request: {input}

Route:"""


class ClassifyRequest(BaseModel):
    text: str


class ClassifyResponse(BaseModel):
    route: str
    confidence: float


@app.post("/classify", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest):
    if llm is None:
        return ClassifyResponse(route="cortex", confidence=0.0)

    prompt = PROMPT_TEMPLATE.format(input=req.text)

    try:
        output = llm(
            prompt,
            max_tokens=10,
            stop=["\n", " ", ".", ","],
            logprobs=True,
            echo=False
        )

        raw_route = output["choices"][0]["text"].strip().lower()

        # Match route
        route = "cortex"
        for r in ROUTES:
            if r in raw_route:
                route = r
                break

        # Calculate confidence from logprobs
        logprobs = output["choices"][0].get("logprobs", {})
        token_logprobs = logprobs.get("token_logprobs", [])

        if token_logprobs and token_logprobs[0] is not None:
            confidence = math.exp(token_logprobs[0])
        else:
            confidence = 0.5

        logger.info(f"Classified '{req.text[:50]}...' -> {route} (confidence: {confidence:.2f})")

        return ClassifyResponse(route=route, confidence=min(confidence, 1.0))

    except Exception as e:
        logger.error(f"Classification error: {e}")
        return ClassifyResponse(route="cortex", confidence=0.0)


@app.get("/health")
async def health():
    return {
        "status": "healthy" if llm is not None else "degraded",
        "model": MODEL_PATH,
        "model_loaded": llm is not None
    }
