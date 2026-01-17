// Main entry point for FRC Score Simulator

// Types
export * from './types/index.js';

// Field
export { Field } from './field/Field.js';
export { loadFieldFromFile, loadFieldFromJSON, createField, validateFieldConfig } from './field/FieldLoader.js';
export {
  calculateMovementCost,
  calculateDynamicCost,
  heuristic,
  octileHeuristic,
  DEFAULT_COST_OPTIONS,
} from './field/CostFunction.js';
export type { CostOptions } from './field/CostFunction.js';

// Robot
export { Robot, createRobotState } from './robot/Robot.js';
export {
  parseRobotMarkdown,
  loadRobotFromFile,
  createDefaultRobotConfig,
  validateRobotConfig,
} from './robot/RobotLoader.js';
export {
  updateRobotMovement,
  areRobotsColliding,
  separateRobots,
} from './robot/Movement.js';
export type { MovementResult } from './robot/Movement.js';

// Pathfinding
export { AStar, createPathfinder, DEFAULT_PATHFINDING_OPTIONS } from './pathfinding/AStar.js';
export type { PathfindingOptions, PathResult } from './pathfinding/AStar.js';
export { PriorityQueue, createPathNode, positionKey } from './pathfinding/PathNode.js';
export type { PathNode } from './pathfinding/PathNode.js';

// Ball
export { Ball, createBall } from './ball/Ball.js';
export {
  updateBallPhysics,
  calculateShotVelocity,
  calculatePassVelocity,
  isInPickupRange,
  DEFAULT_BALL_PHYSICS,
} from './ball/BallPhysics.js';
export type { BallUpdateResult } from './ball/BallPhysics.js';

// Game
export { GameClock, DEFAULT_PHASE_TIMING } from './game/GameClock.js';
export {
  ScoringSystem,
  createScore,
  createAllianceScore,
  DEFAULT_GAME_RULES,
} from './game/ScoringSystem.js';
export { Match } from './game/Match.js';

// Simulation
export { SimulationEngine } from './simulation/SimulationEngine.js';
export { EventBus, SimulationEvents } from './simulation/EventBus.js';
export type { EventHandler, SimulationEventType } from './simulation/EventBus.js';
export { MatchRecorder } from './simulation/MatchRecorder.js';
export type { RecordedFrame, MatchRecording } from './simulation/MatchRecorder.js';

// Strategy
export { BaseStrategy } from './strategy/BaseStrategy.js';
export { StrategyManager, globalStrategyManager } from './strategy/StrategyManager.js';
export { IdleStrategy } from './strategy/builtin/IdleStrategy.js';
export { CollectorStrategy } from './strategy/builtin/CollectorStrategy.js';
export { ScorerStrategy } from './strategy/builtin/ScorerStrategy.js';
export { AutoClimbStrategy } from './strategy/builtin/AutoClimbStrategy.js';
export { EndgameClimberStrategy } from './strategy/builtin/EndgameClimberStrategy.js';

// Visualization
export { VisualizationServer } from './visualization/WebSocketServer.js';
export type { WSMessage, WSMessageType, ConfigMessage, ControlHandler } from './visualization/WebSocketServer.js';

// Distributed
export { WorldServer, WorldServerEvents } from './distributed/WorldServer.js';
export { RobotClient } from './distributed/RobotClient.js';
export type { RobotClientConfig, RobotClientEventHandlers } from './distributed/RobotClient.js';
export { TickBarrier } from './distributed/TickBarrier.js';
export type { BarrierResult, TickBarrierConfig } from './distributed/TickBarrier.js';
export { MessagePacker, ErrorCodes } from './distributed/MessagePacker.js';

// Utilities
export {
  Vector2D,
  angleDifference,
  normalizeAngle,
  toRadians,
  toDegrees,
  clamp,
} from './utils/Vector2D.js';
export {
  parseMarkdown,
  findSection,
  parseNumericValue,
  parseBooleanValue,
  getRequiredValue,
  getOptionalValue,
} from './utils/MarkdownParser.js';
export type { ParsedSection } from './utils/MarkdownParser.js';

