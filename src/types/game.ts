import type { Ball } from './ball.js';
import type { Position } from './field.js';
import type { RobotState } from './robot.js';

/**
 * Match phase
 */
export enum MatchPhase {
  /** Before match starts */
  PRE_MATCH = 'PRE_MATCH',
  /** Autonomous period (15 seconds typical) */
  AUTO = 'AUTO',
  /** Pause between auto and teleop */
  TRANSITION = 'TRANSITION',
  /** Teleoperated period */
  TELEOP = 'TELEOP',
  /** End game period (last 30 seconds of teleop typically) */
  ENDGAME = 'ENDGAME',
  /** Match has ended */
  POST_MATCH = 'POST_MATCH',
}

/**
 * Event types that can occur during a match
 */
export enum GameEventType {
  MATCH_START = 'MATCH_START',
  PHASE_CHANGE = 'PHASE_CHANGE',
  BALL_PICKED_UP = 'BALL_PICKED_UP',
  BALL_SHOT = 'BALL_SHOT',
  BALL_SCORED = 'BALL_SCORED',
  BALL_MISSED = 'BALL_MISSED',
  BALL_PASSED = 'BALL_PASSED',
  BALL_RECEIVED = 'BALL_RECEIVED',
  ROBOT_CLIMB_START = 'ROBOT_CLIMB_START',
  ROBOT_CLIMB_SUCCESS = 'ROBOT_CLIMB_SUCCESS',
  ROBOT_DISABLED = 'ROBOT_DISABLED',
  ROBOT_ENABLED = 'ROBOT_ENABLED',
  PENALTY = 'PENALTY',
  MATCH_END = 'MATCH_END',
}

/**
 * Game event
 */
export interface GameEvent {
  id: string;
  type: GameEventType;
  tick: number;
  timestamp: number;
  phase: MatchPhase;
  alliance?: 'red' | 'blue';
  robotId?: string;
  ballId?: string;
  scoringTargetId?: string;
  points?: number;
  position?: Position;
  details?: Record<string, unknown>;
}

/**
 * Alliance score breakdown
 */
export interface AllianceScore {
  /** Points from autonomous period */
  auto: number;
  /** Points from teleop period */
  teleop: number;
  /** Points from endgame (climbing) */
  endgame: number;
  /** Penalty points (added to score) */
  penalties: number;
  /** Total score */
  total: number;
  /** Detailed breakdown by scoring target */
  breakdown: Record<string, number>;
}

/**
 * Match scores
 */
export interface Score {
  red: AllianceScore;
  blue: AllianceScore;
}

/**
 * Phase timing configuration
 */
export interface PhaseTiming {
  /** Duration in seconds */
  auto: number;
  /** Transition duration in seconds */
  transition: number;
  /** Teleop duration in seconds */
  teleop: number;
  /** Endgame starts this many seconds before teleop ends */
  endgameStart: number;
}

/**
 * Game rules configuration
 */
export interface GameRules {
  timing: PhaseTiming;
  /** Points for climbing */
  climbPoints: number;
  /** Penalty points */
  penaltyPoints: number;
  /** Maximum balls on field */
  maxBallsOnField: number;
}

/**
 * Complete game state at a point in time
 */
export interface GameState {
  /** Current simulation tick */
  tick: number;
  /** Elapsed time in seconds */
  elapsedTime: number;
  /** Current match phase */
  phase: MatchPhase;
  /** Time remaining in current phase (seconds) */
  phaseTimeRemaining: number;
  /** All robots */
  robots: RobotState[];
  /** All balls */
  balls: Ball[];
  /** Current scores */
  score: Score;
  /** Events this tick */
  events: GameEvent[];
  /** Match paused */
  paused: boolean;
}

/**
 * Match result
 */
export interface MatchResult {
  /** Final scores */
  score: Score;
  /** Winner alliance or null for tie */
  winner: 'red' | 'blue' | null;
  /** All events from the match */
  events: GameEvent[];
  /** Match duration in ticks */
  totalTicks: number;
  /** Match duration in seconds */
  totalTime: number;
}
