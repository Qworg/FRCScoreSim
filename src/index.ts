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
import { SimulationMode, DEFAULT_SIMULATION_CONFIG } from './types/index.js';
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
  const fieldConfig = {
    name: 'Demo Field',
    year: 2024,
    width: 648,
    height: 324,
    cellSize: 1,
    zones: [],
    ballSpawnPoints: [
      { id: 'ball-1', position: { x: 200, y: 162 }, alliance: null },
      { id: 'ball-2', position: { x: 324, y: 100 }, alliance: null },
      { id: 'ball-3', position: { x: 324, y: 224 }, alliance: null },
      { id: 'ball-4', position: { x: 448, y: 162 }, alliance: null },
    ],
    scoringTargets: [
      {
        id: 'red-goal',
        name: 'Red Goal',
        position: { x: 24, y: 162 },
        radius: 24,
        alliance: 'red' as const,
        points: { auto: 4, teleop: 2 },
      },
      {
        id: 'blue-goal',
        name: 'Blue Goal',
        position: { x: 624, y: 162 },
        radius: 24,
        alliance: 'blue' as const,
        points: { auto: 4, teleop: 2 },
      },
    ],
    startingPositions: {
      red: [
        { x: 96, y: 100 },
        { x: 96, y: 162 },
        { x: 96, y: 224 },
      ],
      blue: [
        { x: 552, y: 100 },
        { x: 552, y: 162 },
        { x: 552, y: 224 },
      ],
    },
  };

  const robotConfig = createDefaultRobotConfig(1, 'Demo Robot');

  return {
    field: fieldConfig,
    robots: [
      { config: { ...robotConfig, id: 'red-1' }, alliance: 'red', strategy: 'scorer' },
      { config: { ...robotConfig, id: 'red-2' }, alliance: 'red', strategy: 'collector' },
      { config: { ...robotConfig, id: 'blue-1' }, alliance: 'blue', strategy: 'scorer' },
      { config: { ...robotConfig, id: 'blue-2' }, alliance: 'blue', strategy: 'collector' },
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
