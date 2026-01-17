import type { Position } from './field.js';
import type { RobotActionType } from './robot.js';

/**
 * Factors that contribute to an action's value
 */
export interface ActionValueFactors {
  /** Distance cost (0-1, lower is better) - normalized by field diagonal */
  distanceCost: number;
  /** Estimated time to complete the action in seconds */
  timeEstimate: number;
  /** Expected points from the action */
  expectedPoints: number;
  /** Strategic multiplier based on phase urgency, parity alignment, etc. */
  strategicMultiplier: number;
  /** Risk factor based on opponent proximity, path complexity (0-1, lower is better) */
  riskFactor: number;
}

/**
 * An action that has been evaluated with a value score
 */
export interface EvaluatedAction {
  /** Type of action */
  actionType: RobotActionType;
  /** Target position for movement actions */
  targetPosition?: Position;
  /** Target ID (ball ID, scoring zone ID, etc.) */
  targetId?: string;
  /** The individual factors that contributed to the value */
  factors: ActionValueFactors;
  /** Total computed value (higher is better) */
  totalValue: number;
  /** Human-readable explanation of why this action was valued this way */
  explanation: string;
}

/**
 * Configuration for the action valuator
 */
export interface ValuatorConfig {
  /** Weight for distance cost in value calculation */
  distanceWeight: number;
  /** Weight for time estimate in value calculation */
  timeWeight: number;
  /** Weight for expected points in value calculation */
  pointsWeight: number;
  /** Weight for risk factor in value calculation */
  riskWeight: number;
  /** Field diagonal for distance normalization (inches) */
  fieldDiagonal: number;
  /** Maximum shooting range for normalization */
  maxShootingRange: number;
  /** Points for a scored ball */
  ballPoints: number;
  /** Points for auto climb */
  autoClimbPoints: number;
  /** Points per level for endgame climb */
  endgameClimbPointsPerLevel: number;
}

/**
 * Default valuator configuration
 */
export const DEFAULT_VALUATOR_CONFIG: ValuatorConfig = {
  distanceWeight: -0.15,
  timeWeight: -0.10,
  pointsWeight: 0.40,
  riskWeight: -0.10,
  fieldDiagonal: 726, // sqrt(648^2 + 324^2)
  maxShootingRange: 300,
  ballPoints: 2,
  autoClimbPoints: 15,
  endgameClimbPointsPerLevel: 10,
};

/**
 * Action candidate for evaluation
 */
export interface ActionCandidate {
  /** Type of action */
  actionType: RobotActionType;
  /** Target position for movement */
  targetPosition?: Position;
  /** Target ID (ball, scoring zone, etc.) */
  targetId?: string;
  /** Estimated time to complete */
  estimatedTime?: number;
  /** Raw expected points */
  rawExpectedPoints?: number;
}
