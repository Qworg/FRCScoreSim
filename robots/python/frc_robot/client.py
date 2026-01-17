"""
Robot Client - Connects to World Server and runs a strategy.

This is the main client class that handles WebSocket communication,
message serialization, and tick processing.
"""

import asyncio
import logging
from typing import Callable, Optional, Protocol

import msgpack
import websockets
from websockets.asyncio.client import ClientConnection

from .protocol import (
    MessageType,
    WorldState,
    RobotCommand,
    FieldConfig,
    MatchResult,
    PROTOCOL_VERSION,
)

logger = logging.getLogger(__name__)


class Strategy(Protocol):
    """Protocol for robot strategies."""

    def decide(self, world_state: WorldState) -> RobotCommand:
        """Make a decision based on the current world state."""
        ...

    def on_field_config(self, config: FieldConfig) -> None:
        """Called when field configuration is received."""
        ...

    def on_match_end(self, result: MatchResult) -> None:
        """Called when the match ends."""
        ...


class RobotClient:
    """
    Robot client that connects to the World Server.

    Usage:
        async def main():
            client = RobotClient(
                server_url="ws://localhost:8081",
                robot_id="red-1",
                strategy=MyStrategy(),
            )
            await client.run()

        asyncio.run(main())
    """

    def __init__(
        self,
        server_url: str,
        robot_id: str,
        strategy: Strategy,
        client_name: Optional[str] = None,
        auto_reconnect: bool = True,
        reconnect_delay: float = 2.0,
        max_reconnect_attempts: int = 10,
    ):
        self.server_url = server_url
        self.robot_id = robot_id
        self.strategy = strategy
        self.client_name = client_name or f"{robot_id}-python"
        self.auto_reconnect = auto_reconnect
        self.reconnect_delay = reconnect_delay
        self.max_reconnect_attempts = max_reconnect_attempts

        self._ws: Optional[ClientConnection] = None
        self._running = False
        self._reconnect_attempts = 0
        self._field_config: Optional[FieldConfig] = None

        # Callbacks
        self.on_connected: Optional[Callable[[], None]] = None
        self.on_disconnected: Optional[Callable[[], None]] = None
        self.on_tick: Optional[Callable[[WorldState], None]] = None
        self.on_error: Optional[Callable[[Exception], None]] = None

    async def run(self) -> None:
        """Run the client, connecting to the server and processing messages."""
        self._running = True

        while self._running:
            try:
                await self._connect_and_run()
            except websockets.ConnectionClosed as e:
                logger.warning(f"Connection closed: {e}")
                if self.on_disconnected:
                    self.on_disconnected()

                if not self.auto_reconnect or not self._running:
                    break

                self._reconnect_attempts += 1
                if self._reconnect_attempts > self.max_reconnect_attempts:
                    logger.error("Max reconnect attempts reached")
                    break

                logger.info(
                    f"Reconnecting in {self.reconnect_delay}s "
                    f"(attempt {self._reconnect_attempts}/{self.max_reconnect_attempts})"
                )
                await asyncio.sleep(self.reconnect_delay)

            except Exception as e:
                logger.error(f"Error: {e}")
                if self.on_error:
                    self.on_error(e)
                break

    async def _connect_and_run(self) -> None:
        """Connect to the server and process messages."""
        logger.info(f"Connecting to {self.server_url}...")

        async with websockets.connect(self.server_url) as ws:
            self._ws = ws
            self._reconnect_attempts = 0
            logger.info("Connected!")

            if self.on_connected:
                self.on_connected()

            # Send CLIENT_HELLO
            await self._send_hello()

            # Process messages
            async for message in ws:
                if isinstance(message, bytes):
                    await self._handle_message(message)
                else:
                    logger.warning(f"Received non-binary message: {message}")

    async def _send_hello(self) -> None:
        """Send CLIENT_HELLO message."""
        message = {
            "type": MessageType.CLIENT_HELLO,
            "payload": {
                "robotId": self.robot_id,
                "protocolVersion": PROTOCOL_VERSION,
                "clientName": self.client_name,
            },
        }
        await self._send(message)
        logger.debug(f"Sent CLIENT_HELLO for robot {self.robot_id}")

    async def _send(self, message: dict) -> None:
        """Send a MessagePack-encoded message."""
        if self._ws:
            data = msgpack.packb(message)
            await self._ws.send(data)

    async def _handle_message(self, data: bytes) -> None:
        """Handle a received message."""
        message = msgpack.unpackb(data, raw=False)
        msg_type = message.get("type")
        payload = message.get("payload", {})

        if msg_type == MessageType.FIELD_CONFIG:
            await self._handle_field_config(payload)
        elif msg_type == MessageType.TICK_UPDATE:
            await self._handle_tick_update(payload)
        elif msg_type == MessageType.MATCH_END:
            await self._handle_match_end(payload)
        elif msg_type == MessageType.PONG:
            logger.debug("Received PONG")
        elif msg_type == MessageType.ERROR:
            await self._handle_error(payload)
        else:
            logger.warning(f"Unknown message type: {msg_type}")

    async def _handle_field_config(self, payload: dict) -> None:
        """Handle FIELD_CONFIG message."""
        self._field_config = FieldConfig.from_wire(payload)
        logger.info(
            f"Received field config: {self._field_config.width}x{self._field_config.height}, "
            f"tick rate: {self._field_config.tick_rate}"
        )
        self.strategy.on_field_config(self._field_config)

    async def _handle_tick_update(self, payload: dict) -> None:
        """Handle TICK_UPDATE message."""
        state = payload.get("state", {})
        world_state = WorldState.from_wire(state)

        if self.on_tick:
            self.on_tick(world_state)

        # Get decision from strategy
        command = self.strategy.decide(world_state)

        # Send command
        await self._send_command(command)

    async def _send_command(self, command: RobotCommand) -> None:
        """Send a robot command."""
        message = {
            "type": MessageType.ROBOT_COMMAND,
            "payload": {
                "command": command.to_wire(),
            },
        }
        await self._send(message)

    async def _handle_match_end(self, payload: dict) -> None:
        """Handle MATCH_END message."""
        result = MatchResult.from_wire(payload)
        logger.info(
            f"Match ended! Red: {result.red_score}, Blue: {result.blue_score}, "
            f"Winner: {result.winner}"
        )
        self.strategy.on_match_end(result)
        self._running = False

    async def _handle_error(self, payload: dict) -> None:
        """Handle ERROR message."""
        code = payload.get("code", 0)
        msg = payload.get("message", "Unknown error")
        logger.error(f"Server error [{code}]: {msg}")

        if self.on_error:
            self.on_error(Exception(f"Server error [{code}]: {msg}"))

    def stop(self) -> None:
        """Stop the client."""
        self._running = False
        if self._ws:
            asyncio.create_task(self._ws.close())
