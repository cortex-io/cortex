#!/bin/bash
# Development environment setup script

set -e

echo "Setting up SMS Infrastructure Relay development environment..."

# Check Python version
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required"
    exit 1
fi

# Create virtual environment
echo "Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo ""
    echo "WARNING: Please edit .env with your actual credentials!"
    echo ""
fi

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your credentials"
echo "2. Run: source venv/bin/activate"
echo "3. Run: make dev"
echo "4. In another terminal, run: ngrok http 8000"
echo "5. Configure Twilio webhook with ngrok URL"
echo ""
