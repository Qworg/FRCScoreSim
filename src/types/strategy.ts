import type { Ball } from './ball.js';
import type { FieldConfig, Position, ScoringTarget } from './field.js';
import type { GameState, MatchPhase, ShiftParity } from './game.js';
import type { RobotCommand, RobotState } from './robot.js';

/**
 * Context provided to strategies for decision making
 */
export interface StrategyContext {
  /** Current game state */
  gameState: GameState;
  /** This robot's state */
  robot: RobotState;
  /** Field configuration */
  field: FieldConfig;
  /** Teammate robots */
  teammates: RobotState[];
  /** Opponent robots */
  opponents: RobotState[];
  /** Available balls on field */
  availableBalls: Ball[];
  /** Balls held by teammates */
  teammateBalls: Ball[];
  /** Scoring targets for this alliance */
  scoringTargets: ScoringTarget[];
  /** Distance to nearest ball */
  nearestBallDistance: number | null;
  /** Nearest ball */
  nearestBall: Ball | null;
  /** Distance to nearest scoring target */
  nearestScoringTargetDistance: number | null;
  /** Nearest scoring target */
  nearestScoringTarget: ScoringTarget | null;
  /** Whether in shooting range of any target */
  inShootingRange: boolean;
  /** Current phase */
  phase: MatchPhase;
  /** Time remaining in phase */
  phaseTimeRemaining: number;
  /** Current shift number (1-4) or null if not in a shift */
  currentShift: number | null;
  /** This alliance's shift parity (null until after auto) */
  allianceParity: ShiftParity | null;
  /** Whether this alliance can score during the current phase */
  canScore: boolean;
  /** Whether this robot can auto-climb (config + hasn't already) */
  canAutoClimb: boolean;
  /** Whether the alliance has auto-climb slots available */
  allianceCanAutoClimb: boolean;
  /** Whether the alliance has endgame climb slots available */
  allianceCanEndgameClimb: boolean;
  /** Number of alliance robots that have auto-climbed */
  allianceAutoClimbCount: number;
  /** Number of alliance robots that have endgame-climbed */
  allianceEndgameClimbCount: number;
  /** Whether robot is near its alliance's climbing zone */
  isNearClimbingZone: boolean;
  /** Position of the alliance's climbing zone center */
  climbingZonePosition: Position | null;
}

/**
 * Priority levels for decisions
 */
export enum StrategyPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

/**
 * Strategy decision output
 */
export interface StrategyDecision {
  /** Command to execute */
  command: RobotCommand;
  /** Priority of this decision */
  priority: StrategyPriority;
  /** Reason for this decision (for debugging) */
  reason: string;
}

/**
 * Strategy interface
 */
export interface Strategy {
  /** Unique strategy identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Strategy description */
  readonly description: string;

  /**
   * Initialize strategy for a match
   * @param context Initial context
   */
  initialize(context: StrategyContext): void;

  /**
   * Make a decision based on current context
   * @param context Current game context
   * @returns Decision with command and priority
   */
  decide(context: StrategyContext): StrategyDecision;

  /**
   * Reset strategy state between matches
   */
  reset(): void;
}

/**
 * Strategy factory function type
 */
export type StrategyFactory = () => Strategy;

/**
 * Strategy registry entry
 */
export interface StrategyRegistryEntry {
  id: string;
  name: string;
  description: string;
  factory: StrategyFactory;
}