// Convenience function to run a complete simulation
import type { MatchResult, MatchSetup, SimulationConfig } from './types/index.js';
import { SimulationMode, DEFAULT_SIMULATION_CONFIG, ZoneType } from './types/index.js';
import { loadFieldFromFile } from './field/FieldLoader.js';
import { loadRobotFromFile, createDefaultRobotConfig } from './robot/RobotLoader.js';
import { SimulationEngine } from './simulation/SimulationEngine.js';
import { IdleStrategy } from './strategy/builtin/IdleStrategy.js';
import { CollectorStrategy } from './strategy/builtin/CollectorStrategy.js';
import { ScorerStrategy } from './strategy/builtin/ScorerStrategy.js';
import { AutoClimbStrategy } from './strategy/builtin/AutoClimbStrategy.js';
import { EndgameClimberStrategy } from './strategy/builtin/EndgameClimberStrategy.js';
import { VisualizationServer } from './visualization/WebSocketServer.js';

/**
 * Create a simulation with default settings
 */
export async function createSimulation(
  fieldPath: string,
  robotPaths: string[],
  config?: Partial<SimulationConfig>
): Promise<SimulationEngine> {
  const field = await loadFieldFromFile(fieldPath);
  const robots = await Promise.all(robotPaths.map(loadRobotFromFile));

  const setup: MatchSetup = {
    field: field.config,
    robots: robots.map((r, i) => ({
      config: r,
      alliance: i % 2 === 0 ? 'red' : 'blue',
      strategy: r.defaultStrategy,
    })),
    simulation: { ...DEFAULT_SIMULATION_CONFIG, ...config },
  };

  const engine = new SimulationEngine(setup);

  // Register built-in strategies
  engine.registerStrategy(new IdleStrategy());
  engine.registerStrategy(new CollectorStrategy());
  engine.registerStrategy(new ScorerStrategy());
  engine.registerStrategy(new AutoClimbStrategy());
  engine.registerStrategy(new EndgameClimberStrategy());

  return engine;
}

/**
 * Run a headless simulation
 */
export async function runHeadlessMatch(
  fieldPath: string,
  robotPaths: string[]
): Promise<MatchResult> {
  const engine = await createSimulation(fieldPath, robotPaths, {
    mode: SimulationMode.HEADLESS,
  });
  return engine.start();
}

/**
 * Run a real-time simulation with WebSocket visualization
 */
export async function runRealtimeMatch(
  fieldPath: string,
  robotPaths: string[],
  wsPort: number = 8080
): Promise<{ engine: SimulationEngine; server: VisualizationServer }> {
  const engine = await createSimulation(fieldPath, robotPaths, {
    mode: SimulationMode.REALTIME,
    wsPort,
  });

  const server = new VisualizationServer(wsPort);
  await server.start();
  server.attachEngine(engine);

  return { engine, server };
}

/**
 * Quick demo - create a match with default robots
 */
