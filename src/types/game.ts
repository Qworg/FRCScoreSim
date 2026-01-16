import type { Ball } from './ball.js';
import type { Position } from './field.js';
import type { RobotState } from './robot.js';

/**
 * Match phase
 */
export enum MatchPhase {
  /** Before match starts */
  PRE_MATCH = 'PRE_MATCH',
  /** Autonomous period (20 seconds) */
  AUTO = 'AUTO',
  /** Transition shift between auto and shifts (10 seconds) - all can score */
  TRANSITION = 'TRANSITION',
  /** Shift 1 (25 seconds) - ODD alliance can score */
  SHIFT_1 = 'SHIFT_1',
  /** Shift 2 (25 seconds) - EVEN alliance can score */
  SHIFT_2 = 'SHIFT_2',
  /** Shift 3 (25 seconds) - ODD alliance can score */
  SHIFT_3 = 'SHIFT_3',
  /** Shift 4 (25 seconds) - EVEN alliance can score */
  SHIFT_4 = 'SHIFT_4',
  /** End game period (30 seconds) - all can score */
  ENDGAME = 'ENDGAME',
  /** Match has ended */
  POST_MATCH = 'POST_MATCH',
}

/**
 * Shift parity - determines which shifts an alliance can score during
 * EVEN alliance scored most balls in auto, scores during Shift 2 and 4
 * ODD alliance scores during Shift 1 and 3
 */
export type ShiftParity = 'EVEN' | 'ODD';

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
  /** Points from teleop period (includes all shifts) */
  teleop: number;
  /** Points from endgame (climbing) */
  endgame: number;
  /** Penalty points (added to score) */
  penalties: number;
  /** Total score */
  total: number;
  /** Detailed breakdown by scoring target */
  breakdown: Record<string, number>;
  /** Number of balls scored during auto (used to determine shift parity) */
  autoBallCount: number;
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
  /** Auto period duration in seconds */
  auto: number;
  /** Transition shift duration in seconds (all can score) */
  transition: number;
  /** Shift 1 duration in seconds */
  shift1: number;
  /** Shift 2 duration in seconds */
  shift2: number;
  /** Shift 3 duration in seconds */
  shift3: number;
  /** Shift 4 duration in seconds */
  shift4: number;
  /** Endgame duration in seconds */
  endgame: number;
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
  /** Current shift number (1-4) or null if not in a shift */
  currentShift: number | null;
  /** Red alliance shift parity (determined after auto) */
  redParity: ShiftParity | null;
  /** Blue alliance shift parity (determined after auto) */
  blueParity: ShiftParity | null;
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
