# FRC Score Simulator

A TypeScript-based FRC (FIRST Robotics Competition) robot match simulator with configurable fields, robot characteristics, A* pathfinding, and strategy/AI systems.

## Quick Start

```bash
# Install dependencies
npm install

# Run with browser visualization
npm run serve
# Then open http://localhost:3000

# Or run headless (no UI, fast)
npm run demo
```

## Features

- **Field System**: Configurable field grid with zones, obstacles, and scoring targets
- **Robot Physics**: Realistic movement with acceleration, velocity, and collision handling
- **Ball Physics**: Flight trajectories, ground friction, and scoring detection
- **Pathfinding**: A* algorithm with terrain cost calculations
- **Strategy System**: Pluggable AI strategies (Collector, Scorer, Idle)
- **Game Phases**: AUTO, Shift-based TELEOP (4 shifts), and ENDGAME with parity-based scoring
- **WebSocket Visualization**: Real-time state broadcast for external UI clients

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
- Great for early point advantage

**ENDGAME Climb (10 points × level)**
- All robots with `canClimb: true` can climb in ENDGAME
- Maximum **3 robots per alliance** can climb
- Points based on climb level achieved:
  - Level 1: 10 points
  - Level 2: 20 points
  - Level 3: 30 points
- Robot's `climbLevel` config determines max level it can reach

**Robot Climbing Configuration**
| Parameter | Type | Description |
|-----------|------|-------------|
| `canClimb` | boolean | Whether robot can climb in endgame |
| `autoClimb` | boolean | Whether robot can climb during AUTO |
| `climbLevel` | 1-3 | Maximum climb level robot can achieve |
| `climbUpTime` | seconds | Time to complete climb |
| `climbDownTime` | seconds | Time to descend (after auto climb) |

## Installation

```bash
npm install
```

## Running the Simulator

### Headless Mode (No UI)

Run a complete match simulation as fast as possible without any visualization:

```bash
# Run the demo simulation
npm run demo
# Or: npx tsx scripts/demo-final.ts
```

**Output includes:**
- Phase-by-phase snapshots
- Final scores (Auto, Teleop, Endgame breakdown)
- Activity summary (pickups, shots, scores)
- Key events timeline

### Visual Mode (Browser UI)

Run the simulation with a browser-based visualization:

```bash
npm run serve
```

Then open http://localhost:3000 in your browser.

The visualization shows:
- A green field (648x324 inches, actual FRC field size)
- Red and blue robot rectangles moving around the field
- Yellow balls that robots collect and shoot
- Scoring goals at each end of the field
- Real-time score updates as robots score

**Features:**
- Real-time field visualization with robots and balls
- Play/Pause/Step controls for simulation
- Live scoreboard with breakdown (Auto/Teleop/Endgame points)
- Match phase and time display
- Event log showing pickups, shots, and scores

**Controls:**
| Button | Keyboard | Action |
|--------|----------|--------|
| Play | Space | Start simulation at 60 FPS |
| Pause | Space | Pause simulation |
| Step | Right Arrow | Advance single tick (1/60th second) |
| Reset | Ctrl+R | Reset to new match |

**Color Legend:**
- **Red rectangles**: Red alliance robots (number shows robot ID)
- **Blue rectangles**: Blue alliance robots (number shows robot ID)
- **Yellow circles**: Balls on the field
- **Yellow badge on robot**: Number of balls robot is holding
- **Red/Blue rings**: Scoring goals for each alliance

### Real-time Mode with WebSocket UI (Programmatic)

Start the simulator with a WebSocket server for external visualization clients:

```typescript
import {
  createDemoSetup,
  SimulationEngine,
  VisualizationServer,
  SimulationMode,
  IdleStrategy,
  CollectorStrategy,
  ScorerStrategy
} from './src/index.js';

// Create match setup
const setup = createDemoSetup();
setup.simulation.mode = SimulationMode.REALTIME;

// Create engine and register strategies
const engine = new SimulationEngine(setup);
engine.registerStrategy(new IdleStrategy());
engine.registerStrategy(new CollectorStrategy());
engine.registerStrategy(new ScorerStrategy());

// Start WebSocket server on port 8080
const server = new VisualizationServer(8080);
await server.start();
server.attachEngine(engine);

console.log('WebSocket server running on ws://localhost:8080');

// Start the match (runs in real-time)
const result = await engine.start();
console.log('Match complete:', result.winner);

// Cleanup
server.stop();
```

