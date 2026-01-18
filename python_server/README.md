# FRC Simulation Server (Python)

High-performance Python implementation of the FRC match simulation server.

## Features

- 60 FPS tick-based physics simulation
- WebSocket server for browser visualization
- HTTP server for static file serving
- Fast JSON serialization with msgspec
- uvloop for improved async performance (on Linux/macOS)

## Installation

```bash
uv pip install -e .
```

## Usage

```bash
python -m frc_sim_server
```

Then open http://localhost:3000 in your browser.

## Architecture

- `types/` - msgspec Struct definitions for fast serialization
- `server/` - WebSocket and HTTP servers
- `simulation/` - Core simulation engine, clock, scoring
- `physics/` - Robot movement, ball physics, collision detection
- `field/` - Field representation, JSON loading, A* pathfinding
- `entities/` - Robot and Ball entity classes
- `strategy/` - Strategy system for AI robot control
