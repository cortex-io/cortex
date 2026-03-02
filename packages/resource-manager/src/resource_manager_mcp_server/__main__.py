"""
Entry point for running the Resource Manager MCP Server
"""

import asyncio
import sys
import os

# Add parent directory to path to import server module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from src.server import main

if __name__ == "__main__":
    asyncio.run(main())
