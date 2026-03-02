# Makefile for SMS Infrastructure Relay

.PHONY: help install dev test build docker-build docker-run k8s-deploy k8s-delete clean

help:
	@echo "SMS Infrastructure Relay - Makefile"
	@echo ""
	@echo "Available targets:"
	@echo "  install       - Install dependencies"
	@echo "  dev           - Run development server"
	@echo "  test          - Run tests"
	@echo "  lint          - Run linters"
	@echo "  format        - Format code"
	@echo "  build         - Build Docker image"
	@echo "  docker-run    - Run with Docker Compose"
	@echo "  k8s-deploy    - Deploy to Kubernetes"
	@echo "  k8s-delete    - Delete from Kubernetes"
	@echo "  k8s-logs      - View logs"
	@echo "  clean         - Clean up generated files"

install:
	python -m pip install -r requirements.txt

install-dev:
	python -m pip install -r requirements.txt
	python -m pip install pytest black ruff

dev:
	python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

test:
	pytest tests/ -v

lint:
	ruff check src/

format:
	black src/

build:
	docker build -t sms-relay:latest .

docker-build:
	docker build -t sms-relay:latest .

docker-run:
	docker-compose up -d

docker-stop:
	docker-compose down

docker-logs:
	docker-compose logs -f

k8s-deploy:
	kubectl apply -k k8s/

k8s-delete:
	kubectl delete -k k8s/

k8s-logs:
	kubectl logs -f deployment/sms-relay

k8s-status:
	@echo "Pods:"
	@kubectl get pods -l app=sms-relay
	@echo ""
	@echo "Service:"
	@kubectl get svc sms-relay
	@echo ""
	@echo "Ingress:"
	@kubectl get ingress sms-relay

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name "*.log" -delete
	rm -rf .pytest_cache/
	rm -rf htmlcov/
	rm -rf .coverage
	rm -rf dist/
	rm -rf build/
	rm -rf *.egg-info/
