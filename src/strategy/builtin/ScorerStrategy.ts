import type { StrategyContext, StrategyDecision } from '../../types/index.js';
import {
  MatchPhase,
  RobotActionType,
  StrategyPriority,
} from '../../types/index.js';
import { BaseStrategy } from '../BaseStrategy.js';

/**
 * Scorer strategy - focuses on scoring balls in goals
 * Respects shift-based scoring rules: only shoots when alliance can score
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
      canScore,
    } = context;

    // In auto, try to auto-climb if robot can and alliance has slots
    if (
      phase === MatchPhase.AUTO &&
      robot.config.autoClimb &&
      !robot.hasAutoClimbed &&
      context.allianceCanAutoClimb
    ) {
      // If already climbing, continue
      if (robot.currentAction.type === RobotActionType.CLIMBING) {
        return this.idle('Continuing auto climb');
      }

      // Must be near climbing zone to climb
      if (!context.isNearClimbingZone && context.climbingZonePosition) {
        if (robot.currentAction.type === RobotActionType.MOVING) {
          return this.idle('Moving to climb zone');
        }
        return this.moveTo(
          context.climbingZonePosition.x,
          context.climbingZonePosition.y,
          StrategyPriority.CRITICAL,
          'Auto - moving to climb zone'
        );
      }

      // Shoot any remaining balls first (if we have them and in range)
      if (robot.heldBalls.length > 0 && inShootingRange && nearestScoringTarget) {
        return this.shoot(
          nearestScoringTarget.id,
          StrategyPriority.HIGH,
          'Auto - shooting balls before climb'
        );
      }
      return this.autoClimb(StrategyPriority.CRITICAL, 'Auto - climbing (15 pts)');
    }

    // In endgame, prioritize climbing
    if (
      phase === MatchPhase.ENDGAME &&
      robot.config.canClimb &&
      !robot.hasClimbed &&
      context.allianceCanEndgameClimb
    ) {
      // If already climbing, continue
      if (robot.currentAction.type === RobotActionType.CLIMBING) {
        return this.idle('Continuing endgame climb');
      }

      // Must be near climbing zone to climb
      if (!context.isNearClimbingZone && context.climbingZonePosition) {
        if (robot.currentAction.type === RobotActionType.MOVING) {
          return this.idle('Moving to climb zone');
        }
        return this.moveTo(
          context.climbingZonePosition.x,
          context.climbingZonePosition.y,
          StrategyPriority.CRITICAL,
          'Endgame - moving to climb zone'
        );
      }

      // Shoot any remaining balls first (if we can score and in range)
      if (canScore && robot.heldBalls.length > 0 && inShootingRange && nearestScoringTarget) {
        return this.shoot(
          nearestScoringTarget.id,
          StrategyPriority.HIGH,
          'Endgame - shooting remaining balls before climb'
        );
      }

      // Then climb to robot's configured level
      const level = robot.config.climbLevel;
      return this.endgameClimb(
        level,
        StrategyPriority.CRITICAL,
        `Endgame - climbing to L${level} (${level * 10} pts)`
      );
    }

    // If we can score and have balls and in range, shoot!
    if (canScore && robot.heldBalls.length > 0 && inShootingRange && nearestScoringTarget) {
      return this.shoot(
        nearestScoringTarget.id,
        StrategyPriority.HIGH,
        'In range - shooting ball'
      );
    }

    // If we can score and have balls but not in range, move to scoring position
    if (canScore && robot.heldBalls.length > 0 && nearestScoringTarget) {
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

    // If we can't score right now but have balls, position for when we can
    if (!canScore && robot.heldBalls.length > 0 && nearestScoringTarget) {
      // Position ourselves for when we can score
      if (robot.currentAction.type === RobotActionType.MOVING) {
        return this.idle('Positioning for next scoring window');
      }

      const shootingRange = robot.config.shootingRange * 0.8;
      const targetDist = nearestScoringTargetDistance ?? Infinity;

      if (targetDist > shootingRange) {
        const dx = nearestScoringTarget.position.x - robot.position.x;
        const dy = nearestScoringTarget.position.y - robot.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = shootingRange / dist;

        const targetX = nearestScoringTarget.position.x - dx * ratio;
        const targetY = nearestScoringTarget.position.y - dy * ratio;

        return this.moveTo(
          targetX,
          targetY,
          StrategyPriority.MEDIUM,
          'Positioning for next scoring window'
        );
      }

      // Already in position, wait for our turn
      return this.idle('Waiting for scoring window');
    }

    // If we don't have balls (or don't have max capacity), go collect
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
