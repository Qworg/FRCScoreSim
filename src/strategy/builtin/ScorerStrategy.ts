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
      nearestScoringTarget,
      nearestScoringTargetDistance,
      inShootingRange,
      phase,
      canScore,
    } = context;

    // Use unclaimed balls for alliance coordination
    const nearestBall = context.nearestUnclaimedBall ?? context.nearestBall;
    const nearestBallDistance = context.nearestUnclaimedBallDistance ?? context.nearestBallDistance;

    // If robot has auto-climbed during AUTO, stay at climb zone until phase ends
    if (phase === MatchPhase.AUTO && robot.hasAutoClimbed) {
      return this.idle('Auto - staying at climb zone until phase ends');
    }

    // In auto, robots with auto-climb capability should shoot their balls first, then climb
    // Only start climbing near the end of auto (when < 8 seconds remain)
    const shouldAutoClimb = context.phaseTimeRemaining < 8;

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

      // FIRST: Shoot all balls before climbing (don't waste them!)
      if (robot.heldBalls.length > 0 && nearestScoringTarget) {
        // If in range and good position, shoot
        if (
          inShootingRange &&
          context.hasClearShotPath &&
          context.isGoodShootingPosition &&
          !context.isInNoScoreZone
        ) {
          return this.shoot(
            nearestScoringTarget.id,
            StrategyPriority.HIGH,
            'Auto - shooting balls before climb'
          );
        }
        // If not in range, move towards shooting position (not climb zone yet)
        if (robot.currentAction.type !== RobotActionType.MOVING) {
          const shootingRange = robot.config.shootingRange * 0.8;
          const dx = nearestScoringTarget.position.x - robot.position.x;
          const dy = nearestScoringTarget.position.y - robot.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const ratio = Math.min(1, shootingRange / dist);
          const targetX = nearestScoringTarget.position.x - dx * ratio;
          const targetY = nearestScoringTarget.position.y - dy * ratio;
          return this.moveTo(
            targetX,
            targetY,
            StrategyPriority.HIGH,
            'Auto - moving to shoot before climb'
          );
        }
        return this.idle('Auto - continuing to shooting position');
      }

      // THEN: Only climb near the end of auto (after shooting all balls)
      if (!shouldAutoClimb) {
        // Not yet time to climb - continue scoring or collecting
        // Fall through to regular scoring logic below
      } else {
        // Time to climb - must be near climbing zone to climb
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

        return this.autoClimb(StrategyPriority.CRITICAL, 'Auto - climbing (15 pts)');
      }
    }

    // In endgame, shoot remaining balls then climb
    // Only start climbing near the end of endgame (when < 12 seconds remain)
    const shouldEndgameClimb = context.phaseTimeRemaining < 12;

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

      // FIRST: Shoot remaining balls if we can score
      if (canScore && robot.heldBalls.length > 0 && nearestScoringTarget) {
        // If in range and good position, shoot
        if (
          inShootingRange &&
          context.hasClearShotPath &&
          context.isGoodShootingPosition &&
          !context.isInNoScoreZone
        ) {
          return this.shoot(
            nearestScoringTarget.id,
            StrategyPriority.HIGH,
            'Endgame - shooting remaining balls before climb'
          );
        }
        // If close to climb zone but still have balls, just shoot from here if possible
        if (context.isNearClimbingZone && inShootingRange && context.hasClearShotPath) {
          return this.shoot(
            nearestScoringTarget.id,
            StrategyPriority.HIGH,
            'Endgame - quick shot before climb'
          );
        }
      }

      // THEN: Only climb near the end of endgame (after shooting all balls)
      if (!shouldEndgameClimb) {
        // Not yet time to climb - continue scoring or collecting
        // Fall through to regular scoring logic below
      } else {
        // Time to climb - must be near climbing zone
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

        // Climb to robot's configured level
        const level = robot.config.climbLevel;
        return this.endgameClimb(
          level,
          StrategyPriority.CRITICAL,
          `Endgame - climbing to L${level} (${level * 10} pts)`
        );
      }
    }

    // If we can score and have balls and in range, check if position is good
    if (canScore && robot.heldBalls.length > 0 && inShootingRange && nearestScoringTarget) {
      // Check if we have a good shooting position (clear path, good zone, on our side)
      const {
        hasClearShotPath,
        isGoodShootingPosition,
        isInNoScoreZone,
      } = context;

      // Only shoot if we're in a good position
      if (hasClearShotPath && isGoodShootingPosition && !isInNoScoreZone) {
        return this.shoot(
          nearestScoringTarget.id,
          StrategyPriority.HIGH,
          'In range with clear shot - shooting ball'
        );
      }

      // If not in a good position, need to reposition
      // Don't shoot - fall through to repositioning logic
    }

    // If we can score and have balls but not in range or need better position, move to scoring position
    if (canScore && robot.heldBalls.length > 0 && nearestScoringTarget) {
      // If already moving, let it continue
      if (robot.currentAction.type === RobotActionType.MOVING) {
        return this.idle('Continuing to shooting position');
      }

      // Calculate optimal shooting position on our side of the field
      const shootingRange = robot.config.shootingRange * 0.8; // Stay a bit inside range
      const targetDist = nearestScoringTargetDistance ?? Infinity;

      // Target position should be:
      // 1. Within shooting range of the scoring target
      // 2. On our side of the field (not in the no-score zone)
      // 3. Not on ramps or trenches
      // The scoring target is always on our side, so move towards it
      if (targetDist > shootingRange || context.isInNoScoreZone || !context.isGoodShootingPosition) {
        // Move closer to target, staying on our side
        const dx = nearestScoringTarget.position.x - robot.position.x;
        const dy = nearestScoringTarget.position.y - robot.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = shootingRange / dist;

        let targetX = nearestScoringTarget.position.x - dx * ratio;
        let targetY = nearestScoringTarget.position.y - dy * ratio;

        // Adjust Y to avoid ramps and trenches (stay in middle Y range)
        const fieldHeight = context.field.height;
        const safeYMin = fieldHeight * 0.25;
        const safeYMax = fieldHeight * 0.75;
        targetY = Math.max(safeYMin, Math.min(safeYMax, targetY));

        return this.moveTo(
          targetX,
          targetY,
          StrategyPriority.HIGH,
          'Moving to good shooting position on own side'
        );
      }
    }

    // If we can't score right now but have balls at or near full capacity,
    // shoot balls towards our zone from the center to position them for later
    if (!canScore && robot.heldBalls.length > 0 && nearestScoringTarget) {
      const hopperNearFull = robot.heldBalls.length >= robot.config.ballCapacity * 0.7;

      // If hopper is near full, shoot balls towards our zone from center
      if (hopperNearFull) {
        // If in range and have clear shot, shoot towards our goal
        if (inShootingRange && context.hasClearShotPath) {
          return this.shoot(
            nearestScoringTarget.id,
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

      // Hopper not full - just position for when we can score
      if (robot.currentAction.type === RobotActionType.MOVING) {
        return this.idle('Positioning for next scoring window');
      }

      const shootingRange = robot.config.shootingRange * 0.8;
      const targetDist = nearestScoringTargetDistance ?? Infinity;

      // Pre-position on our side of the field in a good shooting spot
      if (targetDist > shootingRange || context.isInNoScoreZone || !context.isGoodShootingPosition) {
        const dx = nearestScoringTarget.position.x - robot.position.x;
        const dy = nearestScoringTarget.position.y - robot.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = shootingRange / dist;

        let targetX = nearestScoringTarget.position.x - dx * ratio;
        let targetY = nearestScoringTarget.position.y - dy * ratio;

        // Adjust Y to avoid ramps and trenches
        const fieldHeight = context.field.height;
        const safeYMin = fieldHeight * 0.25;
        const safeYMax = fieldHeight * 0.75;
        targetY = Math.max(safeYMin, Math.min(safeYMax, targetY));

        return this.moveTo(
          targetX,
          targetY,
          StrategyPriority.MEDIUM,
          'Pre-positioning for next scoring window'
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
