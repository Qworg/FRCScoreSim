import type {
  Strategy,
  StrategyContext,
  StrategyDecision,
} from '../types/index.js';
import { RobotActionType, StrategyPriority } from '../types/index.js';

/**
 * Abstract base class for strategies
 */
export abstract class BaseStrategy implements Strategy {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Initialize strategy - override if needed
   */
  initialize(_context: StrategyContext): void {
    // Default: no initialization needed
  }

  /**
   * Make a decision based on context - must be implemented
   */
  abstract decide(context: StrategyContext): StrategyDecision;

  /**
   * Reset strategy state - override if needed
   */
  reset(): void {
    // Default: no state to reset
  }

  /**
   * Create an idle decision
   */
  protected idle(reason: string): StrategyDecision {
    return {
      command: { type: RobotActionType.IDLE },
      priority: StrategyPriority.LOW,
      reason,
    };
  }

  /**
   * Create a move decision
   */
  protected moveTo(
    x: number,
    y: number,
    priority: StrategyPriority,
    reason: string
  ): StrategyDecision {
    return {
      command: {
        type: RobotActionType.MOVING,
        targetPosition: { x, y },
      },
      priority,
      reason,
    };
  }

  /**
   * Create a shoot decision
   */
  protected shoot(
    targetId: string,
    priority: StrategyPriority,
    reason: string
  ): StrategyDecision {
    return {
      command: {
        type: RobotActionType.SHOOTING,
        targetScoringZoneId: targetId,
      },
      priority,
      reason,
    };
  }

  /**
   * Create a pickup decision
   */
  protected pickup(
    ballId: string,
    priority: StrategyPriority,
    reason: string
  ): StrategyDecision {
    return {
      command: {
        type: RobotActionType.PICKING_UP,
        targetBallId: ballId,
      },
      priority,
      reason,
    };
  }

  /**
   * Create a climb decision
   */
  protected climb(
    priority: StrategyPriority,
    reason: string
  ): StrategyDecision {
    return {
      command: { type: RobotActionType.CLIMBING },
      priority,
      reason,
    };
  }
}
