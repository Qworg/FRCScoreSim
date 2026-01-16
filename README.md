# FRC Score Simulator

A TypeScript-based FRC (FIRST Robotics Competition) robot match simulator with configurable fields, robot characteristics, A* pathfinding, and strategy/AI systems.

## Features

- **Field System**: Configurable field grid with zones, obstacles, and scoring targets
- **Robot Physics**: Realistic movement with acceleration, velocity, and collision handling
- **Ball Physics**: Flight trajectories, ground friction, and scoring detection
- **Pathfinding**: A* algorithm with terrain cost calculations
- **Strategy System**: Pluggable AI strategies (Collector, Scorer, Idle)
- **Game Phases**: AUTO, TELEOP, and ENDGAME with configurable timing
- **WebSocket Visualization**: Real-time state broadcast for external UI clients

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

**Features:**
- Real-time field visualization with robots and balls
- Play/Pause/Step controls for simulation
- Live scoreboard with breakdown
- Match phase and time display
- Event log

**Controls:**
| Button | Keyboard | Action |
|--------|----------|--------|
| Play | Space | Start simulation |
| Pause | Space | Pause simulation |
| Step | Right Arrow | Advance one tick |
| Reset | Ctrl+R | Reset to new match |

**Color Legend:**
- **Red rectangles**: Red alliance robots
- **Blue rectangles**: Blue alliance robots
- **Yellow circles**: Balls
- **Colored rings**: Scoring goals

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
│   ├── GameClock.ts    # Phase timing (AUTO/TELEOP/ENDGAME)
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
| `topSpeed` | Maximum speed (in/s) | 120 |
| `acceleration` | Acceleration rate (in/s²) | 100 |
| `turnRate` | Turn speed (deg/s) | 180 |
| `shootingRange` | Max shooting distance (in) | 240 |
| `shootingAccuracy` | Shot success rate (0-1) | 0.7 |
| `ballCapacity` | Max balls held | 5 |
| `pickupTime` | Seconds to pick up ball | 0.5 |
| `shootTime` | Seconds to shoot ball | 0.3 |
| `canClimb` | Can climb in endgame | true |
| `canPass` | Can pass to teammates | true |

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
    const { robot, nearestBall, nearestBallDistance, inShootingRange, phase } = context;

    // Always try to shoot if we have balls and are in range
    if (robot.heldBalls.length > 0 && inShootingRange && context.nearestScoringTarget) {
      return this.shoot(
        context.nearestScoringTarget.id,
        StrategyPriority.CRITICAL,
        'Shooting immediately'
      );
    }

    // Move to shooting position if we have balls
    if (robot.heldBalls.length > 0 && context.nearestScoringTarget) {
      return this.moveTo(
        context.nearestScoringTarget.position.x,
        context.nearestScoringTarget.position.y,
        StrategyPriority.HIGH,
        'Moving to shoot'
      );
    }

    // Collect balls
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

Edit `src/game/GameClock.ts` to change phase timing:

```typescript
export const DEFAULT_PHASE_TIMING: PhaseTiming = {
  auto: 15,           // 15 seconds autonomous
  transition: 3,      // 3 second transition
  teleop: 135,        // 135 seconds teleoperated
  endgameStart: 30,   // Endgame starts 30 seconds before end
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
