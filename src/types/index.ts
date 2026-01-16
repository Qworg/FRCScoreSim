// Field types
export type {
  Position,
  GridPosition,
  ZoneModifiers,
  Cell,
  ZoneDefinition,
  BallSpawnPoint,
  ScoringTarget,
  FieldConfig,
} from './field.js';
export { ZoneType } from './field.js';

// Robot types
export type {
  RobotConfig,
  RobotAction,
  RobotState,
  RobotCommand,
} from './robot.js';
export { RobotActionType } from './robot.js';

// Ball types
export type {
  BallVelocity,
  Ball,
  BallPhysicsConfig,
} from './ball.js';
export { BallState } from './ball.js';

// Game types
export type {
  GameEvent,
  AllianceScore,
  Score,
  PhaseTiming,
  GameRules,
  GameState,
  MatchResult,
} from './game.js';
export { MatchPhase, GameEventType } from './game.js';

// Simulation types
export type {
  SimulationConfig,
  RobotSetup,
  MatchSetup,
} from './simulation.js';
export { SimulationMode, DEFAULT_SIMULATION_CONFIG } from './simulation.js';

// Strategy types
export type {
  StrategyContext,
  StrategyDecision,
  Strategy,
  StrategyFactory,
  StrategyRegistryEntry,
} from './strategy.js';
export { StrategyPriority } from './strategy.js';