**WebSocket Message Types:**

| Type | Description |
|------|-------------|
| `config` | Initial field and robot configuration (sent on connect) |
| `state` | Full game state snapshot (sent each tick) |
| `event` | Individual game events (scores, pickups, etc.) |

### Step Mode (Manual Control)

For debugging or frame-by-frame analysis:

```typescript
const setup = createDemoSetup();
setup.simulation.mode = SimulationMode.STEP;

const engine = new SimulationEngine(setup);
// ... register strategies ...

const match = engine.getMatch();
match.start();

// Advance one tick at a time
engine.step();
const state = engine.getState();
console.log('Tick:', state.tick, 'Phase:', state.phase);
```

---

## System Architecture

### Project Structure

```
src/
├── types/              # TypeScript interfaces and enums
│   ├── field.ts        # Position, GridPosition, ZoneType, FieldConfig
│   ├── robot.ts        # RobotConfig, RobotState, RobotAction
│   ├── ball.ts         # Ball, BallState, BallVelocity
│   ├── game.ts         # GameState, Score, MatchPhase, GameEvent
│   ├── simulation.ts   # SimulationConfig, MatchSetup
│   └── strategy.ts     # Strategy, StrategyContext, StrategyDecision
│
├── field/              # Field management
│   ├── Field.ts        # Grid representation, zone queries
│   ├── FieldLoader.ts  # Load field from JSON config
│   └── CostFunction.ts # Pathfinding cost calculations
│
├── robot/              # Robot system
│   ├── Robot.ts        # Robot entity with state management
│   ├── RobotLoader.ts  # Parse robot markdown files
│   └── Movement.ts     # Physics-based movement, collisions
│
├── pathfinding/        # Navigation
│   ├── AStar.ts        # A* pathfinding implementation
│   └── PathNode.ts     # Priority queue for pathfinding
│
├── ball/               # Ball system
│   ├── Ball.ts         # Ball entity
│   └── BallPhysics.ts  # Movement, friction, flight, scoring
│
├── game/               # Game logic
│   ├── Match.ts        # Match orchestration
│   ├── GameClock.ts    # Phase timing (AUTO/SHIFTS/ENDGAME)
│   └── ScoringSystem.ts# Point calculations
│
├── simulation/         # Core simulation
│   ├── SimulationEngine.ts  # Main tick loop
│   ├── EventBus.ts          # Pub/sub event system
│   └── MatchRecorder.ts     # Match history recording
│
├── strategy/           # AI system
│   ├── BaseStrategy.ts      # Abstract strategy class
│   ├── StrategyManager.ts   # Strategy registration
│   └── builtin/             # Built-in strategies
│       ├── IdleStrategy.ts
│       ├── CollectorStrategy.ts
│       └── ScorerStrategy.ts
│
├── visualization/      # External visualization
│   └── WebSocketServer.ts   # Real-time state broadcast
│
└── utils/              # Utilities
    ├── Vector2D.ts          # 2D math operations
    └── MarkdownParser.ts    # Robot file parser

data/
├── fields/             # Field configuration files
│   └── infinite-recharge.json
└── robots/             # Robot definition files
    └── example-robot.md
```

### Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  StrategyManager │────▶│ SimulationEngine │────▶│ WebSocketServer │
│  (AI Decisions)  │     │   (Tick Loop)    │     │  (Broadcast)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
              ┌─────────┐ ┌─────────┐ ┌─────────┐
              │  Match  │ │ Robots  │ │  Balls  │
              │ (State) │ │(Physics)│ │(Physics)│
              └─────────┘ └─────────┘ └─────────┘
