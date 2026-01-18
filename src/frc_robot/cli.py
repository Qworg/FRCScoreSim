"""
Command-line interface for the FRC robot client.
"""

import argparse
import asyncio
import logging
import sys

from .client import RobotClient
from .protocol import WorldState
from .strategies import CollectorStrategy, ScorerStrategy, IdleStrategy


def get_strategy(name: str):
    """Get a strategy by name."""
    strategies = {
        "idle": IdleStrategy,
        "collector": CollectorStrategy,
        "scorer": ScorerStrategy,
    }

    strategy_class = strategies.get(name.lower())
    if not strategy_class:
        print(f"Unknown strategy: {name}")
        print(f"Available strategies: {', '.join(strategies.keys())}")
        sys.exit(1)

    return strategy_class()


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="FRC Robot Client - Connect to World Server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  robot --id red-1 --strategy collector
  robot --id blue-2 --strategy scorer --server ws://192.168.1.100:8081
  robot --id red-3 --strategy idle --verbose
        """,
    )

    parser.add_argument(
        "--id", "-i",
        required=True,
        help="Robot ID (e.g., red-1, blue-2)",
    )
    parser.add_argument(
        "--strategy", "-s",
        default="collector",
        help="Strategy to use (idle, collector, scorer). Default: collector",
    )
    parser.add_argument(
        "--server", "-S",
        default="ws://localhost:8081",
        help="World server URL. Default: ws://localhost:8081",
    )
    parser.add_argument(
        "--name", "-n",
        help="Client name for logging",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    parser.add_argument(
        "--debug", "-d",
        action="store_true",
        help="Enable debug logging",
    )

    args = parser.parse_args()

    # Configure logging
    log_level = logging.WARNING
    if args.verbose:
        log_level = logging.INFO
    if args.debug:
        log_level = logging.DEBUG

    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    print("=== FRC Robot Client (Python) ===")
    print(f"Robot ID:  {args.id}")
    print(f"Strategy:  {args.strategy}")
    print(f"Server:    {args.server}")
    print()

    # Create strategy
    strategy = get_strategy(args.strategy)
    print(f"Using strategy: {strategy.__class__.__name__}")

    # Create client
    client = RobotClient(
        server_url=args.server,
        robot_id=args.id,
        strategy=strategy,
        client_name=args.name or f"{args.id}-python",
    )

    # Set up callbacks
    def on_connected():
        print("Connected to server")

    def on_disconnected():
        print("Disconnected from server")

    def on_tick(world_state: WorldState):
        # Log every second (60 ticks)
        if world_state.tick % 60 == 0:
            my = world_state.my_robot
            print(
                f"Tick {world_state.tick}: "
                f"pos=({my.x:.0f}, {my.y:.0f}) "
                f"balls={my.held_balls} "
                f"action={my.action.name} "
                f"score: R{world_state.red_score}-B{world_state.blue_score}"
            )

    def on_error(error: Exception):
        print(f"Error: {error}")

    client.on_connected = on_connected
    client.on_disconnected = on_disconnected
    client.on_tick = on_tick
    client.on_error = on_error

    # Run
    print("\nConnecting to server...")
    try:
        asyncio.run(client.run())
    except KeyboardInterrupt:
        print("\nShutting down...")
        client.stop()


if __name__ == "__main__":
    main()
