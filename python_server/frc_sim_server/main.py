"""Main entry point for the FRC simulation server."""

from __future__ import annotations
import asyncio
import signal
import sys
from pathlib import Path

# Try to use uvloop for better performance
try:
    import uvloop
    uvloop.install()
    print("Using uvloop for better async performance")
except ImportError:
    print("uvloop not available, using default event loop")

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
    print("Starting FRC Simulation Server...")

    # Load field configuration
    if field_path is None:
        field_path = find_default_field()
    print(f"Loading field from: {field_path}")
    field_config = load_field_config(field_path)

    # Create default robots
    robot_setups = create_default_robots()

    # Create simulation engine
    engine = SimulationEngine(
        field_config=field_config,
        robot_setups=robot_setups,
        rules=DEFAULT_GAME_RULES,
        ball_physics=DEFAULT_BALL_PHYSICS,
        tick_rate=60,
    )

    # Create servers
    http_server = HTTPServer(port=http_port)
    ws_server = WebSocketServer(port=ws_port)

    # Connect engine to WebSocket server
    ws_server.attach_engine(engine)
    engine.on_state_update(ws_server.broadcast_state)

    # Handle control commands
    def handle_control(command: str) -> None:
        if command == "play":
            engine.resume()
        elif command == "pause":
            engine.pause()
        elif command == "reset":
            # TODO: Implement reset
            pass

    ws_server.on_control(handle_control)

    # Start servers
    await http_server.start()
    await ws_server.start()

    print(f"\nSimulation ready!")
    print(f"  Open http://localhost:{http_port} in your browser")
    print(f"  WebSocket server on port {ws_port}")
    print(f"\nPress Ctrl+C to stop\n")

    # Set up shutdown handling
    shutdown_event = asyncio.Event()

    def signal_handler():
        print("\nShutting down...")
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    # Start simulation
    simulation_task = asyncio.create_task(engine.start())

    # Wait for shutdown signal
    try:
        await shutdown_event.wait()
    except asyncio.CancelledError:
        pass

    # Cleanup
    engine.stop()
    simulation_task.cancel()
    try:
        await simulation_task
    except asyncio.CancelledError:
        pass

    await ws_server.stop()
    await http_server.stop()

    print("Server stopped.")


def main() -> None:
    """Main entry point."""
    try:
        asyncio.run(run_server())
    except KeyboardInterrupt:
        print("\nInterrupted")
        sys.exit(0)


if __name__ == "__main__":
    main()
