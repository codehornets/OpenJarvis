"""MCP (Model Context Protocol) layer for Handymate."""

from handymate.mcp.client import MCPClient
from handymate.mcp.protocol import MCPError, MCPNotification, MCPRequest, MCPResponse
from handymate.mcp.server import MCPServer
from handymate.mcp.transport import (
    InProcessTransport,
    MCPTransport,
    SSETransport,
    StdioTransport,
    StreamableHTTPTransport,
)

__all__ = [
    "MCPClient",
    "MCPError",
    "MCPNotification",
    "MCPRequest",
    "MCPResponse",
    "MCPServer",
    "MCPTransport",
    "InProcessTransport",
    "SSETransport",
    "StdioTransport",
    "StreamableHTTPTransport",
]
