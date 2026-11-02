#!/usr/bin/env python3
"""
HTTP wrapper for MCP stdio servers with proper MCP JSON-RPC support
Supports both MCP JSON-RPC format (POST /) and legacy endpoints
Requires Bearer token authentication for all tool execution endpoints
"""
import json
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
import os
import threading
import queue
import time
import secrets
import hmac
import hashlib

MCP_COMMAND = os.getenv('MCP_COMMAND', 'python main.py')
PORT = int(os.getenv('PORT', '3000'))
MCP_API_KEY = os.getenv('MCP_API_KEY', '')

# Validate that authentication is configured
if not MCP_API_KEY:
    print('[SECURITY-ERROR] MCP_API_KEY environment variable is required but not set', file=sys.stderr)
    print('[SECURITY-ERROR] The MCP HTTP wrapper will not start without authentication configured', file=sys.stderr)
    print('[SECURITY-ERROR] Set MCP_API_KEY to a secure random value (minimum 32 characters)', file=sys.stderr)
    sys.exit(1)

if len(MCP_API_KEY) < 32:
    print('[SECURITY-WARNING] MCP_API_KEY is too short (minimum 32 characters recommended)', file=sys.stderr)
    print('[SECURITY-WARNING] Current length: {} characters'.format(len(MCP_API_KEY)), file=sys.stderr)

class MCPStdioClient:
    """Manages communication with MCP stdio server"""
    def __init__(self):
        self.process = None
        self.message_id = 1
        self.pending_requests = {}
        self.lock = threading.Lock()
        self.started = False

    def start(self):
        """Start the MCP stdio process"""
        if self.started:
            return

        cmd = MCP_COMMAND.split()
        print(f'[MCP-STDIO] Starting: {" ".join(cmd)}', file=sys.stderr)

        self.process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        # Start reader thread
        self.reader_thread = threading.Thread(target=self._read_responses, daemon=True)
        self.reader_thread.start()

        # Start error reader thread
        self.error_thread = threading.Thread(target=self._read_errors, daemon=True)
        self.error_thread.start()

        self.started = True
        print(f'[MCP-STDIO] Process started, PID: {self.process.pid}', file=sys.stderr)

        # Give it a moment to start
        time.sleep(1)

        # Initialize the MCP server
        self._initialize()

    def _read_errors(self):
        """Read stderr from MCP process"""
        while True:
            try:
                line = self.process.stderr.readline()
                if not line:
                    break
                print(f'[MCP-STDERR] {line.rstrip()}', file=sys.stderr)
            except Exception as e:
                print(f'[MCP-STDERR-ERROR] {e}', file=sys.stderr)
                break

    def _read_responses(self):
        """Read responses from MCP server"""
        buffer = ''
        while True:
            try:
                char = self.process.stdout.read(1)
                if not char:
                    break

                buffer += char

                if char == '\n':
                    line = buffer.strip()
                    buffer = ''

                    if not line:
                        continue

                    try:
                        response = json.loads(line)
                        msg_id = response.get('id')
                        print(f'[MCP-RESPONSE] id={msg_id}, keys={list(response.keys())}', file=sys.stderr)

                        if msg_id and msg_id in self.pending_requests:
                            self.pending_requests[msg_id].put(response)
                    except json.JSONDecodeError as e:
                        print(f'[MCP-STDOUT] {line}', file=sys.stderr)
            except Exception as e:
                print(f'[MCP-READER-ERROR] {e}', file=sys.stderr)
                break

    def _initialize(self):
        """Initialize the MCP server"""
        with self.lock:
            msg_id = self.message_id
            self.message_id += 1

        response_queue = queue.Queue()
        self.pending_requests[msg_id] = response_queue

        request = {
            'jsonrpc': '2.0',
            'id': msg_id,
            'method': 'initialize',
            'params': {
                'protocolVersion': '2024-11-05',
                'capabilities': {},
                'clientInfo': {
                    'name': 'cortex-http-wrapper',
                    'version': '1.0.0'
                }
            }
        }

        try:
            request_json = json.dumps(request)
            print(f'[MCP-INIT] Sending initialize request', file=sys.stderr)
            self.process.stdin.write(request_json + '\n')
            self.process.stdin.flush()

            response = response_queue.get(timeout=10)
            del self.pending_requests[msg_id]

            if 'error' in response:
                print(f'[MCP-INIT-ERROR] {response["error"]}', file=sys.stderr)
                return False

            print(f'[MCP-INIT] Initialized successfully', file=sys.stderr)

            # Send initialized notification
            notification = {
                'jsonrpc': '2.0',
                'method': 'notifications/initialized'
            }
            self.process.stdin.write(json.dumps(notification) + '\n')
            self.process.stdin.flush()

            return True

        except queue.Empty:
            if msg_id in self.pending_requests:
                del self.pending_requests[msg_id]
            print(f'[MCP-INIT-ERROR] Timeout during initialization', file=sys.stderr)
            return False
        except Exception as e:
            if msg_id in self.pending_requests:
                del self.pending_requests[msg_id]
            print(f'[MCP-INIT-ERROR] {str(e)}', file=sys.stderr)
            return False

    def send_mcp_request(self, method, params=None, use_request_id=True):
        """
        Send a generic MCP JSON-RPC request and return the response

        Args:
            method: MCP method name (e.g., "tools/call", "tools/list")
            params: Optional parameters dict
            use_request_id: Whether to assign an ID (True for requests, False for notifications)

        Returns:
            Full MCP JSON-RPC response dict
        """
        msg_id = None
        if use_request_id:
            with self.lock:
                msg_id = self.message_id
                self.message_id += 1

        response_queue = queue.Queue() if msg_id else None
        if msg_id:
            self.pending_requests[msg_id] = response_queue

        request = {
            'jsonrpc': '2.0',
            'method': method
        }

        if msg_id is not None:
            request['id'] = msg_id

        if params is not None:
            request['params'] = params

        try:
            request_json = json.dumps(request)
            print(f'[MCP-REQUEST] {request_json}', file=sys.stderr)
            self.process.stdin.write(request_json + '\n')
            self.process.stdin.flush()

            if not use_request_id:
                # Notification - no response expected
                return {'jsonrpc': '2.0', 'result': None}

            # Wait for response
            response = response_queue.get(timeout=60)
            del self.pending_requests[msg_id]

            return response

        except queue.Empty:
            if msg_id and msg_id in self.pending_requests:
                del self.pending_requests[msg_id]
            return {
                'jsonrpc': '2.0',
                'id': msg_id,
                'error': {
                    'code': -32000,
                    'message': 'Request timeout'
                }
            }
        except Exception as e:
            if msg_id and msg_id in self.pending_requests:
                del self.pending_requests[msg_id]
            return {
                'jsonrpc': '2.0',
                'id': msg_id,
                'error': {
                    'code': -32603,
                    'message': f'Internal error: {str(e)}'
                }
            }

    def list_tools(self):
        """List available tools"""
        response = self.send_mcp_request('tools/list')

        if 'error' in response:
            return {'success': False, 'error': response['error']}

        tools = response.get('result', {}).get('tools', [])
        return {'success': True, 'tools': tools}

    def call_tool(self, tool_name, arguments):
        """Call an MCP tool"""
        response = self.send_mcp_request('tools/call', {
            'name': tool_name,
            'arguments': arguments
        })

        if 'error' in response:
            return {'success': False, 'error': str(response['error'])}

        result = response.get('result', {})
        content = result.get('content', [])

        # Extract text from content blocks
        text_parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get('type') == 'text':
                    text_parts.append(block.get('text', ''))
            elif isinstance(block, str):
                text_parts.append(block)

        output = '\n'.join(text_parts) if text_parts else json.dumps(result, indent=2)

        return {
            'success': True,
            'output': output
        }

