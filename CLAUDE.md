# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build          # Compile TypeScript to dist/
npm test               # Run vitest test suite
npm run test:watch     # Run tests in watch mode
npm run serve          # Start WebSocket server + browser UI at http://localhost:3000
npm run demo           # Run headless simulation (fast, no UI)
npm run dev            # Run with tsx watch (auto-recompile)
```

Run a specific test file:
```bash
npx vitest run test/field/Field.test.ts
```

## Architecture Overview

This is an FRC (FIRST Robotics Competition) match simulator with ~60 FPS tick-based physics simulation.

### Core Loop (SimulationEngine)
The `SimulationEngine` orchestrates the main tick loop:
1. Strategy decisions are computed for each robot
2. Robot physics updated (movement, collision)
3. Ball physics updated (flight, ground friction, scoring detection)
4. Events published to EventBus
5. State broadcast to WebSocket clients (if real-time mode)

### Key Subsystems

**Game State** (`src/game/`):
- `Match.ts` - Central game state holder (robots, balls, events)
- `GameClock.ts` - Phase timing (AUTO → TRANSITION → 4 SHIFTs → ENDGAME)
- `ScoringSystem.ts` - Point calculation and parity determination

**Strategy System** (`src/strategy/`):
- Strategies implement `BaseStrategy.decide(context)` returning `StrategyDecision`
- `StrategyContext` provides game state, nearby balls, scoring targets, phase info
- Key property: `canScore` - whether alliance can score in current phase (shift-based scoring)
- Built-in: `IdleStrategy`, `CollectorStrategy`, `ScorerStrategy`, `AutoClimbStrategy`, `EndgameClimberStrategy`

**Physics**:
- Robot: velocity-based movement with acceleration limits, A* pathfinding (`src/robot/Movement.ts`)
- Ball: gravity (386.4 in/s²), air resistance, ground friction (`src/ball/BallPhysics.ts`)

**Field** (`src/field/`):
- 648×324 inch grid (standard FRC field)
- Zone types: NORMAL, RAMP (speed penalty), TRENCH (height check), CLIMBING, SCORING_ZONE

### Shift-Based Scoring (Unique Game Mechanic)
Alliances get EVEN or ODD parity based on AUTO scoring. During teleop shifts:
- EVEN parity: scores during Shift 2 & 4
- ODD parity: scores during Shift 1 & 3
- TRANSITION and ENDGAME: both alliances can score

### Data Formats
- Fields: JSON in `data/fields/`
- Robots: Markdown in `data/robots/` (parsed by `MarkdownParser.ts`)

### Event-Driven Communication
`EventBus` (pub/sub) handles: `tick`, `ball_scored`, `ball_picked_up`, `ball_shot`, `phase_change`
`VisualizationServer` broadcasts state via WebSocket on port 8080.
