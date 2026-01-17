import type { StrategyContext, StrategyDecision } from '../../types/index.js';
import {
  MatchPhase,
  RobotActionType,
  StrategyPriority,
} from '../../types/index.js';
import { BaseStrategy } from '../BaseStrategy.js';

/**
 * AutoClimb strategy - attempts to auto climb during autonomous, then scores
 * This strategy prioritizes getting an auto climb before transitioning to scoring
 */
export class AutoClimbStrategy extends BaseStrategy {
  readonly id = 'autoclimb';
  readonly name = 'Auto Climber';
  readonly description = 'Auto climb in autonomous, then score during teleop';

  decide(context: StrategyContext): StrategyDecision {
    const {
      robot,
      nearestScoringTarget,
      nearestScoringTargetDistance,
      inShootingRange,
      phase,
      canScore,
      canAutoClimb,
      allianceCanAutoClimb,
    } = context;

    // Use unclaimed balls for alliance coordination
    const nearestBall = context.nearestUnclaimedBall ?? context.nearestBall;
    const nearestBallDistance = context.nearestUnclaimedBallDistance ?? context.nearestBallDistance;

    // During AUTO
    if (phase === MatchPhase.AUTO) {
      // If already auto-climbed, stay at climb zone until phase ends
      if (robot.hasAutoClimbed) {
        return this.idle('Auto - staying at climb zone until phase ends');
      }

      // Only start climbing near the end of auto (when < 8 seconds remain)
      const shouldAutoClimb = context.phaseTimeRemaining < 8;

      // If we can auto climb and there are slots available and time to climb
      if (canAutoClimb && allianceCanAutoClimb && shouldAutoClimb) {
        // If already climbing, let it continue
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

        // Start auto climb
        return this.autoClimb(StrategyPriority.CRITICAL, 'Auto period - climbing');
      }

      // Before climbing time or if can't climb, try to score
      if (canScore && robot.heldBalls.length > 0 && inShootingRange && nearestScoringTarget) {
        return this.shoot(
          nearestScoringTarget.id,
          StrategyPriority.HIGH,
          'Auto - shooting'
        );
      }

      // Collect balls during auto time
      if (robot.heldBalls.length < robot.config.ballCapacity && nearestBall && nearestBallDistance !== null) {
        if (nearestBallDistance < 18) {
          return this.pickup(nearestBall.id, StrategyPriority.MEDIUM, 'Auto - picking up ball');
        }
        if (robot.currentAction.type === RobotActionType.MOVING) {
          return this.idle('Auto - continuing to ball');
        }
        return this.moveTo(
          nearestBall.position.x,
          nearestBall.position.y,
          StrategyPriority.MEDIUM,
          'Auto - moving to ball'
        );
      }
    }

    // Only start climbing near the end of endgame (when < 12 seconds remain)
    const shouldEndgameClimb = context.phaseTimeRemaining < 12;

    // In endgame, prioritize climbing (endgame climb)
    if (phase === MatchPhase.ENDGAME && robot.config.canClimb && !robot.hasClimbed && context.allianceCanEndgameClimb) {
      // If already climbing, let it continue
      if (robot.currentAction.type === RobotActionType.CLIMBING) {
        return this.idle('Continuing endgame climb');
      }

      // Shoot remaining balls first if not yet time to climb
      if (!shouldEndgameClimb || robot.heldBalls.length > 0) {
        if (canScore && robot.heldBalls.length > 0 && inShootingRange && nearestScoringTarget) {
          return this.shoot(
            nearestScoringTarget.id,
            StrategyPriority.HIGH,
            'Endgame - shooting before climb'
          );
        }
      }

      // Time to climb
      if (shouldEndgameClimb) {
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

        // Climb at configured level
        return this.endgameClimb(
          robot.config.climbLevel,
          StrategyPriority.CRITICAL,
          `Endgame - climbing to level ${robot.config.climbLevel}`
        );
      }
    }

    // Standard scoring behavior during teleop
    if (canScore && robot.heldBalls.length > 0 && inShootingRange && nearestScoringTarget) {
      return this.shoot(
        nearestScoringTarget.id,
        StrategyPriority.HIGH,
        'In range - shooting'
      );
    }

    if (canScore && robot.heldBalls.length > 0 && nearestScoringTarget) {
      if (robot.currentAction.type === RobotActionType.MOVING) {
        return this.idle('Moving to shooting position');
      }

      const shootingRange = robot.config.shootingRange * 0.8;
      const targetDist = nearestScoringTargetDistance ?? Infinity;

      if (targetDist > shootingRange) {
        const dx = nearestScoringTarget.position.x - robot.position.x;
        const dy = nearestScoringTarget.position.y - robot.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = shootingRange / dist;

        return this.moveTo(
          nearestScoringTarget.position.x - dx * ratio,
          nearestScoringTarget.position.y - dy * ratio,
          StrategyPriority.HIGH,
          'Moving to shooting position'
        );
      }
    }

    // If can't score, position for next window or collect balls
    if (!canScore && robot.heldBalls.length > 0 && nearestScoringTarget) {
      const shootingRange = robot.config.shootingRange * 0.8;
      const targetDist = nearestScoringTargetDistance ?? Infinity;

      if (targetDist > shootingRange) {
        if (robot.currentAction.type === RobotActionType.MOVING) {
          return this.idle('Positioning for scoring window');
        }
        const dx = nearestScoringTarget.position.x - robot.position.x;
        const dy = nearestScoringTarget.position.y - robot.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = shootingRange / dist;

        return this.moveTo(
          nearestScoringTarget.position.x - dx * ratio,
          nearestScoringTarget.position.y - dy * ratio,
          StrategyPriority.MEDIUM,
          'Positioning for scoring window'
        );
      }
      return this.idle('Waiting for scoring window');
    }

    // Collect balls
    if (robot.heldBalls.length < robot.config.ballCapacity && nearestBall && nearestBallDistance !== null) {
      if (nearestBallDistance < 18) {
        return this.pickup(nearestBall.id, StrategyPriority.MEDIUM, 'Picking up ball');
      }
      if (robot.currentAction.type === RobotActionType.MOVING) {
        return this.idle('Continuing to ball');
      }
      return this.moveTo(
        nearestBall.position.x,
        nearestBall.position.y,
        StrategyPriority.MEDIUM,
        'Moving to ball'
      );
    }

    if (robot.currentAction.type !== RobotActionType.IDLE) {
      return this.idle('Continuing action');
    }

    return this.idle('No actions available');
  }
}
