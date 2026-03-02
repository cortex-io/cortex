.PHONY: help install install-dev test lint format clean

help:
	@echo "Available commands:"
	@echo "  make install       - Install package dependencies"
	@echo "  make install-dev   - Install package with dev dependencies"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run linting checks"
	@echo "  make format       - Format code with black"
	@echo "  make clean        - Clean build artifacts"

install:
	pip install -r requirements.txt

install-dev:
	pip install -e ".[dev]"

test:
	pytest tests/ -v

lint:
	flake8 src/ tests/
	mypy src/

format:
	black src/ tests/

clean:
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -rf .pytest_cache
	rm -rf .mypy_cache
