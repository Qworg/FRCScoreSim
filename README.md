# FRC Score Simulator

A Python-based FRC (FIRST Robotics Competition) robot match simulator with configurable fields, robot characteristics, A* pathfinding, and strategy/AI systems.

## Quick Start

```bash
# Install dependencies (requires uv: https://docs.astral.sh/uv/)
uv sync

# Run with browser visualization
uv run python -m frc_sim
# Then open http://localhost:3000

# Run a robot client (in a separate terminal)
uv run python -m frc_robot --id red-1 --strategy collector
```

## Features

- **Field System**: Configurable field grid with zones, obstacles, and scoring targets
- **Robot Physics**: Realistic movement with acceleration, velocity, and collision handling
- **Ball Physics**: Flight trajectories, ground friction, and scoring detection
- **Pathfinding**: A* algorithm with terrain cost calculations
- **Strategy System**: Pluggable AI strategies (Collector, Scorer, Idle) + Decision Tree framework
- **Game Phases**: AUTO, Shift-based TELEOP (4 shifts), and ENDGAME with parity-based scoring
- **WebSocket Visualization**: Real-time state broadcast for browser UI
- **Robot Client Protocol**: MessagePack-based protocol for external robot clients

## Game Rules: Shift-Based Scoring

The simulator uses a shift-based scoring system where alliances alternate scoring windows during teleop.

### Match Structure (160 seconds total)

| Phase | Duration | Who Can Score |
|-------|----------|---------------|
| AUTO | 20s | Both alliances |
| TRANSITION | 10s | Both alliances |
| SHIFT 1 | 25s | ODD alliance only |
| SHIFT 2 | 25s | EVEN alliance only |
| SHIFT 3 | 25s | ODD alliance only |
| SHIFT 4 | 25s | EVEN alliance only |
| ENDGAME | 30s | Both alliances |

### Parity Determination

After AUTO ends, each alliance is assigned a **parity** based on autonomous performance:

- **EVEN parity**: Alliance that scored the **most balls** during AUTO
  - Scores during Shift 2 and Shift 4
- **ODD parity**: Alliance that scored **fewer balls** during AUTO
  - Scores during Shift 1 and Shift 3
- **Tiebreaker**: If both alliances score the same number of balls, Red gets EVEN parity

### Strategic Implications

- Strong AUTO performance gives you EVEN parity, meaning you score second in each pair of shifts
- ODD alliance gets first-mover advantage in each shift pair
- Robots automatically respect scoring windows - they will collect balls during off-shifts and shoot when allowed
- TRANSITION and ENDGAME are open scoring periods for both alliances

### Climbing Rules

Robots can climb during two phases for points:

**AUTO Climb (15 points per robot)**
- Robots with `autoClimb: true` can climb during the AUTO phase
- Maximum **2 robots per alliance** can auto-climb
- After climbing, robot descends and continues playing normally

**ENDGAME Climb (10 points x level)**
- All robots with `canClimb: true` can climb in ENDGAME
- Maximum **3 robots per alliance** can climb
- Points based on climb level achieved:
  - Level 1: 10 points
  - Level 2: 20 points
  - Level 3: 30 points

## Running the Simulator

### Visual Mode (Browser UI)

Run the simulation server with browser-based visualization:

```bash
uv run python -m frc_sim
```

Then open http://localhost:3000 in your browser.

**Controls:**
| Button | Keyboard | Action |
|--------|----------|--------|
| Play | Space | Start simulation at 60 FPS |
| Pause | Space | Pause simulation |
| Step | Right Arrow | Advance single tick (1/60th second) |
| Reset | Ctrl+R | Reset to new match |

**Color Legend:**
- **Red rectangles**: Red alliance robots
- **Blue rectangles**: Blue alliance robots
- **Yellow circles**: Balls on the field
- **Yellow badge on robot**: Number of balls robot is holding
- **Red/Blue rings**: Scoring goals for each alliance

### Robot Client

Run robot clients that connect to the simulation server:

```bash
# Start the simulation server first
uv run python -m frc_sim

# In separate terminals, start robot clients
uv run python -m frc_robot --id red-1 --strategy collector
uv run python -m frc_robot --id red-2 --strategy scorer
uv run python -m frc_robot --id blue-1 --strategy collector
```

**Available strategies:** `idle`, `collector`, `scorer`

**Options:**
```
--id, -i        Robot ID (e.g., red-1, blue-2) [required]
--strategy, -s  Strategy to use (default: collector)
--server, -S    Server URL (default: ws://localhost:8081)
--verbose, -v   Enable verbose logging
--debug, -d     Enable debug logging
```

---

## System Architecture

### Project Structure