export function createDemoSetup(): MatchSetup {
  const ballSpawnPoints: Array<{ id: string; position: { x: number; y: number }; alliance: null }> = [];
  let ballId = 1;

  // === CENTER BALLS: 12 columns × 30 rows = 360 balls ===
  const cols = 12;
  const rows = 30;
  const hSpacing = 10; // inches between balls horizontally
  const vSpacing = 10; // inches between balls vertically
  const startX = 324 - ((cols - 1) * hSpacing) / 2; // center horizontally
  const startY = 162 - ((rows - 1) * vSpacing) / 2; // center vertically

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const x = startX + col * hSpacing;
      const y = startY + row * vSpacing;
      ballSpawnPoints.push({ id: `center-${ballId++}`, position: { x, y }, alliance: null });
    }
  }

  // === SIDE BALLS: 4 groups of 4×6 = 96 balls ===
  // Helper to create a 4×6 ball grid
  const createBallGrid = (centerY: number, startX: number, xDirection: number, prefix: string) => {
    const gridCols = 4;
    const gridRows = 6;
    const spacing = 5; // 5" ball diameter

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        // X: start from wall, go inward
        const x = startX + xDirection * (col * spacing + 2.5);
        // Y: center around centerY
        const y = centerY - ((gridRows - 1) * spacing) / 2 + row * spacing;
        ballSpawnPoints.push({ id: `${prefix}-${ballId++}`, position: { x, y }, alliance: null });
      }
    }
  };

  // Right side balls (against right wall, X = 648)
  // Bottom group: centered at Y = 82.32"
  createBallGrid(82.32, 648, -1, 'right-bottom');
  // Top group: centered at Y = 291.02" (82.32 + 87.46 + 121.24)
  createBallGrid(291.02, 648, -1, 'right-top');

  // Left side balls (against left wall, X = 0) - mirrored about Y = 162
  // Top group (mirror of right bottom): centered at Y = 324 - 82.32 = 241.68"
  createBallGrid(241.68, 0, 1, 'left-top');
  // Bottom group (mirror of right top): centered at Y = 324 - 291.02 = 32.98"
  createBallGrid(32.98, 0, 1, 'left-bottom');

  // Field structure positions:
  // Left side centered at X = 181.56", Right side mirrored at X = 466.44"
  // From top wall (Y=324) going down: trench, barrier, ramp, scoring area, ramp, barrier, trench
  const leftCenterX = 181.56;
  const rightCenterX = 648 - 181.56; // 466.44

  // Y positions from top to bottom
  // Trench: 49.86" in Y, Barrier: 12" in Y, Ramp: 73" in Y, Scoring: 47" in Y
  const trench1Top = 324;
  const trench1Bottom = 324 - 49.86; // 274.14
  const barrier1Top = trench1Bottom;
  const barrier1Bottom = barrier1Top - 12; // 262.14
  const ramp1Top = barrier1Bottom;
  const ramp1Bottom = ramp1Top - 73; // 189.14 (ramp is 73" in Y)
  const scoringTop = ramp1Bottom;
  const scoringBottom = scoringTop - 47; // 142.14
  const ramp2Top = scoringBottom;
  const ramp2Bottom = ramp2Top - 73; // 69.14 (ramp is 73" in Y)
  const barrier2Top = ramp2Bottom;
  const barrier2Bottom = barrier2Top - 12; // 57.14
  const trench2Top = barrier2Bottom;
  const trench2Bottom = Math.max(0, trench2Top - 49.86); // 7.28

  // X widths
  const rampWidth = 73;
  const barrierWidth = 47; // 47" in X dimension
  const scoringWidth = 47;
  const trenchWidth = 73; // Same as ramp

  const fieldConfig = {
    name: 'Demo Field',
    year: 2025,
    width: 648,
    height: 324,
    cellSize: 1,
    zones: [
      // === CLIMBING ZONES ===
      // Red climbing apparatus: center at X=67.3", Y=154.22", 24" wide × 47" tall
      {
        name: 'Red Climbing Apparatus',
        type: ZoneType.CLIMBING,
        bounds: { minX: 55, maxX: 79, minY: 131, maxY: 178 },
      },
      // Blue climbing apparatus: center at X=580.7", Y=169.78", 24" wide × 47" tall
      {
        name: 'Blue Climbing Apparatus',
        type: ZoneType.CLIMBING,
        bounds: { minX: 569, maxX: 593, minY: 146, maxY: 193 },
      },

      // === LEFT SIDE STRUCTURES (centered at X = 181.56") ===
      // Trench 1 (top) - 22.25" max height
      {
        name: 'Left Trench Top',
        type: ZoneType.TRENCH,
        bounds: {
          minX: leftCenterX - trenchWidth / 2,
          maxX: leftCenterX + trenchWidth / 2,
          minY: trench1Bottom,
          maxY: trench1Top,
        },
        modifiers: { maxHeight: 22.25 },
      },
      // Barrier 1 (top) - obstacle
      {
        name: 'Left Barrier Top',
        type: ZoneType.OBSTACLE,
        bounds: {
          minX: leftCenterX - barrierWidth / 2,
          maxX: leftCenterX + barrierWidth / 2,
          minY: barrier1Bottom,
          maxY: barrier1Top,
        },
      },
      // Ramp 1 (top)
      {
        name: 'Left Ramp Top',
        type: ZoneType.RAMP,
        bounds: {
          minX: leftCenterX - rampWidth / 2,
          maxX: leftCenterX + rampWidth / 2,
          minY: ramp1Bottom,
          maxY: ramp1Top,
        },
        modifiers: { speedMultiplier: 0.7, rampHeight: 6 },
      },
      // Scoring Area (center) - blocks ball passage
      {
        name: 'Left Scoring Area',
        type: ZoneType.SCORING_ZONE,
        bounds: {
          minX: leftCenterX - scoringWidth / 2,
          maxX: leftCenterX + scoringWidth / 2,
          minY: scoringBottom,
          maxY: scoringTop,
        },
        modifiers: { blocksBalls: true },
      },
      // Ramp 2 (bottom)
      {
        name: 'Left Ramp Bottom',
        type: ZoneType.RAMP,
        bounds: {
          minX: leftCenterX - rampWidth / 2,
          maxX: leftCenterX + rampWidth / 2,
          minY: ramp2Bottom,
          maxY: ramp2Top,
        },
        modifiers: { speedMultiplier: 0.7, rampHeight: 6 },
      },
      // Barrier 2 (bottom) - obstacle
      {
        name: 'Left Barrier Bottom',
        type: ZoneType.OBSTACLE,
        bounds: {
          minX: leftCenterX - barrierWidth / 2,
          maxX: leftCenterX + barrierWidth / 2,
          minY: barrier2Bottom,
          maxY: barrier2Top,
        },
      },
      // Trench 2 (bottom) - 22.25" max height
      {
        name: 'Left Trench Bottom',
        type: ZoneType.TRENCH,
        bounds: {
          minX: leftCenterX - trenchWidth / 2,
          maxX: leftCenterX + trenchWidth / 2,
          minY: trench2Bottom,
          maxY: trench2Top,
        },
        modifiers: { maxHeight: 22.25 },
      },

      // === RIGHT SIDE STRUCTURES (mirrored, centered at X = 466.44") ===
      // Trench 1 (top) - 22.25" max height
      {
        name: 'Right Trench Top',
        type: ZoneType.TRENCH,
        bounds: {
          minX: rightCenterX - trenchWidth / 2,
          maxX: rightCenterX + trenchWidth / 2,
          minY: trench1Bottom,
          maxY: trench1Top,
        },
        modifiers: { maxHeight: 22.25 },
      },
      // Barrier 1 (top) - obstacle
      {
        name: 'Right Barrier Top',
        type: ZoneType.OBSTACLE,
        bounds: {
          minX: rightCenterX - barrierWidth / 2,
          maxX: rightCenterX + barrierWidth / 2,
          minY: barrier1Bottom,
          maxY: barrier1Top,
        },
      },
      // Ramp 1 (top)
      {
        name: 'Right Ramp Top',
        type: ZoneType.RAMP,
        bounds: {
          minX: rightCenterX - rampWidth / 2,
          maxX: rightCenterX + rampWidth / 2,
          minY: ramp1Bottom,
          maxY: ramp1Top,
        },
        modifiers: { speedMultiplier: 0.7, rampHeight: 6 },
      },
      // Scoring Area (center) - blocks ball passage
      {
        name: 'Right Scoring Area',
        type: ZoneType.SCORING_ZONE,
        bounds: {
          minX: rightCenterX - scoringWidth / 2,
          maxX: rightCenterX + scoringWidth / 2,
          minY: scoringBottom,
          maxY: scoringTop,
        },
        modifiers: { blocksBalls: true },
      },
      // Ramp 2 (bottom)
      {
        name: 'Right Ramp Bottom',
        type: ZoneType.RAMP,
        bounds: {
          minX: rightCenterX - rampWidth / 2,
          maxX: rightCenterX + rampWidth / 2,
          minY: ramp2Bottom,
          maxY: ramp2Top,
        },
        modifiers: { speedMultiplier: 0.7, rampHeight: 6 },
      },
      // Barrier 2 (bottom) - obstacle
      {
        name: 'Right Barrier Bottom',
        type: ZoneType.OBSTACLE,
        bounds: {
          minX: rightCenterX - barrierWidth / 2,
          maxX: rightCenterX + barrierWidth / 2,
          minY: barrier2Bottom,
          maxY: barrier2Top,
        },
      },
      // Trench 2 (bottom) - 22.25" max height
      {
        name: 'Right Trench Bottom',
        type: ZoneType.TRENCH,
        bounds: {
          minX: rightCenterX - trenchWidth / 2,
          maxX: rightCenterX + trenchWidth / 2,
          minY: trench2Bottom,
          maxY: trench2Top,
        },
        modifiers: { maxHeight: 22.25 },
      },

      // === NO-SCORE ZONE (middle 287" of field) ===
      {
        name: 'No Score Zone',
        type: ZoneType.NORMAL,
        bounds: {
          minX: 324 - 143.5, // 180.5
          maxX: 324 + 143.5, // 467.5
          minY: 0,
          maxY: 324,
        },
        modifiers: { noScoring: true },
      },
    ],
    ballSpawnPoints,
    scoringTargets: [
      // Red goal centered in left scoring area (48" diameter circle)
      // Scoring area center: X = 181.56", Y = (142.14 + 189.14) / 2 = 165.64"
      {
        id: 'red-goal',
        name: 'Red Goal',
        position: { x: leftCenterX, y: (scoringBottom + scoringTop) / 2 },
        radius: 24, // 48" diameter
        alliance: 'red' as const,
        points: { auto: 4, teleop: 2 },
      },
      // Blue goal centered in right scoring area (48" diameter circle)
      {
        id: 'blue-goal',
        name: 'Blue Goal',
        position: { x: rightCenterX, y: (scoringBottom + scoringTop) / 2 },
        radius: 24, // 48" diameter
        alliance: 'blue' as const,
        points: { auto: 4, teleop: 2 },
      },
    ],
    startingPositions: {
      // Red robots start on red side, past the edge of structures
      // Robot edge must be at most 181.56-23.5=158.06" from left wall
      // With 28" wide robots, center at X <= 144
      red: [
        { x: 100, y: 100 },
        { x: 100, y: 162 },
        { x: 100, y: 224 },
      ],
      // Blue robots start on blue side, past the edge of structures
      // Robot edge must be at least 648-158.06=489.94" from left wall
      // With 28" wide robots, center at X >= 504
      blue: [
        { x: 548, y: 100 },
        { x: 548, y: 162 },
        { x: 548, y: 224 },
      ],
    },
  };

  const baseConfig = createDefaultRobotConfig(1, 'Demo Robot');

  // Red alliance robots with varied climb capabilities
  const red1 = { ...baseConfig, id: 'red-1', autoClimb: true, climbLevel: 3, climbUpTime: 2.5 };
  const red2 = { ...baseConfig, id: 'red-2', autoClimb: false, climbLevel: 2, climbUpTime: 3.0 };
  const red3 = { ...baseConfig, id: 'red-3', autoClimb: true, climbLevel: 2, climbUpTime: 3.0 };

  // Blue alliance robots with varied climb capabilities
  const blue1 = { ...baseConfig, id: 'blue-1', autoClimb: true, climbLevel: 3, climbUpTime: 2.5 };
  const blue2 = { ...baseConfig, id: 'blue-2', autoClimb: false, climbLevel: 1, climbUpTime: 2.0 };
  const blue3 = { ...baseConfig, id: 'blue-3', autoClimb: false, climbLevel: 3, climbUpTime: 3.5 };

  return {
    field: fieldConfig,
    robots: [
      { config: red1, alliance: 'red', strategy: 'scorer', startingBalls: 8 },
      { config: red2, alliance: 'red', strategy: 'collector', startingBalls: 8 },
      { config: red3, alliance: 'red', strategy: 'scorer', startingBalls: 8 },
      { config: blue1, alliance: 'blue', strategy: 'scorer', startingBalls: 8 },
      { config: blue2, alliance: 'blue', strategy: 'collector', startingBalls: 8 },
      { config: blue3, alliance: 'blue', strategy: 'scorer', startingBalls: 8 },
    ],
    simulation: DEFAULT_SIMULATION_CONFIG,
  };
}

/**
 * Run a demo simulation
 */
export async function runDemo(): Promise<MatchResult> {
  const setup = createDemoSetup();
  setup.simulation.mode = SimulationMode.HEADLESS;

  const engine = new SimulationEngine(setup);
  engine.registerStrategy(new IdleStrategy());
  engine.registerStrategy(new CollectorStrategy());
  engine.registerStrategy(new ScorerStrategy());
  engine.registerStrategy(new AutoClimbStrategy());
  engine.registerStrategy(new EndgameClimberStrategy());

  return engine.start();
}