```

---

## Customization Guide

### Creating a New Field

1. Create a JSON file in `data/fields/`:

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
    },
    {
      "id": "trench-1",
      "type": "TRENCH",
      "bounds": { "x": 200, "y": 0, "width": 248, "height": 50 },
      "maxHeight": 30
    }
  ],
  "ballSpawnPoints": [
    { "id": "ball-1", "position": { "x": 200, "y": 162 }, "alliance": null },
    { "id": "ball-2", "position": { "x": 324, "y": 100 }, "alliance": "red" }
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
    },
    {
      "id": "red-low-goal",
      "name": "Red Low Goal",
      "position": { "x": 24, "y": 100 },
      "radius": 36,
      "maxHeight": 40,
      "alliance": "red",
      "points": { "auto": 2, "teleop": 1 }
    }
  ],
  "startingPositions": {
    "red": [
      { "x": 96, "y": 100 },
      { "x": 96, "y": 162 },
      { "x": 96, "y": 224 }
    ],
    "blue": [
      { "x": 552, "y": 100 },
      { "x": 552, "y": 162 },
      { "x": 552, "y": 224 }
    ]
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

2. Load the field:

```typescript
import { loadFieldFromFile } from './src/index.js';

const field = await loadFieldFromFile('data/fields/my-field.json');
```

### Creating a New Robot

1. Create a Markdown file in `data/robots/`:

```markdown
# Team 1234 - The Robotics Team

## Description
A versatile robot designed for ball collection and scoring.

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
- Can Pass: yes

## Default Strategy
scorer
```

2. Load the robot:

```typescript
import { loadRobotFromFile } from './src/index.js';

const robotConfig = await loadRobotFromFile('data/robots/my-robot.md');
```

**Robot Parameters:**
| Parameter | Description | Default |
|-----------|-------------|---------|
| `width` | Robot width in inches | 28 |
| `length` | Robot length in inches | 32 |
| `height` | Robot height in inches | 45 |
| `topSpeed` | Maximum speed (in/s) | 150 |
| `acceleration` | Acceleration rate (in/s²) | 100 |
| `turnRate` | Turn speed (deg/s) | 180 |
| `shootingRange` | Max shooting distance (in) | 240 |
| `shootingAccuracy` | Shot success rate (0-1) | 0.7 |
| `ballCapacity` | Max balls held | 5 |
| `pickupTime` | Seconds to pick up ball | 0.5 |
| `shootTime` | Seconds to shoot ball | 0.3 |
| `canClimb` | Can climb in endgame | true |
| `autoClimb` | Can climb during AUTO (15 pts) | false |
| `climbLevel` | Max climb level (1-3) | 2 |
| `climbUpTime` | Seconds to climb up | 3.0 |
| `climbDownTime` | Seconds to descend | 2.0 |
| `canPass` | Can pass to teammates | false |

### Creating a Custom Strategy

1. Create a new strategy file in `src/strategy/builtin/` or your own directory:

```typescript
import { BaseStrategy } from '../BaseStrategy.js';
import type { StrategyContext, StrategyDecision } from '../../types/index.js';
import { StrategyPriority, RobotActionType } from '../../types/index.js';

export class AggressiveStrategy extends BaseStrategy {
  readonly id = 'aggressive';
  readonly name = 'Aggressive';
  readonly description = 'Prioritizes scoring over collection';

  decide(context: StrategyContext): StrategyDecision {
    const { robot, nearestBall, nearestBallDistance, inShootingRange, canScore } = context;

    // Only shoot if we CAN score this phase (respects shift rules)
    if (canScore && robot.heldBalls.length > 0 && inShootingRange && context.nearestScoringTarget) {
      return this.shoot(
        context.nearestScoringTarget.id,
        StrategyPriority.CRITICAL,
        'Shooting immediately'
      );
    }

    // Move to shooting position if we have balls and can score
    if (canScore && robot.heldBalls.length > 0 && context.nearestScoringTarget) {
      return this.moveTo(
        context.nearestScoringTarget.position.x,
        context.nearestScoringTarget.position.y,
        StrategyPriority.HIGH,
        'Moving to shoot'
      );
    }

    // Collect balls (always allowed)
    if (nearestBall && nearestBallDistance !== null) {
      if (nearestBallDistance < 18) {
        return this.pickup(nearestBall.id, StrategyPriority.MEDIUM, 'Picking up');
      }
      return this.moveTo(
        nearestBall.position.x,
        nearestBall.position.y,
        StrategyPriority.MEDIUM,
        'Collecting'
      );
    }

    // During off-shifts, position near scoring zone for when we can score
    if (!canScore && robot.heldBalls.length > 0 && context.nearestScoringTarget) {
      return this.moveTo(
        context.nearestScoringTarget.position.x,
        context.nearestScoringTarget.position.y,
        StrategyPriority.LOW,
        'Positioning for next scoring window'
      );
    }

    return this.idle('Nothing to do');
  }
}
```

2. Register and use the strategy:

```typescript
import { AggressiveStrategy } from './my-strategies/AggressiveStrategy.js';