# Global MCP client
mcp_client = MCPStdioClient()

class MCPHandler(BaseHTTPRequestHandler):
    def _verify_authentication(self):
        """
        Verify Bearer token authentication.
        Returns (authenticated: bool, error_response: dict or None)
        """
        auth_header = self.headers.get('Authorization', '')
        
        if not auth_header:
            return False, {
                'error': 'Authentication required',
                'message': 'Missing Authorization header. Use: Authorization: Bearer <token>'
            }
        
        # Parse Bearer token
        parts = auth_header.split(' ', 1)
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            return False, {
                'error': 'Invalid authentication format',
                'message': 'Authorization header must use Bearer token format: Authorization: Bearer <token>'
            }
        
        provided_token = parts[1]
        
        # Constant-time comparison to prevent timing attacks
        if not secrets.compare_digest(provided_token, MCP_API_KEY):
            # Log authentication failure
            print(f'[AUTH-FAILURE] Invalid token from {self.client_address[0]}', file=sys.stderr)
            return False, {
                'error': 'Authentication failed',
                'message': 'Invalid API key'
            }
        
        # Authentication successful
        return True, None

    def do_POST(self):
        # Authenticate all POST requests (tool execution endpoints)
        authenticated, auth_error = self._verify_authentication()
        if not authenticated:
            self.send_response(401)
            self.send_header('Content-Type', 'application/json')
            self.send_header('WWW-Authenticate', 'Bearer realm="MCP API"')
            self.end_headers()
            self.wfile.write(json.dumps(auth_error).encode())
            return

        # Read request body
        content_length = int(self.headers['Content-Length'])
        body = self.rfile.read(content_length)

        try:
            request_data = json.loads(body)
        except json.JSONDecodeError as e:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'jsonrpc': '2.0',
                'error': {
                    'code': -32700,
                    'message': 'Parse error: Invalid JSON'
                }
            }).encode())
            return

        # MCP JSON-RPC endpoint at root path
        if self.path == '/':
            print(f'[HTTP] MCP JSON-RPC request: {request_data}', file=sys.stderr)

            # Validate JSON-RPC format
            if request_data.get('jsonrpc') != '2.0':
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'jsonrpc': '2.0',
                    'error': {
                        'code': -32600,
                        'message': 'Invalid Request: jsonrpc must be "2.0"'
                    }
                }).encode())
                return

            method = request_data.get('method')
            params = request_data.get('params', {})
            request_id = request_data.get('id')

            # Route MCP methods
            if method == 'tools/list':
                response = mcp_client.send_mcp_request('tools/list')
            elif method == 'tools/call':
                tool_name = params.get('name')
                arguments = params.get('arguments', {})

                if not tool_name:
                    response = {
                        'jsonrpc': '2.0',
                        'id': request_id,
                        'error': {
                            'code': -32602,
                            'message': 'Invalid params: name required'
                        }
                    }
                else:
                    response = mcp_client.send_mcp_request('tools/call', {
                        'name': tool_name,
                        'arguments': arguments
                    })
            elif method == 'resources/list':
                response = mcp_client.send_mcp_request('resources/list')
            elif method == 'resources/read':
                response = mcp_client.send_mcp_request('resources/read', params)
            elif method == 'prompts/list':
                response = mcp_client.send_mcp_request('prompts/list')
            elif method == 'prompts/get':
                response = mcp_client.send_mcp_request('prompts/get', params)
            else:
                response = {
                    'jsonrpc': '2.0',
                    'id': request_id,
                    'error': {
                        'code': -32601,
                        'message': f'Method not found: {method}'
                    }
                }

            # Ensure response has the request ID
            if request_id is not None and 'id' not in response:
                response['id'] = request_id

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())

        elif self.path == '/call-tool':
            # Legacy endpoint: Call specific MCP tool with arguments
            try:
                tool_name = request_data.get('tool_name')
                arguments = request_data.get('arguments', {})

                if not tool_name:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'tool_name required'}).encode())
                    return

                print(f'[HTTP] Calling tool: {tool_name} with args: {arguments}', file=sys.stderr)

                # Call the specified tool
                result = mcp_client.call_tool(tool_name, arguments)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())

            except Exception as e:
                print(f'[HTTP-ERROR] {e}', file=sys.stderr)
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())

        elif self.path == '/query':
            # Legacy endpoint: Use first tool (for backward compat)
            try:
                query = request_data.get('query', '')
                print(f'[HTTP] Query: {query}', file=sys.stderr)

                # List tools first to find the right one
                tools_result = mcp_client.list_tools()
                if not tools_result.get('success'):
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'Failed to list tools'}).encode())
                    return

                tools = tools_result.get('tools', [])
                print(f'[HTTP] Available tools: {[t.get("name") for t in tools]}', file=sys.stderr)

                # Try to find the best tool for this query
                tool_name = None
                if tools:
                    # Use first tool by default
                    tool_name = tools[0].get('name')

                if not tool_name:
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'No tools available'}).encode())
                    return

                # Call the tool
                result = mcp_client.call_tool(tool_name, {'query': query})

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())

            except Exception as e:
                print(f'[HTTP-ERROR] {e}', file=sys.stderr)
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'status': 'healthy',
                'mcp_running': mcp_client.started and mcp_client.process and not mcp_client.process.poll()
            }).encode())
        elif self.path == '/list-tools':
            # Legacy endpoint: List available MCP tools
            try:
                result = mcp_client.list_tools()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
            except Exception as e:
                print(f'[HTTP-ERROR] {e}', file=sys.stderr)
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        sys.stdout.write(f"[HTTP] {format % args}\n")
        sys.stdout.flush()

if __name__ == '__main__':
    print(f'[Wrapper] Starting MCP stdio wrapper on port {PORT}')
    print(f'[Wrapper] MCP Command: {MCP_COMMAND}')
    print(f'[Wrapper] Authentication: ENABLED (Bearer token required)')
    print(f'[Wrapper] API Key length: {len(MCP_API_KEY)} characters')
    print(f'[Wrapper] Supported endpoints:')
    print(f'  POST /           - MCP JSON-RPC (tools/call, tools/list, resources/*, prompts/*) [AUTH REQUIRED]')
    print(f'  POST /call-tool  - Legacy tool call (tool_name, arguments) [AUTH REQUIRED]')
    print(f'  POST /query      - Legacy query (query) [AUTH REQUIRED]')
    print(f'  GET  /health     - Health check [NO AUTH]')
    print(f'  GET  /list-tools - List available tools [NO AUTH]')

    mcp_client.start()

    server = HTTPServer(('0.0.0.0', PORT), MCPHandler)
    print(f'[Wrapper] HTTP server ready')
    server.serve_forever()
