#!/usr/bin/env python3
"""
Claude Patterns MCP Server
Serves DDD/CQRS patterns from ~/projects/claude-patterns/patterns/

Usage:
    python server.py

MCP Protocol: https://modelcontextprotocol.io/
"""

import asyncio
import json
from pathlib import Path
from typing import Any

from mcp.server import Server
from mcp.types import (
    Resource,
    TextContent,
    Tool,
)


# Pattern repository location
PATTERNS_DIR = Path.home() / "projects" / "claude-patterns" / "patterns"


class PatternsServer:
    def __init__(self):
        self.server = Server("claude-patterns")
        self.setup_handlers()

    def setup_handlers(self):
        @self.server.list_resources()
        async def list_resources() -> list[Resource]:
            """List all available patterns."""
            resources = []

            for pattern_file in PATTERNS_DIR.rglob("*.md"):
                if pattern_file.name == "README.md":
                    continue

                relative_path = pattern_file.relative_to(PATTERNS_DIR)
                uri = f"pattern://{relative_path}"

                resources.append(
                    Resource(
                        uri=uri,
                        name=str(relative_path),
                        mimeType="text/markdown",
                        description=f"Pattern: {pattern_file.stem}",
                    )
                )

            return resources

        @self.server.read_resource()
        async def read_resource(uri: str) -> str:
            """Read pattern content by URI."""
            if not uri.startswith("pattern://"):
                raise ValueError(f"Invalid URI: {uri}")

            relative_path = uri.replace("pattern://", "")
            pattern_file = PATTERNS_DIR / relative_path

            if not pattern_file.exists():
                raise FileNotFoundError(f"Pattern not found: {relative_path}")

            return pattern_file.read_text(encoding="utf-8")

        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            """List available tools."""
            return [
                Tool(
                    name="search_patterns",
                    description="Search patterns by keyword or category",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search query (keyword or category)",
                            },
                            "category": {
                                "type": "string",
                                "enum": ["domain", "application", "architecture", "infrastructure", "testing", "cross-layer"],
                                "description": "Pattern category filter (optional)",
                            },
                        },
                        "required": ["query"],
                    },
                ),
                Tool(
                    name="get_pattern",
                    description="Get specific pattern by name",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Pattern name (e.g., 'aggregate-pattern', 'command-handler-pattern')",
                            },
                        },
                        "required": ["name"],
                    },
                ),
            ]

        @self.server.call_tool()
        async def call_tool(name: str, arguments: Any) -> list[TextContent]:
            """Execute tool."""
            if name == "search_patterns":
                return await self.search_patterns(arguments)
            elif name == "get_pattern":
                return await self.get_pattern(arguments)
            else:
                raise ValueError(f"Unknown tool: {name}")

    async def search_patterns(self, args: dict) -> list[TextContent]:
        """Search patterns by keyword or category."""
        query = args["query"].lower()
        category = args.get("category")

        results = []
        search_dir = PATTERNS_DIR / category if category else PATTERNS_DIR

        for pattern_file in search_dir.rglob("*.md"):
            if pattern_file.name == "README.md":
                continue

            content = pattern_file.read_text(encoding="utf-8")
            if query in content.lower() or query in pattern_file.stem.lower():
                relative_path = pattern_file.relative_to(PATTERNS_DIR)
                results.append(f"- {relative_path}: pattern://{relative_path}")

        if not results:
            return [TextContent(type="text", text=f"No patterns found for query: {query}")]

        return [TextContent(
            type="text",
            text=f"Found {len(results)} pattern(s):\n" + "\n".join(results)
        )]

    async def get_pattern(self, args: dict) -> list[TextContent]:
        """Get specific pattern by name."""
        name = args["name"]
        if not name.endswith(".md"):
            name += ".md"

        # Search all categories
        for pattern_file in PATTERNS_DIR.rglob(name):
            if pattern_file.name == "README.md":
                continue

            content = pattern_file.read_text(encoding="utf-8")
            relative_path = pattern_file.relative_to(PATTERNS_DIR)

            return [TextContent(
                type="text",
                text=f"Pattern: {relative_path}\n\n{content}"
            )]

        return [TextContent(
            type="text",
            text=f"Pattern not found: {name}\n\nAvailable patterns:\n" +
                 "\n".join([f"- {p.relative_to(PATTERNS_DIR)}" for p in PATTERNS_DIR.rglob("*.md") if p.name != "README.md"])
        )]

    async def run(self):
        """Run the MCP server."""
        from mcp.server.stdio import stdio_server

        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                self.server.create_initialization_options(),
            )


async def main():
    server = PatternsServer()
    await server.run()


if __name__ == "__main__":
    asyncio.run(main())
