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

// Visualization
export { VisualizationServer } from './visualization/WebSocketServer.js';
export type { WSMessage, WSMessageType, ConfigMessage, ControlHandler } from './visualization/WebSocketServer.js';

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
  // Generate ball spawn points spread across the field
  const ballSpawnPoints = [];
  let ballId = 1;

  // Center line balls (neutral) - at field midline x=324
  for (let y = 54; y <= 270; y += 54) {
    ballSpawnPoints.push({ id: `ball-${ballId++}`, position: { x: 324, y }, alliance: null });
  }

  // Red side balls - between red climb (x=42) and red goal (x=162)
  for (let x = 70; x <= 130; x += 30) {
    for (let y = 81; y <= 243; y += 81) {
      ballSpawnPoints.push({ id: `ball-${ballId++}`, position: { x, y }, alliance: null });
    }
  }

  // Red-center balls - between red goal (x=162) and center (x=324)
  for (let x = 220; x <= 280; x += 30) {
    for (let y = 108; y <= 216; y += 108) {
      ballSpawnPoints.push({ id: `ball-${ballId++}`, position: { x, y }, alliance: null });
    }
  }

  // Blue-center balls - between center (x=324) and blue goal (x=486)
  for (let x = 368; x <= 428; x += 30) {
    for (let y = 108; y <= 216; y += 108) {
      ballSpawnPoints.push({ id: `ball-${ballId++}`, position: { x, y }, alliance: null });
    }
  }

  // Blue side balls - between blue goal (x=486) and blue climb (x=606)
  for (let x = 518; x <= 578; x += 30) {
    for (let y = 81; y <= 243; y += 81) {
      ballSpawnPoints.push({ id: `ball-${ballId++}`, position: { x, y }, alliance: null });
    }
  }

  // Field layout:
  // - Red side: x = 0 to 324, Blue side: x = 324 to 648
  // - Red midline (1/4 field): x = 162
  // - Blue midline (3/4 field): x = 486
  // - Goals at each side's midline
  // - Climbing apparatus at field ends (42" wide = 3.5')
  const fieldConfig = {
    name: 'Demo Field',
    year: 2025,
    width: 648,
    height: 324,
    cellSize: 1,
    zones: [
      // Red climbing apparatus at red end (x=0-42, 3.5' wide)
      {
        name: 'Red Climbing Apparatus',
        type: ZoneType.CLIMBING,
        bounds: { minX: 0, maxX: 42, minY: 120, maxY: 204 }, // centered vertically
      },
      // Blue climbing apparatus at blue end (x=606-648, 3.5' wide)
      {
        name: 'Blue Climbing Apparatus',
        type: ZoneType.CLIMBING,
        bounds: { minX: 606, maxX: 648, minY: 120, maxY: 204 }, // centered vertically
      },
    ],
    ballSpawnPoints,
    scoringTargets: [
      // Red goal at red side midline (1/4 of field)
      {
        id: 'red-goal',
        name: 'Red Goal',
        position: { x: 162, y: 162 },
        radius: 24,
        alliance: 'red' as const,
        points: { auto: 4, teleop: 2 },
      },
      // Blue goal at blue side midline (3/4 of field)
      {
        id: 'blue-goal',
        name: 'Blue Goal',
        position: { x: 486, y: 162 },
        radius: 24,
        alliance: 'blue' as const,
        points: { auto: 4, teleop: 2 },
      },
    ],
    startingPositions: {
      // Red robots start at red side midline
      red: [
        { x: 162, y: 80 },
        { x: 162, y: 162 },
        { x: 162, y: 244 },
      ],
      // Blue robots start at blue side midline
      blue: [
        { x: 486, y: 80 },
        { x: 486, y: 162 },
        { x: 486, y: 244 },
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
      { config: red1, alliance: 'red', strategy: 'scorer' },
      { config: red2, alliance: 'red', strategy: 'collector' },
      { config: red3, alliance: 'red', strategy: 'scorer' },
      { config: blue1, alliance: 'blue', strategy: 'scorer' },
      { config: blue2, alliance: 'blue', strategy: 'collector' },
      { config: blue3, alliance: 'blue', strategy: 'scorer' },
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

  return engine.start();
}
