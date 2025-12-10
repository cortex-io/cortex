# Makefile for Cortex Kubernetes Deployment
# Usage: make [target]

.PHONY: help build push deploy delete status logs shell clean test validate

# Variables
NAMESPACE ?= cortex
IMAGE_REPO ?= ghcr.io/ry-ops/cortex
IMAGE_TAG ?= 2.0.0
KUBECTL ?= kubectl
KUSTOMIZE ?= kubectl kustomize

# Colors for output
GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
NC     := \033[0m # No Color

##@ General

help: ## Display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make $(GREEN)<target>$(NC)\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Build and Push

build: ## Build Docker image
	@echo "$(GREEN)Building Docker image...$(NC)"
	cd ../.. && docker build -t $(IMAGE_REPO):$(IMAGE_TAG) \
		-f lib/coordination/deployment/Dockerfile .
	docker tag $(IMAGE_REPO):$(IMAGE_TAG) $(IMAGE_REPO):latest
	@echo "$(GREEN)Build complete!$(NC)"

push: ## Push Docker image to registry
	@echo "$(GREEN)Pushing Docker image...$(NC)"
	docker push $(IMAGE_REPO):$(IMAGE_TAG)
	docker push $(IMAGE_REPO):latest
	@echo "$(GREEN)Push complete!$(NC)"

build-push: build push ## Build and push Docker image

##@ Deployment

validate: ## Validate Kubernetes manifests
	@echo "$(GREEN)Validating manifests...$(NC)"
	$(KUSTOMIZE) . | $(KUBECTL) apply --dry-run=client -f -
	@echo "$(GREEN)Validation complete!$(NC)"

deploy: ## Deploy to Kubernetes cluster
	@echo "$(GREEN)Deploying Cortex to Kubernetes...$(NC)"
	$(KUBECTL) apply -f namespace.yaml
	$(KUBECTL) apply -f rbac.yaml
	$(KUBECTL) apply -f configmap.yaml
	@if [ ! "$$($(KUBECTL) get secret cortex-secrets -n $(NAMESPACE) 2>/dev/null)" ]; then \
		echo "$(YELLOW)Warning: cortex-secrets not found. Create manually!$(NC)"; \
	fi
	$(KUBECTL) apply -f pvc.yaml
	$(KUBECTL) apply -f deployment.yaml
	$(KUBECTL) apply -f service.yaml
	$(KUBECTL) apply -f pdb.yaml
	$(KUBECTL) apply -f hpa.yaml
	$(KUBECTL) apply -f ingress.yaml
	@echo "$(GREEN)Deployment complete!$(NC)"
	@echo "$(YELLOW)Waiting for pods to be ready...$(NC)"
	$(KUBECTL) wait --for=condition=ready pod -l app.kubernetes.io/name=cortex -n $(NAMESPACE) --timeout=300s

deploy-kustomize: ## Deploy using Kustomize
	@echo "$(GREEN)Deploying with Kustomize...$(NC)"
	$(KUBECTL) apply -k .
	@echo "$(GREEN)Deployment complete!$(NC)"

delete: ## Delete deployment from cluster
	@echo "$(RED)Deleting Cortex deployment...$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		$(KUBECTL) delete -k . || true; \
		echo "$(GREEN)Deletion complete!$(NC)"; \
	else \
		echo "$(YELLOW)Cancelled.$(NC)"; \
	fi

##@ Operations

status: ## Show deployment status
	@echo "$(GREEN)Deployment Status:$(NC)"
	@echo "\n$(YELLOW)Namespace:$(NC)"
	$(KUBECTL) get namespace $(NAMESPACE)
	@echo "\n$(YELLOW)Pods:$(NC)"
	$(KUBECTL) get pods -n $(NAMESPACE) -o wide
	@echo "\n$(YELLOW)Services:$(NC)"
	$(KUBECTL) get svc -n $(NAMESPACE)
	@echo "\n$(YELLOW)Ingress:$(NC)"
	$(KUBECTL) get ingress -n $(NAMESPACE)
	@echo "\n$(YELLOW)PVC:$(NC)"
	$(KUBECTL) get pvc -n $(NAMESPACE)
	@echo "\n$(YELLOW)HPA:$(NC)"
	$(KUBECTL) get hpa -n $(NAMESPACE)
	@echo "\n$(YELLOW)PDB:$(NC)"
	$(KUBECTL) get pdb -n $(NAMESPACE)

logs: ## Show logs from all pods
	@echo "$(GREEN)Fetching logs...$(NC)"
	$(KUBECTL) logs -n $(NAMESPACE) -l app.kubernetes.io/name=cortex --tail=100 -f

logs-pod: ## Show logs from specific pod (usage: make logs-pod POD=cortex-xxx)
	@if [ -z "$(POD)" ]; then \
		echo "$(RED)Error: POD variable required$(NC)"; \
		echo "Usage: make logs-pod POD=cortex-xxx"; \
		exit 1; \
	fi
	$(KUBECTL) logs -n $(NAMESPACE) $(POD) -f

shell: ## Get shell in a pod (usage: make shell POD=cortex-xxx)
	@if [ -z "$(POD)" ]; then \
		POD=$$($(KUBECTL) get pods -n $(NAMESPACE) -l app.kubernetes.io/name=cortex -o jsonpath='{.items[0].metadata.name}'); \
	fi; \
	echo "$(GREEN)Opening shell in pod: $$POD$(NC)"; \
	$(KUBECTL) exec -it -n $(NAMESPACE) $$POD -- /bin/sh

port-forward: ## Port forward to cortex service
	@echo "$(GREEN)Port forwarding to cortex service...$(NC)"
	@echo "Access at:"
	@echo "  HTTP:      http://localhost:9500"
	@echo "  WebSocket: ws://localhost:9501"
	@echo "  Dashboard: http://localhost:3004"
	$(KUBECTL) port-forward -n $(NAMESPACE) svc/cortex 9500:9500 9501:9501 3004:3004

restart: ## Restart deployment
	@echo "$(GREEN)Restarting deployment...$(NC)"
	$(KUBECTL) rollout restart deployment cortex -n $(NAMESPACE)
	$(KUBECTL) rollout status deployment cortex -n $(NAMESPACE)

scale: ## Scale deployment (usage: make scale REPLICAS=5)
	@if [ -z "$(REPLICAS)" ]; then \
		echo "$(RED)Error: REPLICAS variable required$(NC)"; \
		echo "Usage: make scale REPLICAS=5"; \
		exit 1; \
	fi
	@echo "$(GREEN)Scaling to $(REPLICAS) replicas...$(NC)"
	$(KUBECTL) scale deployment cortex -n $(NAMESPACE) --replicas=$(REPLICAS)
	$(KUBECTL) rollout status deployment cortex -n $(NAMESPACE)

##@ Secrets

create-secrets: ## Create secrets interactively
	@echo "$(GREEN)Creating secrets...$(NC)"
	@read -p "Enter Anthropic API key: " anthropic_key; \
	api_key=$$(openssl rand -base64 32); \
	$(KUBECTL) create secret generic cortex-secrets \
		--from-literal=anthropic-api-key="$$anthropic_key" \
		--from-literal=api-key="$$api_key" \
		--namespace=$(NAMESPACE) \
		--dry-run=client -o yaml | $(KUBECTL) apply -f -
	@echo "$(GREEN)Secrets created successfully!$(NC)"
	@echo "$(YELLOW)Generated API key: [stored in secret]$(NC)"

update-secret: ## Update a specific secret (usage: make update-secret KEY=anthropic-api-key VALUE=xxx)
	@if [ -z "$(KEY)" ] || [ -z "$(VALUE)" ]; then \
		echo "$(RED)Error: KEY and VALUE variables required$(NC)"; \
		echo "Usage: make update-secret KEY=anthropic-api-key VALUE=xxx"; \
		exit 1; \
	fi
	@echo "$(GREEN)Updating secret...$(NC)"
	$(KUBECTL) patch secret cortex-secrets -n $(NAMESPACE) \
		--type='json' -p='[{"op": "replace", "path": "/data/$(KEY)", "value": "'$$(echo -n "$(VALUE)" | base64)'"}]'
	@echo "$(GREEN)Secret updated! Restart deployment to apply.$(NC)"

##@ Troubleshooting

describe: ## Describe all resources
	@echo "$(GREEN)Describing resources...$(NC)"
	$(KUBECTL) describe all -n $(NAMESPACE)

events: ## Show recent events
	@echo "$(GREEN)Recent events:$(NC)"
	$(KUBECTL) get events -n $(NAMESPACE) --sort-by='.lastTimestamp' | tail -20

debug: ## Run debug pod
	@echo "$(GREEN)Starting debug pod...$(NC)"
	$(KUBECTL) run debug -n $(NAMESPACE) --image=busybox --rm -it --restart=Never -- sh

test-health: ## Test health endpoint
	@POD=$$($(KUBECTL) get pods -n $(NAMESPACE) -l app.kubernetes.io/name=cortex -o jsonpath='{.items[0].metadata.name}'); \
	echo "$(GREEN)Testing health endpoint on pod: $$POD$(NC)"; \
	$(KUBECTL) exec -n $(NAMESPACE) $$POD -- wget -qO- http://localhost:9500/health

test-connectivity: ## Test service connectivity
	@echo "$(GREEN)Testing service connectivity...$(NC)"
	$(KUBECTL) run test-connectivity -n $(NAMESPACE) --image=busybox --rm -it --restart=Never -- \
		wget -qO- http://cortex.cortex.svc.cluster.local:9500/health

##@ Backup and Restore

backup: ## Backup PVC data
	@echo "$(GREEN)Creating backup...$(NC)"
	@TIMESTAMP=$$(date +%Y%m%d-%H%M%S); \
	$(KUBECTL) run backup-$$TIMESTAMP -n $(NAMESPACE) --image=busybox \
		--overrides='{"spec":{"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"cortex-data"}}],"containers":[{"name":"backup","image":"busybox","command":["sleep","3600"],"volumeMounts":[{"name":"data","mountPath":"/data"}]}]}}'; \
	$(KUBECTL) wait --for=condition=ready pod backup-$$TIMESTAMP -n $(NAMESPACE) --timeout=60s; \
	mkdir -p backups; \
	$(KUBECTL) cp $(NAMESPACE)/backup-$$TIMESTAMP:/data ./backups/cortex-backup-$$TIMESTAMP; \
	$(KUBECTL) delete pod backup-$$TIMESTAMP -n $(NAMESPACE); \
	echo "$(GREEN)Backup saved to: ./backups/cortex-backup-$$TIMESTAMP$(NC)"

restore: ## Restore PVC data (usage: make restore BACKUP=backups/cortex-backup-xxx)
	@if [ -z "$(BACKUP)" ]; then \
		echo "$(RED)Error: BACKUP variable required$(NC)"; \
		echo "Usage: make restore BACKUP=backups/cortex-backup-20231201-120000"; \
		exit 1; \
	fi
	@echo "$(GREEN)Restoring from backup: $(BACKUP)$(NC)"
	@$(KUBECTL) run restore-$$(date +%s) -n $(NAMESPACE) --image=busybox \
		--overrides='{"spec":{"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"cortex-data"}}],"containers":[{"name":"restore","image":"busybox","command":["sleep","3600"],"volumeMounts":[{"name":"data","mountPath":"/data"}]}]}}'; \
	POD=restore-$$(date +%s); \
	$(KUBECTL) wait --for=condition=ready pod $$POD -n $(NAMESPACE) --timeout=60s; \
	$(KUBECTL) cp $(BACKUP) $(NAMESPACE)/$$POD:/data; \
	$(KUBECTL) delete pod $$POD -n $(NAMESPACE); \
	echo "$(GREEN)Restore complete!$(NC)"

##@ Maintenance

clean: ## Clean up completed pods and jobs
	@echo "$(GREEN)Cleaning up...$(NC)"
	$(KUBECTL) delete pods -n $(NAMESPACE) --field-selector status.phase=Succeeded
	$(KUBECTL) delete pods -n $(NAMESPACE) --field-selector status.phase=Failed
	@echo "$(GREEN)Cleanup complete!$(NC)"

update-image: ## Update image tag (usage: make update-image TAG=2.1.0)
	@if [ -z "$(TAG)" ]; then \
		echo "$(RED)Error: TAG variable required$(NC)"; \
		echo "Usage: make update-image TAG=2.1.0"; \
		exit 1; \
	fi
	@echo "$(GREEN)Updating image to $(IMAGE_REPO):$(TAG)$(NC)"
	$(KUBECTL) set image deployment/cortex cortex=$(IMAGE_REPO):$(TAG) -n $(NAMESPACE)
	$(KUBECTL) rollout status deployment cortex -n $(NAMESPACE)

rollback: ## Rollback to previous version
	@echo "$(YELLOW)Rolling back deployment...$(NC)"
	$(KUBECTL) rollout undo deployment cortex -n $(NAMESPACE)
	$(KUBECTL) rollout status deployment cortex -n $(NAMESPACE)
	@echo "$(GREEN)Rollback complete!$(NC)"

history: ## Show rollout history
	@echo "$(GREEN)Rollout history:$(NC)"
	$(KUBECTL) rollout history deployment cortex -n $(NAMESPACE)

##@ Monitoring

metrics: ## Show HPA metrics
	@echo "$(GREEN)HPA Metrics:$(NC)"
	$(KUBECTL) get hpa cortex -n $(NAMESPACE) --watch

top: ## Show resource usage
	@echo "$(GREEN)Resource Usage:$(NC)"
	@echo "\n$(YELLOW)Pods:$(NC)"
	$(KUBECTL) top pods -n $(NAMESPACE)
	@echo "\n$(YELLOW)Nodes:$(NC)"
	$(KUBECTL) top nodes

##@ Development

dev-setup: ## Setup development environment
	@echo "$(GREEN)Setting up development environment...$(NC)"
	$(KUBECTL) apply -f namespace.yaml
	@echo "$(YELLOW)Create secrets manually with: make create-secrets$(NC)"

dev-deploy: create-secrets deploy ## Full development deployment

test: validate ## Run tests
	@echo "$(GREEN)Running tests...$(NC)"
	@echo "$(YELLOW)Validating manifests...$(NC)"
	$(KUSTOMIZE) . | $(KUBECTL) apply --dry-run=client -f -
	@echo "$(GREEN)Tests passed!$(NC)"

.DEFAULT_GOAL := help
