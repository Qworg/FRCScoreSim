import type { StrategyContext, StrategyDecision } from '../../types/index.js';
import {
  MatchPhase,
  RobotActionType,
  StrategyPriority,
} from '../../types/index.js';
import { BaseStrategy } from '../BaseStrategy.js';

/**
 * Scorer strategy - focuses on scoring balls in goals
 */
export class ScorerStrategy extends BaseStrategy {
  readonly id = 'scorer';
  readonly name = 'Scorer';
  readonly description = 'Cycle between collecting balls and scoring them';

  decide(context: StrategyContext): StrategyDecision {
    const {
      robot,
      nearestBall,
      nearestBallDistance,
      nearestScoringTarget,
      nearestScoringTargetDistance,
      inShootingRange,
      phase,
    } = context;

    // In endgame, prioritize climbing
    if (phase === MatchPhase.ENDGAME && robot.config.canClimb && !robot.hasClimbed) {
      // Shoot any remaining balls first
      if (robot.heldBalls.length > 0 && inShootingRange && nearestScoringTarget) {
        return this.shoot(
          nearestScoringTarget.id,
          StrategyPriority.HIGH,
          'Endgame - shooting remaining balls before climb'
        );
      }

      // Then climb
      return this.climb(StrategyPriority.CRITICAL, 'Endgame - climbing');
    }

    // If we have balls and in range, shoot! (even interrupts movement)
    if (robot.heldBalls.length > 0 && inShootingRange && nearestScoringTarget) {
      return this.shoot(
        nearestScoringTarget.id,
        StrategyPriority.HIGH,
        'In range - shooting ball'
      );
    }

    // If we have balls but not in range, move to scoring position
    if (robot.heldBalls.length > 0 && nearestScoringTarget) {
      // If already moving, let it continue
      if (robot.currentAction.type === RobotActionType.MOVING) {
        return this.idle('Continuing to shooting position');
      }

      // Calculate optimal shooting position
      const shootingRange = robot.config.shootingRange * 0.8; // Stay a bit inside range
      const targetDist = nearestScoringTargetDistance ?? Infinity;

      if (targetDist > shootingRange) {
        // Move closer to target
        const dx = nearestScoringTarget.position.x - robot.position.x;
        const dy = nearestScoringTarget.position.y - robot.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = shootingRange / dist;

        const targetX = nearestScoringTarget.position.x - dx * ratio;
        const targetY = nearestScoringTarget.position.y - dy * ratio;

        return this.moveTo(
          targetX,
          targetY,
          StrategyPriority.HIGH,
          'Moving to shooting position'
        );
      }
    }

    // If we don't have balls, go collect
    if (robot.heldBalls.length < robot.config.ballCapacity) {
      if (nearestBall && nearestBallDistance !== null) {
        // If very close, start pickup (even interrupts movement)
        if (nearestBallDistance < 18) {
          return this.pickup(
            nearestBall.id,
            StrategyPriority.MEDIUM,
            'Ball in range - picking up'
          );
        }

        // If already moving towards a ball, let it continue
        if (robot.currentAction.type === RobotActionType.MOVING) {
          return this.idle('Continuing to ball');
        }

        // Move towards ball
        return this.moveTo(
          nearestBall.position.x,
          nearestBall.position.y,
          StrategyPriority.MEDIUM,
          'Moving to collect ball'
        );
      }
    }

    // If doing something else, continue
    if (robot.currentAction.type !== RobotActionType.IDLE) {
      return this.idle('Continuing current action');
    }

    // Nothing to do
    return this.idle('No actions available');
  }
}
