import type { Position } from './field.js';
import type { RobotActionType } from './robot.js';
import type { StrategyPriority } from './strategy.js';

/**
 * Reasons why a decision might be rejected during execution
 */
export enum DecisionRejectionReason {
  /** Robot is currently busy with another action */
  ROBOT_BUSY = 'ROBOT_BUSY',
  /** No path could be found to the target */
  NO_PATH_FOUND = 'NO_PATH_FOUND',
  /** Robot has no balls to shoot */
  NO_BALLS_TO_SHOOT = 'NO_BALLS_TO_SHOOT',
  /** Robot is not near the climbing zone */
  NOT_IN_CLIMB_ZONE = 'NOT_IN_CLIMB_ZONE',
  /** Robot doesn't have auto-climb capability */
  NO_AUTO_CLIMB_CAPABILITY = 'NO_AUTO_CLIMB_CAPABILITY',
  /** Robot doesn't have climb capability */
  NO_CLIMB_CAPABILITY = 'NO_CLIMB_CAPABILITY',
  /** Not the right phase for this action */
  WRONG_PHASE = 'WRONG_PHASE',
  /** Robot is at full ball capacity */
  BALL_CAPACITY_FULL = 'BALL_CAPACITY_FULL',
  /** Target ball is not available */
  BALL_NOT_AVAILABLE = 'BALL_NOT_AVAILABLE',
  /** Robot is disabled */
  ROBOT_DISABLED = 'ROBOT_DISABLED',
  /** No target position specified */
  NO_TARGET_POSITION = 'NO_TARGET_POSITION',
  /** No target ball specified */
  NO_TARGET_BALL = 'NO_TARGET_BALL',
  /** No target scoring zone specified */
  NO_TARGET_SCORING_ZONE = 'NO_TARGET_SCORING_ZONE',
  /** Alliance climb slots are full */
  CLIMB_SLOTS_FULL = 'CLIMB_SLOTS_FULL',
}

/**
 * Information about a decision that was made
 */
export interface DecisionInfo {
  /** The type of command */
  commandType: RobotActionType;
  /** Priority of the decision */
  priority: StrategyPriority;
  /** Reason given by the strategy */
  reason: string;
  /** Target position if applicable */
  targetPosition?: Position;
  /** Target ball ID if applicable */
  targetBallId?: string;
  /** Target scoring zone ID if applicable */
  targetScoringZoneId?: string;
  /** Target climb level if applicable */
  targetClimbLevel?: number;
}

/**
 * Information about decision execution
 */
export interface ExecutionInfo {
  /** Whether the decision was executed */
  executed: boolean;
  /** Reason for rejection if not executed */
  rejectionReason?: DecisionRejectionReason;
}

/**
 * A log entry for a single decision
 */
export interface DecisionLogEntry {
  /** Tick when decision was made */
  tick: number;
  /** ID of the robot */
  robotId: string;
  /** Alliance of the robot */
  alliance: 'red' | 'blue';
  /** ID of the strategy that made the decision */
  strategyId: string;
  /** Details about the decision */
  decision: DecisionInfo;
  /** Execution result */
  execution: ExecutionInfo;
}

/**
 * Summary statistics for decision logging
 */
export interface DecisionLogStats {
  /** Total decisions logged */
  totalDecisions: number;
  /** Decisions that were executed */
  executedDecisions: number;
  /** Decisions that were rejected */
  rejectedDecisions: number;
  /** Count of rejections by reason */
  rejectionsByReason: Record<DecisionRejectionReason, number>;
  /** Count of decisions by command type */
  decisionsByType: Record<RobotActionType, number>;
  /** Count of decisions by robot */
  decisionsByRobot: Record<string, number>;
}
