import type { Position, ScoringTarget } from '../types/field.js';
import type { StrategyContext } from '../types/strategy.js';
import { RobotActionType } from '../types/robot.js';
import { MatchPhase } from '../types/game.js';
import type {
  ActionValueFactors,
  EvaluatedAction,
  ValuatorConfig,
  ActionCandidate,
} from '../types/valuation.js';
import { DEFAULT_VALUATOR_CONFIG } from '../types/valuation.js';

/**
 * Evaluates potential robot actions and assigns value scores for decision-making
 */
export class ActionValuator {
  private config: ValuatorConfig;

  constructor(config: Partial<ValuatorConfig> = {}) {
    this.config = { ...DEFAULT_VALUATOR_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ValuatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Evaluate a single action candidate
   */
  evaluateAction(candidate: ActionCandidate, context: StrategyContext): EvaluatedAction {
    const factors = this.calculateFactors(candidate, context);
    const totalValue = this.calculateTotalValue(factors);
    const explanation = this.generateExplanation(candidate, factors, context);

    return {
      actionType: candidate.actionType,
      targetPosition: candidate.targetPosition,
      targetId: candidate.targetId,
      factors,
      totalValue,
      explanation,
    };
  }

  /**
   * Evaluate all reasonable actions for the current context
   */
  evaluateAllActions(context: StrategyContext): EvaluatedAction[] {
    const candidates = this.generateCandidates(context);
    const evaluated = candidates.map(c => this.evaluateAction(c, context));

    // Sort by value (highest first)
    return evaluated.sort((a, b) => b.totalValue - a.totalValue);
  }

  /**
   * Get the best action for the current context
   */
  getBestAction(context: StrategyContext): EvaluatedAction | null {
    const actions = this.evaluateAllActions(context);
    return actions.length > 0 ? actions[0] : null;
  }

  /**
   * Generate action candidates based on context
   */
  private generateCandidates(context: StrategyContext): ActionCandidate[] {
    const candidates: ActionCandidate[] = [];
    const robot = context.robot;

    // Always consider idle as an option
    candidates.push({
      actionType: RobotActionType.IDLE,
      estimatedTime: 0,
      rawExpectedPoints: 0,
    });

    // Shooting actions (if robot has balls and scoring targets available)
    if (robot.heldBalls.length > 0) {
      for (const target of context.scoringTargets) {
        const distance = this.distanceTo(robot.position, target.position);
        if (distance <= robot.config.shootingRange) {
          candidates.push({
            actionType: RobotActionType.SHOOTING,
            targetPosition: target.position,
            targetId: target.id,
            estimatedTime: robot.config.shootTime,
            rawExpectedPoints: this.config.ballPoints * robot.config.shootingAccuracy,
          });
        }
      }

      // If not in range, consider moving to shooting range
      if (context.nearestScoringTarget && !context.inShootingRange) {
        const moveToShootPos = this.calculateShootingPosition(
          robot.position,
          context.nearestScoringTarget,
          robot.config.shootingRange
        );
        const moveTime = this.estimateMoveTime(robot.position, moveToShootPos, robot.config);

        candidates.push({
          actionType: RobotActionType.MOVING,
          targetPosition: moveToShootPos,
          targetId: context.nearestScoringTarget.id,
          estimatedTime: moveTime + robot.config.shootTime,
          rawExpectedPoints: this.config.ballPoints * robot.config.shootingAccuracy,
        });
      }
    }

    // Ball pickup actions
    if (robot.heldBalls.length < robot.config.ballCapacity) {
      // Consider unclaimed balls first (better coordination)
      for (const ball of context.unclaimedBalls.slice(0, 5)) {
        const moveTime = this.estimateMoveTime(robot.position, ball.position, robot.config);

        candidates.push({
          actionType: RobotActionType.PICKING_UP,
          targetPosition: ball.position,
          targetId: ball.id,
          estimatedTime: moveTime + robot.config.pickupTime,
          // Ball pickup doesn't directly score, but enables future scoring
          rawExpectedPoints: this.config.ballPoints * 0.5 * robot.config.shootingAccuracy,
        });
      }
    }

    // Climbing actions
    if (context.phase === MatchPhase.AUTO && context.canAutoClimb && robot.config.autoClimb) {
      const climbPos = context.climbingZonePosition;
      if (climbPos) {
        const moveTime = context.isNearClimbingZone
          ? 0
          : this.estimateMoveTime(robot.position, climbPos, robot.config);

        candidates.push({
          actionType: RobotActionType.CLIMBING,
          targetPosition: climbPos,
          estimatedTime: moveTime + robot.config.climbUpTime,
          rawExpectedPoints: this.config.autoClimbPoints,
        });
      }
    }

    if (context.phase === MatchPhase.ENDGAME && robot.config.canClimb && !robot.hasClimbed) {
      const climbPos = context.climbingZonePosition;
      if (climbPos) {
        const moveTime = context.isNearClimbingZone
          ? 0
          : this.estimateMoveTime(robot.position, climbPos, robot.config);

        for (let level = 1; level <= robot.config.climbLevel; level++) {
          candidates.push({
            actionType: RobotActionType.CLIMBING,
            targetPosition: climbPos,
            targetId: `climb-level-${level}`,
            estimatedTime: moveTime + robot.config.climbUpTime,
            rawExpectedPoints: this.config.endgameClimbPointsPerLevel * level,
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Calculate value factors for an action
   */
  private calculateFactors(
    candidate: ActionCandidate,
    context: StrategyContext
  ): ActionValueFactors {
    const robot = context.robot;

    // Distance cost (normalized 0-1)
    let distanceCost = 0;
    if (candidate.targetPosition) {
      const distance = this.distanceTo(robot.position, candidate.targetPosition);
      distanceCost = Math.min(1, distance / this.config.fieldDiagonal);
    }

    // Time estimate
    const timeEstimate = candidate.estimatedTime ?? 0;

    // Expected points
    let expectedPoints = candidate.rawExpectedPoints ?? 0;

    // Strategic multiplier
    const strategicMultiplier = this.calculateStrategicMultiplier(candidate, context);

    // Risk factor
    const riskFactor = this.calculateRiskFactor(candidate, context);

    return {
      distanceCost,
      timeEstimate,
      expectedPoints,
      strategicMultiplier,
      riskFactor,
    };
  }

  /**
   * Calculate strategic multiplier based on game state
   */
  private calculateStrategicMultiplier(
    candidate: ActionCandidate,
    context: StrategyContext
  ): number {
    let multiplier = 1.0;

    // Boost scoring during our scoring window
    if (candidate.actionType === RobotActionType.SHOOTING) {
      if (context.canScore) {
        multiplier *= 1.5;
      } else {
        // Can't score right now - drastically reduce value
        multiplier *= 0.3;
      }
    }

    // Boost collecting when we can't score but will be able to soon
    if (candidate.actionType === RobotActionType.PICKING_UP && !context.canScore) {
      multiplier *= 1.2;
    }

    // Urgency boost based on time remaining in phase
    const timeRemaining = context.phaseTimeRemaining;
    if (timeRemaining < 5) {
      // Very urgent - boost time-sensitive actions
      if (candidate.actionType === RobotActionType.SHOOTING && context.canScore) {
        multiplier *= 1.3;
      }
      if (candidate.actionType === RobotActionType.CLIMBING) {
        multiplier *= 1.5;
      }
    }

    // Endgame climbing is high priority
    if (context.phase === MatchPhase.ENDGAME && candidate.actionType === RobotActionType.CLIMBING) {
      multiplier *= 2.0;

      // Even higher if time is running out
      if (timeRemaining < 15) {
        multiplier *= 1.5;
      }
    }

    // Auto climbing priority
    if (context.phase === MatchPhase.AUTO && candidate.actionType === RobotActionType.CLIMBING) {
      multiplier *= 1.8;
    }

    return multiplier;
  }

  /**
   * Calculate risk factor for an action
   */
  private calculateRiskFactor(
    candidate: ActionCandidate,
    context: StrategyContext
  ): number {
    let risk = 0;

    if (!candidate.targetPosition) return risk;

    // Opponent proximity risk
    for (const opponent of context.opponents) {
      const distance = this.distanceTo(candidate.targetPosition, opponent.position);
      if (distance < 60) {
        risk += (60 - distance) / 60 * 0.3;
      }
    }

    // Path complexity risk (simple heuristic based on distance)
    const distance = this.distanceTo(context.robot.position, candidate.targetPosition);
    if (distance > 200) {
      risk += 0.1;
    }
    if (distance > 400) {
      risk += 0.1;
    }

    // Shooting from bad positions
    if (candidate.actionType === RobotActionType.SHOOTING) {
      if (!context.isGoodShootingPosition) {
        risk += 0.2;
      }
      if (!context.hasClearShotPath) {
        risk += 0.3;
      }
    }

    return Math.min(1, risk);
  }

  /**
   * Calculate total value from factors
   */
  private calculateTotalValue(factors: ActionValueFactors): number {
    const value =
      this.config.distanceWeight * factors.distanceCost +
      this.config.timeWeight * factors.timeEstimate +
      this.config.pointsWeight * factors.expectedPoints * factors.strategicMultiplier +
      this.config.riskWeight * factors.riskFactor;

    return value;
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(
    candidate: ActionCandidate,
    factors: ActionValueFactors,
    context: StrategyContext
  ): string {
    const parts: string[] = [];

    parts.push(`Action: ${candidate.actionType}`);

    if (factors.expectedPoints > 0) {
      parts.push(`Expected: ${factors.expectedPoints.toFixed(1)} pts`);
    }

    if (factors.strategicMultiplier !== 1.0) {
      parts.push(`Strategic: x${factors.strategicMultiplier.toFixed(1)}`);
    }

    if (factors.distanceCost > 0.3) {
      parts.push(`Distance: far`);
    }

    if (factors.riskFactor > 0.3) {
      parts.push(`Risk: high`);
    }

    if (!context.canScore && candidate.actionType === RobotActionType.SHOOTING) {
      parts.push(`Warning: cannot score this phase`);
    }

    return parts.join(' | ');
  }

  /**
   * Calculate shooting position (move toward target until in range)
   */
  private calculateShootingPosition(
    robotPos: Position,
    target: ScoringTarget,
    range: number
  ): Position {
    const dx = target.position.x - robotPos.x;
    const dy = target.position.y - robotPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= range) {
      return robotPos;
    }

    // Move along line toward target, stopping at range
    const moveDistance = distance - range + 10; // 10 inch buffer
    const ratio = moveDistance / distance;

    return {
      x: robotPos.x + dx * ratio,
      y: robotPos.y + dy * ratio,
    };
  }

  /**
   * Estimate move time based on distance and robot config
   */
  private estimateMoveTime(
    from: Position,
    to: Position,
    robotConfig: { topSpeed: number; acceleration: number }
  ): number {
    const distance = this.distanceTo(from, to);

    // Simple physics estimate: time = distance / speed
    // Account for acceleration by adding 20%
    return (distance / robotConfig.topSpeed) * 1.2;
  }

  /**
   * Calculate distance between two positions
   */
  private distanceTo(from: Position, to: Position): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