engine.registerStrategy(new AggressiveStrategy());

// Assign to a robot in the match setup
const setup = {
  // ...
  robots: [
    { config: robotConfig, alliance: 'red', strategy: 'aggressive' }
  ]
};
```

**Strategy Context (available data):**
| Property | Type | Description |
|----------|------|-------------|
| `gameState` | `GameState` | Full game state |
| `robot` | `RobotState` | Current robot's state |
| `phase` | `MatchPhase` | Current match phase |
| `phaseTimeRemaining` | `number` | Seconds left in phase |
| `currentShift` | `number \| null` | Current shift (1-4) or null |
| `allianceParity` | `ShiftParity \| null` | Alliance's parity (EVEN/ODD) |
| `canScore` | `boolean` | Whether alliance can score this phase |
| `teammates` | `RobotState[]` | Teammate states |
| `opponents` | `RobotState[]` | Opponent states |
| `availableBalls` | `BallData[]` | Balls on field |
| `nearestBall` | `BallData \| null` | Closest ball |
| `nearestBallDistance` | `number \| null` | Distance to closest ball |
| `scoringTargets` | `ScoringTarget[]` | Valid scoring targets |
| `nearestScoringTarget` | `ScoringTarget \| null` | Closest target |
| `nearestScoringTargetDistance` | `number \| null` | Distance to target |
| `inShootingRange` | `boolean` | Can robot shoot from here |

**Available Actions:**
| Method | Description |
|--------|-------------|
| `this.idle(reason)` | Do nothing |
| `this.moveTo(x, y, priority, reason)` | Navigate to position |
| `this.pickup(ballId, priority, reason)` | Pick up a ball |
| `this.shoot(targetId, priority, reason)` | Shoot at scoring target |
| `this.climb(priority, reason)` | Climb (endgame only) |

### Modifying Game Rules

Edit `src/game/ScoringSystem.ts` to change scoring rules:

```typescript
export const DEFAULT_GAME_RULES: GameRules = {
  autoPoints: {
    low: 2,
    high: 4,
    climb: 0,
  },
  teleopPoints: {
    low: 1,
    high: 2,
    climb: 0,
  },
  endgamePoints: {
    climb: 25,
    park: 5,
  },
  penalties: {
    foul: -3,
    techFoul: -15,
  },
};
```

Edit `src/types/simulation.ts` to change phase timing:

```typescript
export const DEFAULT_PHASE_TIMING: PhaseTiming = {
  auto: 20,        // 20 seconds autonomous
  transition: 10,  // 10 seconds transition (all can score)
  shift1: 25,      // 25 seconds - ODD alliance scores
  shift2: 25,      // 25 seconds - EVEN alliance scores
  shift3: 25,      // 25 seconds - ODD alliance scores
  shift4: 25,      // 25 seconds - EVEN alliance scores
  endgame: 30,     // 30 seconds endgame (all can score)
};
```

### Modifying Physics

**Robot Movement** (`src/robot/Movement.ts`):
- `updateRobotMovement()` - Main movement function
- Adjust acceleration curves, turn rates, terrain effects

**Ball Physics** (`src/ball/BallPhysics.ts`):
- `updateBallPhysics()` - Flight and ground physics
- `calculateShotVelocity()` - Shot trajectory calculation
- Adjust gravity, air resistance, ground friction

```typescript
// Default ball physics (in src/types/simulation.ts)
export const DEFAULT_SIMULATION_CONFIG = {
  ballPhysics: {
    gravity: 386.4,       // in/s² (Earth gravity in inches)
    airResistance: 0.99,  // Velocity retention per second
    groundFriction: 0.95, // Ground friction coefficient
    minVelocity: 1,       // Stop threshold (in/s)
  }
};
```

---

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run test/field/Field.test.ts

# Run tests in watch mode
npx vitest
```

## License

MIT
