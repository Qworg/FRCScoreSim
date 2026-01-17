import type { StrategyContext, StrategyDecision } from '../../types/index.js';
import {
  MatchPhase,
  RobotActionType,
  StrategyPriority,
} from '../../types/index.js';
import { BaseStrategy } from '../BaseStrategy.js';

/**
 * EndgameClimber strategy - focuses on scoring during the match and climbing at the highest level during endgame
 * This strategy prioritizes getting a high-level climb in endgame
 */
export class EndgameClimberStrategy extends BaseStrategy {
  readonly id = 'endgameclimber';
  readonly name = 'Endgame Climber';
  readonly description = 'Score during teleop, prioritize high-level climb in endgame';

  decide(context: StrategyContext): StrategyDecision {
    const {
      robot,
      nearestScoringTarget,
      nearestScoringTargetDistance,
      inShootingRange,
      phase,
      phaseTimeRemaining,
      canScore,
      allianceCanEndgameClimb,
    } = context;

    // Use unclaimed balls for alliance coordination
    const nearestBall = context.nearestUnclaimedBall ?? context.nearestBall;
    const nearestBallDistance = context.nearestUnclaimedBallDistance ?? context.nearestBallDistance;
    // Also use context.isNearClimbingZone and context.climbingZonePosition directly

    // Only start climbing near the end of endgame (when < 12 seconds remain)
    const shouldEndgameClimb = phaseTimeRemaining < 12;

    // In endgame, prioritize climbing at max level
    if (phase === MatchPhase.ENDGAME && robot.config.canClimb && !robot.hasClimbed && allianceCanEndgameClimb) {
      // If already climbing, continue
      if (robot.currentAction.type === RobotActionType.CLIMBING) {
        return this.idle('Continuing endgame climb');
      }

      // With plenty of time, shoot remaining balls first
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

        // Start climbing at max level - this is the priority
        return this.endgameClimb(
          robot.config.climbLevel,
          StrategyPriority.CRITICAL,
          `Endgame - climbing to level ${robot.config.climbLevel}`
        );
      }
    }

    // Standard scoring during other phases
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

    // If can't score right now, position for next window
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
