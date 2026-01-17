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
    const { robot, phase, canScore } = context;

    // Use unclaimed balls for alliance coordination
    const nearestBall = context.nearestUnclaimedBall ?? context.nearestBall;
    const nearestBallDistance = context.nearestUnclaimedBallDistance ?? context.nearestBallDistance;

    // If robot has auto-climbed during AUTO, stay at climb zone until phase ends
    if (phase === MatchPhase.AUTO && robot.hasAutoClimbed) {
      return this.idle('Auto - staying at climb zone until phase ends');
    }

    // Only start climbing near the end of auto (when < 8 seconds remain)
    const shouldAutoClimb = context.phaseTimeRemaining < 8;

    // In auto, try to auto-climb if robot can and alliance has slots
    if (
      phase === MatchPhase.AUTO &&
      robot.config.autoClimb &&
      !robot.hasAutoClimbed &&
      context.allianceCanAutoClimb &&
      shouldAutoClimb
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
          StrategyPriority.HIGH,
          'Auto - moving to climb zone'
        );
      }

      return this.autoClimb(StrategyPriority.HIGH, 'Auto - attempting to climb (15 pts)');
    }

    // Only start climbing near the end of endgame (when < 12 seconds remain)
    const shouldEndgameClimb = context.phaseTimeRemaining < 12;

    // In endgame, try to climb if we can
    if (
      phase === MatchPhase.ENDGAME &&
      robot.config.canClimb &&
      !robot.hasClimbed &&
      context.allianceCanEndgameClimb &&
      shouldEndgameClimb
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
          StrategyPriority.HIGH,
          'Endgame - moving to climb zone'
        );
      }

      const level = robot.config.climbLevel;
      return this.endgameClimb(
        level,
        StrategyPriority.HIGH,
        `Endgame - climbing to L${level} (${level * 10} pts)`
      );
    }

    // If we have balls and can score and in range, check shooting position quality
    if (robot.heldBalls.length > 0 && canScore && context.inShootingRange && context.nearestScoringTarget) {
      // Only shoot if we're in a good position
      if (
        context.hasClearShotPath &&
        context.isGoodShootingPosition &&
        !context.isInNoScoreZone
      ) {
        return this.shoot(
          context.nearestScoringTarget.id,
          StrategyPriority.HIGH,
          'Can score from good position - shooting'
        );
      }
      // Otherwise, need to reposition (fall through to movement logic)
    }

    // If at capacity but can't score, shoot balls towards our zone from center
    if (robot.heldBalls.length >= robot.config.ballCapacity) {
      const nearestTarget = context.nearestScoringTarget;

      // If can't score but hopper is full, shoot towards our zone
      if (!canScore && nearestTarget) {
        // If in range and have clear shot, shoot towards our goal
        if (context.inShootingRange && context.hasClearShotPath) {
          return this.shoot(
            nearestTarget.id,
            StrategyPriority.MEDIUM,
            'Hopper full - shooting to position balls in our zone'
          );
        }

        // Move towards center of field to shoot
        const fieldCenterX = context.field.width / 2;
        const fieldCenterY = context.field.height / 2;

        // Position at edge of no-score zone on our side
        const isRedAlliance = robot.alliance === 'red';
        const targetX = isRedAlliance
          ? fieldCenterX - 145  // Just outside no-score zone on red side
          : fieldCenterX + 145; // Just outside no-score zone on blue side

        if (robot.currentAction.type === RobotActionType.MOVING) {
          return this.idle('Moving to center to shoot');
        }

        return this.moveTo(
          targetX,
          fieldCenterY,
          StrategyPriority.MEDIUM,
          'Moving to center to shoot balls into our zone'
        );
      }

      // Can score - move to good shooting position
      if (robot.currentAction.type === RobotActionType.MOVING) {
        return this.idle('Continuing to scoring area');
      }

      if (nearestTarget) {
        // Calculate position on our side of field, avoiding ramps/trenches
        const shootingRange = robot.config.shootingRange * 0.8;
        const dx = nearestTarget.position.x - robot.position.x;
        const dy = nearestTarget.position.y - robot.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = shootingRange / dist;

        let targetX = nearestTarget.position.x - dx * ratio;
        let targetY = nearestTarget.position.y - dy * ratio;

        // Adjust Y to stay in safe zone (avoid ramps/trenches)
        const fieldHeight = context.field.height;
        const safeYMin = fieldHeight * 0.25;
        const safeYMax = fieldHeight * 0.75;
        targetY = Math.max(safeYMin, Math.min(safeYMax, targetY));

        return this.moveTo(
          targetX,
          targetY,
          StrategyPriority.MEDIUM,
          'At capacity, moving to good shooting position'
        );
      }
      return this.idle('At capacity, waiting');
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
      // If we can score and in shooting range and good position, shoot
      if (
        canScore &&
        context.inShootingRange &&
        context.nearestScoringTarget &&
        context.hasClearShotPath &&
        context.isGoodShootingPosition &&
        !context.isInNoScoreZone
      ) {
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
      // Move to good shooting position (to be ready when we can score or to find balls)
      const nearestTarget = context.nearestScoringTarget;
      if (nearestTarget) {
        // Calculate position on our side of field, avoiding ramps/trenches
        const shootingRange = robot.config.shootingRange * 0.8;
        const dx = nearestTarget.position.x - robot.position.x;
        const dy = nearestTarget.position.y - robot.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = Math.min(1, shootingRange / dist);

        let targetX = nearestTarget.position.x - dx * ratio;
        let targetY = nearestTarget.position.y - dy * ratio;

        // Adjust Y to stay in safe zone
        const fieldHeight = context.field.height;
        const safeYMin = fieldHeight * 0.25;
        const safeYMax = fieldHeight * 0.75;
        targetY = Math.max(safeYMin, Math.min(safeYMax, targetY));

        return this.moveTo(
          targetX,
          targetY,
          StrategyPriority.MEDIUM,
          canScore ? 'No balls left, moving to good shooting position' : 'Positioning for next scoring window'
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
