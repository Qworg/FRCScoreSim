"""Main entry point for the FRC simulation server."""

from __future__ import annotations
import asyncio
import logging
import os
import signal
import sys
from pathlib import Path

# Configure logging based on environment variable
log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Try to use uvloop for better performance
try:
    import uvloop
    uvloop.install()
    logger.info("Using uvloop for better async performance")
except ImportError:
    logger.info("uvloop not available, using default event loop")

from .server.ws_server import WebSocketServer
from .server.http_server import HTTPServer
from .simulation.engine import SimulationEngine, RobotSetup
from .field.loader import load_field_config, find_default_field
from .types.schemas import (
    RobotConfig,
    GameRules,
    BallPhysicsConfig,
    DEFAULT_GAME_RULES,
    DEFAULT_BALL_PHYSICS,
)


def create_default_robots() -> list[RobotSetup]:
    """Create default robot configurations for testing."""
    base_config = {
        "width": 30.0,
        "length": 32.0,
        "height": 45.0,
        "topSpeed": 180.0,
        "acceleration": 200.0,
        "turnRate": 360.0,
        "shootingRange": 300.0,
        "shootingAccuracy": 0.85,
        "ballCapacity": 5,
        "pickupTime": 0.3,
        "shootTime": 0.5,
        "canClimb": True,
        "autoClimb": True,
        "climbLevel": 2,
        "climbUpTime": 3.0,
        "climbDownTime": 1.5,
        "canPass": True,
        "defaultStrategy": "scorer",
    }

    setups = []

    # Red alliance robots
    for i in range(3):
        config = RobotConfig(
            id=f"red-{i+1}",
            teamNumber=1000 + i,
            teamName=f"Red Team {i+1}",
            **base_config,
        )
        setups.append(RobotSetup(
            config=config,
            alliance="red",
            strategy="scorer",
            starting_balls=3,
        ))

    # Blue alliance robots
    for i in range(3):
        config = RobotConfig(
            id=f"blue-{i+1}",
            teamNumber=2000 + i,
            teamName=f"Blue Team {i+1}",
            **base_config,
        )
        setups.append(RobotSetup(
            config=config,
            alliance="blue",
            strategy="scorer",
            starting_balls=3,
        ))

    return setups


async def run_server(
    http_port: int = 3000,
    ws_port: int = 8080,
    field_path: str | Path | None = None,
) -> None:
    """Run the simulation server."""
    logger.info("=" * 60)
    logger.info("Starting FRC Simulation Server...")
    logger.info(f"Log level: {log_level}")
    logger.info("=" * 60)

    # Load field configuration
    if field_path is None:
        field_path = find_default_field()
    logger.info(f"Loading field from: {field_path}")
    field_config = load_field_config(field_path)

    # Create default robots
    logger.info("Creating default robots...")
    robot_setups = create_default_robots()
    logger.info(f"  Created {len(robot_setups)} robot setups")
    for setup in robot_setups:
        logger.debug(f"    {setup.config.id}: {setup.alliance}, strategy={setup.strategy}, balls={setup.starting_balls}")

    # Create simulation engine
    logger.info("Creating simulation engine...")
    engine = SimulationEngine(
        field_config=field_config,
        robot_setups=robot_setups,
        rules=DEFAULT_GAME_RULES,
        ball_physics=DEFAULT_BALL_PHYSICS,
        tick_rate=60,
    )

    # Log initial state summary
    state = engine.get_state()
    logger.info("Initial game state:")
    logger.info(f"  Phase: {state.phase}")
    logger.info(f"  Robots: {len(state.robots)}")
    for r in state.robots:
        logger.debug(f"    {r.id}: pos=({r.position.x:.1f}, {r.position.y:.1f}), balls={len(r.heldBalls)}")
    logger.info(f"  Balls total: {len(state.balls)}")
    on_field = sum(1 for b in state.balls if b.state == "ON_FIELD")
    held = sum(1 for b in state.balls if b.state == "HELD")
    logger.info(f"    On field: {on_field}, Held by robots: {held}")

    # Create servers
    http_server = HTTPServer(port=http_port)
    ws_server = WebSocketServer(port=ws_port)

    # Connect engine to WebSocket server
    ws_server.attach_engine(engine)
    engine.on_state_update(ws_server.broadcast_state)
    logger.debug("Engine connected to WebSocket server")

    # Handle control commands
    def handle_control(command: str) -> None:
        logger.info(f"Control command received: {command}")
        if command == "play":
            engine.resume()
        elif command == "pause":
            engine.pause()
        elif command == "reset":
            engine.reset()

    ws_server.on_control(handle_control)

    # Start servers
    await http_server.start()
    await ws_server.start()

    logger.info("")
    logger.info("=" * 60)
    logger.info("Simulation ready!")
    logger.info(f"  Open http://localhost:{http_port} in your browser")
    logger.info(f"  WebSocket server on port {ws_port}")
    logger.info("")
    logger.info("For verbose logging, set LOG_LEVEL=DEBUG:")
    logger.info("  LOG_LEVEL=DEBUG python -m frc_sim")
    logger.info("=" * 60)
    logger.info("")

    # Set up shutdown handling
    shutdown_event = asyncio.Event()

    def signal_handler():
        logger.info("Shutdown signal received...")
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    # Start simulation
    logger.info("Starting simulation task...")
    simulation_task = asyncio.create_task(engine.start())

    # Wait for shutdown signal
    try:
        await shutdown_event.wait()
    except asyncio.CancelledError:
        pass

    # Cleanup
    logger.info("Stopping simulation...")
    engine.stop()
    simulation_task.cancel()
    try:
        await simulation_task
    except asyncio.CancelledError:
        pass

    await ws_server.stop()
    await http_server.stop()

    logger.info("Server stopped.")


def main() -> None:
    """Main entry point."""
    try:
        asyncio.run(run_server())
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        sys.exit(0)
    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
