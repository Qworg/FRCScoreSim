"""HTTP server for serving static files."""

from __future__ import annotations
import os
from pathlib import Path
from aiohttp import web


class HTTPServer:
    """HTTP server for serving static files from public/ directory."""

    def __init__(self, port: int = 3000, public_dir: str | Path | None = None):
        self.port = port
        self.public_dir = Path(public_dir) if public_dir else self._find_public_dir()
        self.app: web.Application | None = None
        self.runner: web.AppRunner | None = None
        self.site: web.TCPSite | None = None

    def _find_public_dir(self) -> Path:
        """Find the public directory relative to the project root."""
        # Start from the current file and go up to find the project root
        current = Path(__file__).resolve()

        # Go up to find FRCScoreSim root
        for _ in range(10):
            current = current.parent
            public = current / "public"
            if public.exists():
                return public

        # Fallback to working directory
        return Path.cwd() / "public"

    async def start(self) -> None:
        """Start the HTTP server."""
        self.app = web.Application()

        # Add routes
        self.app.router.add_get("/", self._serve_index)
        self.app.router.add_static("/", self.public_dir, show_index=True)

        self.runner = web.AppRunner(self.app)
        await self.runner.setup()

        self.site = web.TCPSite(self.runner, "localhost", self.port)
        await self.site.start()

        print(f"HTTP server listening on http://localhost:{self.port}")
        print(f"Serving files from: {self.public_dir}")

    async def stop(self) -> None:
        """Stop the HTTP server."""
        if self.runner:
            await self.runner.cleanup()
            self.runner = None
        self.app = None
        self.site = None

    async def _serve_index(self, request: web.Request) -> web.FileResponse:
        """Serve the index.html file."""
        index_path = self.public_dir / "index.html"
        if index_path.exists():
            return web.FileResponse(index_path)
        raise web.HTTPNotFound()

    @property
    def is_running(self) -> bool:
        """Check if server is running."""
        return self.site is not None
