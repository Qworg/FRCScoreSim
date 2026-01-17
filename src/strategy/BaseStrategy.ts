import type {
  Strategy,
  StrategyContext,
  StrategyDecision,
  EvaluatedAction,
} from '../types/index.js';
import { RobotActionType, StrategyPriority } from '../types/index.js';
import { ActionValuator } from './ActionValuator.js';

/**
 * Abstract base class for strategies
 */
export abstract class BaseStrategy implements Strategy {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;

  /** Action valuator for scoring potential actions */
  protected valuator: ActionValuator | null = null;

  /**
   * Enable action valuation for this strategy
   */
  enableValuator(valuator?: ActionValuator): void {
    this.valuator = valuator ?? new ActionValuator();
  }

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
   * Get ranked actions using the valuator
   * @returns Ranked actions or empty array if valuator not enabled
   */
  protected getRankedActions(context: StrategyContext): EvaluatedAction[] {
    if (!this.valuator) return [];
    return this.valuator.evaluateAllActions(context);
  }

  /**
   * Get the best action using the valuator
   * @returns Best action or null if valuator not enabled
   */
  protected getBestAction(context: StrategyContext): EvaluatedAction | null {
    if (!this.valuator) return null;
    return this.valuator.getBestAction(context);
  }

  /**
   * Convert an evaluated action to a strategy decision
   */
  protected evaluatedActionToDecision(
    action: EvaluatedAction,
    priority: StrategyPriority = StrategyPriority.MEDIUM
  ): StrategyDecision {
    const command: { type: RobotActionType; targetPosition?: { x: number; y: number }; targetBallId?: string; targetScoringZoneId?: string; targetClimbLevel?: number; isAutoClimb?: boolean } = {
      type: action.actionType,
    };

    if (action.targetPosition) {
      command.targetPosition = action.targetPosition;
    }

    if (action.targetId) {
      // Determine what kind of target this is based on action type
      switch (action.actionType) {
        case RobotActionType.PICKING_UP:
          command.targetBallId = action.targetId;
          break;
        case RobotActionType.SHOOTING:
          command.targetScoringZoneId = action.targetId;
          break;
        case RobotActionType.CLIMBING:
          if (action.targetId.startsWith('climb-level-')) {
            command.targetClimbLevel = parseInt(action.targetId.replace('climb-level-', ''));
            command.isAutoClimb = false;
          } else {
            command.isAutoClimb = true;
          }
          break;
      }
    }

    return {
      command,
      priority,
      reason: action.explanation,
    };
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
   * Create an auto climb decision
   */
  protected autoClimb(
    priority: StrategyPriority,
    reason: string
  ): StrategyDecision {
    return {
      command: {
        type: RobotActionType.CLIMBING,
        isAutoClimb: true,
      },
      priority,
      reason,
    };
  }

  /**
   * Create an endgame climb decision with specific level
   */
  protected endgameClimb(
    level: number,
    priority: StrategyPriority,
    reason: string
  ): StrategyDecision {
    return {
      command: {
        type: RobotActionType.CLIMBING,
        targetClimbLevel: level,
        isAutoClimb: false,
      },
      priority,
      reason,
    };
  }

  /**
   * @deprecated Use autoClimb() or endgameClimb(level) instead
   * Create a climb decision (legacy method)
   */
  protected climb(
    priority: StrategyPriority,
    reason: string
  ): StrategyDecision {
    return this.endgameClimb(1, priority, reason);
  }
}
