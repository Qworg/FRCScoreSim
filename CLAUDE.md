# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
cd python_server
uv run python -m frc_sim_server   # Start WebSocket server + browser UI at http://localhost:3000
```

## Architecture Overview

This is an FRC (FIRST Robotics Competition) match simulator with ~60 FPS tick-based physics simulation, implemented in Python.

### Core Loop (SimulationEngine)
The `SimulationEngine` (`simulation/engine.py`) orchestrates the main tick loop:
1. Strategy decisions are computed for each robot
2. Robot physics updated (movement, collision)
3. Ball physics updated (flight, ground friction, scoring detection)
4. Events published to EventBus
5. State broadcast to WebSocket clients

### Key Subsystems

**Game State** (`simulation/`):
- `match.py` - Central game state holder (robots, balls, events)
- `clock.py` - Phase timing (AUTO → TRANSITION → 4 SHIFTs → ENDGAME)
- `scoring.py` - Point calculation and parity determination

**Strategy System** (`strategy/`):
- Strategies implement `BaseStrategy.decide(context)` returning `StrategyDecision`
- `StrategyContext` provides game state, nearby balls, scoring targets, phase info
- Key property: `can_score` - whether alliance can score in current phase (shift-based scoring)
- Built-in: `IdleStrategy`, `CollectorStrategy`, `ScorerStrategy`

**Physics** (`physics/`):
- `robot.py` - velocity-based movement with acceleration limits
- `ball.py` - gravity (386.4 in/s²), air resistance, ground friction
- `collision.py` - collision detection and response

**Field** (`field/`):
- `field.py` - 648×324 inch grid (standard FRC field)
- `pathfinding.py` - A* pathfinding algorithm
- Zone types: NORMAL, RAMP (speed penalty), TRENCH (height check), CLIMBING, SCORING_ZONE

**Entities** (`entities/`):
- `robot.py` - Robot state and configuration
- `ball.py` - Ball state management

### Shift-Based Scoring (Unique Game Mechanic)
Alliances get EVEN or ODD parity based on AUTO scoring. During teleop shifts:
- EVEN parity: scores during Shift 2 & 4
- ODD parity: scores during Shift 1 & 3
- TRANSITION and ENDGAME: both alliances can score

### Data Formats
- Fields: JSON in `data/fields/`
- Robots: Markdown in `data/robots/`

### Server Architecture
- HTTP server on port 3000 serves the browser UI (`public/index.html`)
- WebSocket server on port 8080 broadcasts game state to connected clients
- Uses `asyncio` for async event loops
- Uses `msgspec` for fast JSON encoding

### Browser Visualization
The `public/index.html` file contains the Canvas-based visualization:
- Real-time rendering of field, robots, and balls
- Control UI: Play, Pause, Step, Reset buttons
- Keyboard shortcuts (Space=Play/Pause, Right=Step, Ctrl+R=Reset)
- Status display (tick count, connection state, scores)
