"""WebSocket server for broadcasting simulation state."""

from __future__ import annotations
import asyncio
import logging
from typing import Optional, Callable, TYPE_CHECKING
import msgspec
import websockets
from websockets.server import WebSocketServerProtocol

if TYPE_CHECKING:
    from ..simulation.engine import SimulationEngine

from ..types.schemas import GameState, WSMessage, ConfigMessage

logger = logging.getLogger(__name__)


class WebSocketServer:
    """WebSocket server for broadcasting simulation state to browser clients."""

    def __init__(self, host: str = "0.0.0.0", port: int = 8080):
        self.host = host
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
        logger.info(f"Starting WebSocket server on {self.host}:{self.port}...")
        self.server = await websockets.serve(
            self._handle_connection,
            self.host,
            self.port,
        )
        logger.info(f"WebSocket server listening on ws://{self.host}:{self.port}")

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
        logger.info(f"Client connected. Total clients: {len(self.clients)}")

        try:
            # Send current config if engine is attached
            if self.engine:
                logger.debug("Sending config to new client...")
                await self._send_config(websocket)
                state = self.engine.get_state()
                logger.debug(
                    f"Sending initial state: tick={state.tick}, "
                    f"robots={len(state.robots)}, balls={len(state.balls)}"
                )
                await self._send_state(websocket, state)
                logger.debug("Initial state sent to client")
            else:
                logger.warning("No engine attached - client won't receive state")

            # Handle incoming messages
            async for message in websocket:
                try:
                    data = self._decoder.decode(message)
                    logger.debug(f"Received message: {data.get('type', 'unknown')}")
                    await self._handle_message(websocket, data)
                except Exception as e:
                    logger.error(f"Invalid message received: {e}")

        except websockets.exceptions.ConnectionClosed:
            logger.debug("Client connection closed")
        finally:
            self.clients.discard(websocket)
            logger.info(f"Client disconnected. Total clients: {len(self.clients)}")

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
            # Decode bytes to string so it's sent as text, not binary
            await websocket.send(data.decode('utf-8'))
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
        """Send raw bytes to a client as text."""
        try:
            # Decode bytes to string so it's sent as text, not binary
            await websocket.send(data.decode('utf-8'))
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

        # Log first broadcast and then every 300 ticks (5 seconds at 60 Hz)
        if state.tick == 1 or state.tick % 300 == 0:
            logger.debug(
                f"Broadcasting state: tick={state.tick}, "
                f"robots={len(state.robots)}, balls={len(state.balls)}, "
                f"clients={len(self.clients)}, msg_size={len(message)} bytes"
            )

        # On first tick, log a sample robot to debug serialization
        if state.tick == 1 and state.robots:
            import json
            robot = state.robots[0]
            logger.info(f"Sample robot data (tick 1):")
            logger.info(f"  id={robot.id}, alliance={robot.alliance}")
            logger.info(f"  position=({robot.position.x}, {robot.position.y})")
            logger.info(f"  config present: {robot.config is not None}")
            if robot.config:
                logger.info(f"  config.width={robot.config.width}, config.length={robot.config.length}")
            # Log first 500 chars of serialized message
            msg_str = message.decode('utf-8')
            logger.debug(f"Serialized message preview: {msg_str[:500]}...")

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