```
src/
├── frc_sim/                # Simulation server package
│   ├── types/              # Enums and data schemas (msgspec)
│   ├── field/              # Field grid, zones, pathfinding
│   ├── entities/           # Robot and Ball entities
│   ├── physics/            # Movement, collision, ball flight
│   ├── simulation/         # Engine, match state, clock, scoring
│   ├── strategy/           # AI strategies and decision tree framework
│   │   └── decision_tree/  # Composable behavior tree system
│   └── server/             # HTTP and WebSocket servers
│
└── frc_robot/              # Robot client package
    ├── client.py           # WebSocket client with auto-reconnect
    ├── protocol.py         # MessagePack wire protocol types
    └── strategies/         # Client-side strategy implementations

data/
├── fields/                 # Field configuration JSON files
└── robots/                 # Robot definition markdown files

public/
└── index.html              # Browser visualization (Canvas-based)
```

### Server Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 3000 | HTTP | Browser UI (serves `public/index.html`) |
| 8080 | WebSocket (JSON) | Browser visualization state updates |
| 8081 | WebSocket (MessagePack) | Robot client protocol |

---

## Customization Guide

### Creating a Custom Strategy (Decision Tree)

The decision tree framework allows composable, declarative strategies:

```python
from frc_sim.strategy.decision_tree import (
    DecisionTreeStrategy,
    Sequence,
    ConditionalAction,
    And,
    HasBalls,
    CanScore,
    InShootingRange,
    ShootAction,
    MoveToBallAction,
    IdleAction,
)

# Build a simple strategy tree
root = Sequence(
    # If we have balls, can score, and in range -> shoot
    ConditionalAction(
        And(HasBalls(), CanScore(), InShootingRange()),
        ShootAction(priority=10)
    ),
    # Otherwise, go collect balls
    MoveToBallAction(priority=5),
    # Fallback to idle
    IdleAction()
)

strategy = DecisionTreeStrategy("my_strategy", root)
```

**Available Conditions:**
- Ball state: `HasBalls`, `HopperFull`, `HopperEmpty`, `BallsAvailable`
- Scoring: `CanScore`, `InShootingRange`, `HasClearShot`
- Phase: `IsAutoPhase`, `IsEndgamePhase`, `IsShiftPhase`, `PhaseTimeRemaining`
- Climbing: `CanAutoClimb`, `CanEndgameClimb`, `IsNearClimbingZone`
- Composites: `And`, `Or`, `Not`

**Available Actions:**
- `IdleAction`, `MoveToBallAction`, `MoveToScoringTargetAction`
- `ShootAction`, `PickupBallAction`, `ClimbAction`

**Selectors:**
- `Sequence` - Execute children in order until one succeeds
- `Fallback` - Execute children until one succeeds (like OR)
- `IfThenElse` - Conditional branching
- `Priority` - Execute highest priority child that applies

### Creating a New Field

Create a JSON file in `data/fields/`:

```json
{
  "name": "My Custom Field",
  "year": 2024,
  "width": 648,
  "height": 324,
  "cellSize": 1,
  "zones": [
    {
      "id": "ramp-1",
      "type": "RAMP",
      "bounds": { "x": 100, "y": 100, "width": 50, "height": 50 },
      "speedMultiplier": 0.5
    }
  ],
  "ballSpawnPoints": [
    { "id": "ball-1", "position": { "x": 200, "y": 162 }, "alliance": null }
  ],
  "scoringTargets": [
    {
      "id": "red-high-goal",
      "name": "Red High Goal",
      "position": { "x": 24, "y": 162 },
      "radius": 24,
      "minHeight": 80,
      "alliance": "red",
      "points": { "auto": 6, "teleop": 3 }
    }
  ],
  "startingPositions": {
    "red": [{ "x": 96, "y": 100 }, { "x": 96, "y": 162 }, { "x": 96, "y": 224 }],
    "blue": [{ "x": 552, "y": 100 }, { "x": 552, "y": 162 }, { "x": 552, "y": 224 }]
  }
}
```

**Zone Types:**
| Type | Description |
|------|-------------|
| `NORMAL` | Standard traversable area |
| `RAMP` | Slows robots (uses `speedMultiplier`) |
| `TRENCH` | Height-restricted passage (uses `maxHeight`) |
| `CLIMBING` | Endgame climbing zone |
| `SCORING_ZONE` | Area near scoring targets |

### Creating a New Robot

Create a Markdown file in `data/robots/`:

```markdown
# Team 1234 - The Robotics Team

## Dimensions
- Width: 28 inches
- Length: 32 inches
- Height: 42 inches

## Capabilities
- Top Speed: 180 in/s
- Acceleration: 120 in/s^2
- Turn Rate: 360 deg/s
- Shooting Range: 240 inches
- Shooting Accuracy: 0.85
- Ball Capacity: 5
- Pickup Time: 0.5 seconds
- Shoot Time: 0.3 seconds
- Can Climb: yes
- Auto Climb: yes
- Climb Level: 3
- Climb Up Time: 2.5 seconds
- Climb Down Time: 2.0 seconds

## Default Strategy
scorer
```

---

## Testing

```bash
# Install dev dependencies
uv pip install -e ".[dev]"

# Run tests
uv run pytest
```

## License

MIT
