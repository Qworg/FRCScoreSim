import type { StrategyContext, StrategyDecision } from '../../types/index.js';
import { MatchPhase, RobotActionType, StrategyPriority } from '../../types/index.js';
import { BaseStrategy } from '../BaseStrategy.js';

/**
 * Collector strategy - focuses on gathering balls
 * Respects shift-based scoring rules: only shoots when alliance can score
 */
export class CollectorStrategy extends BaseStrategy {
  readonly id = 'collector';
  readonly name = 'Collector';
  readonly description = 'Focus on collecting balls and bringing them to teammates';

  decide(context: StrategyContext): StrategyDecision {
    const { robot, nearestBall, nearestBallDistance, phase, canScore } = context;

    // In endgame, try to climb if we can
    if (phase === MatchPhase.ENDGAME && robot.config.canClimb && !robot.hasClimbed) {
      return this.climb(StrategyPriority.HIGH, 'Endgame - attempting to climb');
    }

    // If at capacity, find a teammate to pass to or go to scoring zone
    if (robot.heldBalls.length >= robot.config.ballCapacity) {
      // If we can score and in range, shoot
      if (canScore && context.inShootingRange && context.nearestScoringTarget) {
        return this.shoot(
          context.nearestScoringTarget.id,
          StrategyPriority.HIGH,
          'At capacity and can score - shooting'
        );
      }

      // If already moving, let it continue
      if (robot.currentAction.type === RobotActionType.MOVING) {
        return this.idle('Continuing to scoring area');
      }
      const nearestTarget = context.nearestScoringTarget;
      if (nearestTarget) {
        return this.moveTo(
          nearestTarget.position.x,
          nearestTarget.position.y,
          StrategyPriority.MEDIUM,
          canScore ? 'At capacity, moving to scoring area' : 'At capacity, positioning for next scoring window'
        );
      }
      return this.idle(canScore ? 'At capacity, waiting' : 'At capacity, waiting for scoring window');
    }

    // If there's a ball nearby, go get it
    if (nearestBall && nearestBallDistance !== null) {
      // If very close, start pickup (even if moving - will interrupt movement)
      if (nearestBallDistance < 18) {
        return this.pickup(
          nearestBall.id,
          StrategyPriority.HIGH,
          'Ball in range, picking up'
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

    // No balls available - if we have any, shoot them (if allowed) or move to scoring zone
    if (robot.heldBalls.length > 0) {
      // If we can score and in shooting range, shoot
      if (canScore && context.inShootingRange && context.nearestScoringTarget) {
        return this.shoot(
          context.nearestScoringTarget.id,
          StrategyPriority.MEDIUM,
          'No balls left to collect, shooting held balls'
        );
      }
      // If already moving, let it continue
      if (robot.currentAction.type === RobotActionType.MOVING) {
        return this.idle('Continuing to scoring area');
      }
      // Move to scoring zone (to be ready when we can score or to find balls)
      const nearestTarget = context.nearestScoringTarget;
      if (nearestTarget) {
        return this.moveTo(
          nearestTarget.position.x,
          nearestTarget.position.y,
          StrategyPriority.MEDIUM,
          canScore ? 'No balls left, moving to scoring area' : 'Positioning for next scoring window'
        );
      }
    }

    // If doing something else, continue
    if (robot.currentAction.type !== RobotActionType.IDLE) {
      return this.idle('Continuing current action');
    }

    return this.idle('No balls available to collect');
  }
}
