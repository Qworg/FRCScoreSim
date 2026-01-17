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
  ShiftParity,
  RankingPoints,
} from './game.js';
export { MatchPhase, GameEventType } from './game.js';

// Simulation types
export type {
  SimulationConfig,
  RobotSetup,
  MatchSetup,
  StuckState,
  ObstacleInfo,
  EscapeAction,
} from './simulation.js';
export { SimulationMode, DEFAULT_SIMULATION_CONFIG, EscapeStrategy } from './simulation.js';

// Strategy types
export type {
  StrategyContext,
  StrategyDecision,
  Strategy,
  StrategyFactory,
  StrategyRegistryEntry,
} from './strategy.js';
export { StrategyPriority } from './strategy.js';

// Logging types
export type {
  DecisionLogEntry,
  DecisionLogStats,
  DecisionInfo,
  ExecutionInfo,
} from './logging.js';
export { DecisionRejectionReason } from './logging.js';

// Valuation types
export type {
  ActionValueFactors,
  EvaluatedAction,
  ValuatorConfig,
  ActionCandidate,
} from './valuation.js';
export { DEFAULT_VALUATOR_CONFIG } from './valuation.js';

// Distributed types
export type {
  DistributedConfig,
  WireRobotState,
  WireBallState,
  WireWorldState,
  WireRobotCommand,
  WireMessage,
  ClientHelloPayload,
  FieldConfigPayload,
  TickUpdatePayload,
  RobotCommandPayload,
  MatchEndPayload,
  ErrorPayload,
} from './distributed.js';
export {
  ExecutionMode,
  DistributedMessageType,
  WireMatchPhase,
  WireRobotActionType,
  WireBallStateEnum,
  WireShiftParity,
  WireAlliance,
  DEFAULT_DISTRIBUTED_CONFIG,
  PROTOCOL_VERSION,
  matchPhaseToWire,
  wireToMatchPhase,
  robotActionToWire,
  wireToRobotAction,
  shiftParityToWire,
  wireToShiftParity,
  allianceToWire,
  wireToAlliance,
} from './distributed.js';
