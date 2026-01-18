"""WebSocket server for broadcasting simulation state."""

from __future__ import annotations
import asyncio
from typing import Optional, Callable, TYPE_CHECKING
import msgspec
import websockets
from websockets.server import WebSocketServerProtocol

if TYPE_CHECKING:
    from ..simulation.engine import SimulationEngine

from ..types.schemas import GameState, WSMessage, ConfigMessage


class WebSocketServer:
    """WebSocket server for broadcasting simulation state to browser clients."""

    def __init__(self, port: int = 8080):
        self.port = port
        self.clients: set[WebSocketServerProtocol] = set()
        self.engine: Optional[SimulationEngine] = None
        self.server: Optional[websockets.WebSocketServer] = None
        self.control_handler: Optional[Callable[[str], None]] = None
        self._encoder = msgspec.json.Encoder()
        self._decoder = msgspec.json.Decoder()

    def on_control(self, handler: Callable[[str], None]) -> None:
        """Set a handler for control commands (play, pause, step, reset)."""
        self.control_handler = handler

    def attach_engine(self, engine: SimulationEngine) -> None:
        """Attach to a simulation engine."""
        self.engine = engine

    async def start(self) -> None:
        """Start the WebSocket server."""
        self.server = await websockets.serve(
            self._handle_connection,
            "localhost",
            self.port,
        )
        print(f"WebSocket server listening on port {self.port}")

    async def stop(self) -> None:
        """Stop the WebSocket server."""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None
        self.clients.clear()

    async def _handle_connection(self, websocket: WebSocketServerProtocol) -> None:
        """Handle a new WebSocket connection."""
        self.clients.add(websocket)
        print(f"Client connected. Total clients: {len(self.clients)}")

        try:
            # Send current config if engine is attached
            if self.engine:
                await self._send_config(websocket)
                state = self.engine.get_state()
                await self._send_state(websocket, state)

            # Handle incoming messages
            async for message in websocket:
                try:
                    data = self._decoder.decode(message)
                    await self._handle_message(websocket, data)
                except Exception as e:
                    print(f"Invalid message received: {e}")

        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            print(f"Client disconnected. Total clients: {len(self.clients)}")

    async def _handle_message(
        self, websocket: WebSocketServerProtocol, message: dict
    ) -> None:
        """Handle incoming message from client."""
        msg_type = message.get("type")

        if msg_type == "ping":
            await self._send(websocket, {"type": "pong", "data": None})
        elif msg_type in ("play", "pause", "step", "reset"):
            if self.control_handler:
                self.control_handler(msg_type)

    async def _send(self, websocket: WebSocketServerProtocol, message: dict) -> None:
        """Send message to a client."""
        try:
            data = self._encoder.encode(message)
            await websocket.send(data)
        except websockets.exceptions.ConnectionClosed:
            self.clients.discard(websocket)

    async def _broadcast(self, data: bytes) -> None:
        """Broadcast pre-encoded message to all connected clients."""
        if not self.clients:
            return

        # Send to all clients concurrently
        await asyncio.gather(
            *[self._send_bytes(client, data) for client in self.clients],
            return_exceptions=True,
        )

    async def _send_bytes(
        self, websocket: WebSocketServerProtocol, data: bytes
    ) -> None:
        """Send raw bytes to a client."""
        try:
            await websocket.send(data)
        except websockets.exceptions.ConnectionClosed:
            self.clients.discard(websocket)

    def broadcast_state(self, state: GameState) -> None:
        """Broadcast game state to all clients (non-async, fires task)."""
        if not self.clients:
            return

        # Pre-serialize once for all clients
        message = self._encoder.encode({
            "type": "state",
            "tick": state.tick,
            "data": state,
        })

        # Fire and forget the broadcast
        asyncio.create_task(self._broadcast(message))

    async def _send_state(
        self, websocket: WebSocketServerProtocol, state: GameState
    ) -> None:
        """Send state to a specific client."""
        await self._send(websocket, {
            "type": "state",
            "tick": state.tick,
            "data": state,
        })

    async def _send_config(self, websocket: WebSocketServerProtocol) -> None:
        """Send config to a specific client."""
        if not self.engine:
            return

        config = self.engine.get_config()
        await self._send(websocket, {
            "type": "config",
            "data": config,
        })

    def broadcast_config(self) -> None:
        """Broadcast configuration to all clients."""
        if not self.engine or not self.clients:
            return

        config = self.engine.get_config()
        message = self._encoder.encode({
            "type": "config",
            "data": config,
        })
        asyncio.create_task(self._broadcast(message))

    @property
    def client_count(self) -> int:
        """Get the number of connected clients."""
        return len(self.clients)

    @property
    def is_running(self) -> bool:
        """Check if server is running."""
        return self.server is not None
