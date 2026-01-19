"""Condition node implementations for decision trees."""

from __future__ import annotations
from typing import Callable, Optional, TYPE_CHECKING

from .nodes import ConditionNode, ComparisonOp
from ...types.enums import MatchPhase, RobotActionType, ShiftParity

if TYPE_CHECKING:
    from ..base import StrategyContext


# =============================================================================
# Hopper/Ball Conditions
# =============================================================================


class HasBalls(ConditionNode):
    """Check if robot has at least N balls."""

    def __init__(self, min_count: int = 1):
        self.min_count = min_count

    def check(self, context: StrategyContext) -> bool:
        return len(context.robot.heldBalls) >= self.min_count


class HasCapacity(ConditionNode):
    """Check if robot has room for N more balls."""

    def __init__(self, min_free: int = 1):
        self.min_free = min_free

    def check(self, context: StrategyContext) -> bool:
        current = len(context.robot.heldBalls)
        capacity = context.robot.config.ballCapacity
        return (capacity - current) >= self.min_free


class HopperEmpty(ConditionNode):
    """Check if robot has zero balls."""

    def check(self, context: StrategyContext) -> bool:
        return len(context.robot.heldBalls) == 0


class HopperFull(ConditionNode):
    """Check if robot is at ball capacity."""

    def check(self, context: StrategyContext) -> bool:
        return len(context.robot.heldBalls) >= context.robot.config.ballCapacity


class HopperCount(ConditionNode):
    """Compare held ball count using operator."""

    def __init__(self, op: ComparisonOp, threshold: int):
        self.op = op
        self.threshold = threshold

    def check(self, context: StrategyContext) -> bool:
        return self.op.compare(len(context.robot.heldBalls), self.threshold)


class HopperPercent(ConditionNode):
    """Compare hopper fill percentage using operator."""

    def __init__(self, op: ComparisonOp, threshold: float):
        self.op = op
        self.threshold = threshold

    def check(self, context: StrategyContext) -> bool:
        current = len(context.robot.heldBalls)
        capacity = context.robot.config.ballCapacity
        percent = current / capacity if capacity > 0 else 0.0
        return self.op.compare(percent, self.threshold)


class BallsAvailable(ConditionNode):
    """Check if there are at least N unclaimed balls on field."""

    def __init__(self, min_count: int = 1):
        self.min_count = min_count

    def check(self, context: StrategyContext) -> bool:
        return len(context.unclaimed_balls) >= self.min_count


class NearestBallWithinRange(ConditionNode):
    """Check if nearest ball is within given distance."""

    def __init__(self, max_distance: float):
        self.max_distance = max_distance

    def check(self, context: StrategyContext) -> bool:
        if context.nearest_unclaimed_ball_distance is not None:
            return context.nearest_unclaimed_ball_distance <= self.max_distance
        return False


# =============================================================================
# Robot Climb State Conditions
# =============================================================================


class HasAutoClimbed(ConditionNode):
    """Check if robot has already auto climbed this match."""

    def check(self, context: StrategyContext) -> bool:
        return context.robot.hasAutoClimbed


class HasClimbed(ConditionNode):
    """Check if robot has already climbed (endgame)."""

    def check(self, context: StrategyContext) -> bool:
        return context.robot.hasClimbed


class IsClimbing(ConditionNode):
    """Check if robot is currently performing climb action."""

    def check(self, context: StrategyContext) -> bool:
        return context.robot.currentAction.type == RobotActionType.CLIMBING.value


class ClimbLevel(ConditionNode):
    """Compare current climb level using operator."""

    def __init__(self, op: ComparisonOp, level: int):
        self.op = op
        self.level = level

    def check(self, context: StrategyContext) -> bool:
        current_level = context.robot.currentClimbLevel or 0
        return self.op.compare(current_level, self.level)


# =============================================================================
# Robot Action State Conditions
# =============================================================================


class IsIdle(ConditionNode):
    """Check if robot has no current action."""

    def check(self, context: StrategyContext) -> bool:
        return context.robot.currentAction.type == RobotActionType.IDLE.value


class IsMoving(ConditionNode):
    """Check if robot is executing move action."""

    def check(self, context: StrategyContext) -> bool:
        return context.robot.currentAction.type == RobotActionType.MOVING.value


class IsShooting(ConditionNode):
    """Check if robot is executing shoot action."""

    def check(self, context: StrategyContext) -> bool:
        return context.robot.currentAction.type == RobotActionType.SHOOTING.value


class IsPickingUp(ConditionNode):
    """Check if robot is executing pickup action."""

    def check(self, context: StrategyContext) -> bool:
        return context.robot.currentAction.type == RobotActionType.PICKING_UP.value


class CurrentActionIs(ConditionNode):
    """Check if current action matches a specific type."""

    def __init__(self, action_type: RobotActionType):
        self.action_type = action_type

    def check(self, context: StrategyContext) -> bool:
        return context.robot.currentAction.type == self.action_type.value


# =============================================================================
# Robot Capabilities Conditions (from config)
# =============================================================================


class CanRobotClimb(ConditionNode):
    """Check if robot config allows climbing."""

    def check(self, context: StrategyContext) -> bool:
        return context.robot.config.canClimb


class CanRobotAutoClimb(ConditionNode):
    """Check if robot config allows auto climb."""

    def check(self, context: StrategyContext) -> bool:
        return context.robot.config.autoClimb


class MaxClimbLevel(ConditionNode):
    """Compare robot's max climb level using operator."""

    def __init__(self, op: ComparisonOp, level: int):
        self.op = op
        self.level = level

    def check(self, context: StrategyContext) -> bool:
        return self.op.compare(context.robot.config.climbLevel, self.level)


# =============================================================================
# Robot Status Conditions
# =============================================================================


class IsDisabled(ConditionNode):
    """Check if robot is disabled."""

    def check(self, context: StrategyContext) -> bool:
        return context.robot.disabled


class IsOnOwnSide(ConditionNode):
    """Check if robot is on own alliance side of field."""

    def check(self, context: StrategyContext) -> bool:
        return context.is_on_own_side


class Velocity(ConditionNode):
    """Compare robot velocity using operator."""

    def __init__(self, op: ComparisonOp, threshold: float):
        self.op = op
        self.threshold = threshold

    def check(self, context: StrategyContext) -> bool:
        return self.op.compare(context.robot.velocity, self.threshold)


# =============================================================================
# Scoring Conditions
# =============================================================================


class CanScore(ConditionNode):
    """Check if alliance can score in current phase."""

    def check(self, context: StrategyContext) -> bool:
        return context.can_score


class InShootingRange(ConditionNode):
    """Check if robot is within shooting range of target."""

    def check(self, context: StrategyContext) -> bool:
        return context.in_shooting_range


class HasScoringTarget(ConditionNode):
    """Check if valid scoring target exists."""

    def check(self, context: StrategyContext) -> bool:
        return context.nearest_scoring_target is not None


class IsGoodShootingPosition(ConditionNode):
    """Check if robot is in a good shooting position (not on ramp/trench/no-score zone)."""

    def check(self, context: StrategyContext) -> bool:
        return context.is_good_shooting_position


class HasClearShot(ConditionNode):
    """Check if there's an unobstructed path to target."""

    def check(self, context: StrategyContext) -> bool:
        return context.has_clear_shot_path


class IsInNoScoreZone(ConditionNode):
    """Check if robot is in a no-score zone."""

    def check(self, context: StrategyContext) -> bool:
        return context.is_in_no_score_zone


# =============================================================================
# Climbing Opportunity Conditions
# =============================================================================


class CanAutoClimb(ConditionNode):
    """Check if robot can auto climb now (phase + not climbed + alliance slot)."""

    def check(self, context: StrategyContext) -> bool:
        return context.can_auto_climb


class CanEndgameClimb(ConditionNode):
    """Check if robot can endgame climb now (phase + alliance slot)."""

    def check(self, context: StrategyContext) -> bool:
        return (
            context.phase == MatchPhase.ENDGAME
            and context.alliance_can_endgame_climb
            and not context.robot.hasClimbed
            and context.robot.config.canClimb
        )


class IsNearClimbingZone(ConditionNode):
    """Check if robot is near climbing zone."""

    def check(self, context: StrategyContext) -> bool:
        return context.is_near_climbing_zone


class HasClimbingZone(ConditionNode):
    """Check if climbing zone position is known."""

    def check(self, context: StrategyContext) -> bool:
        return context.climbing_zone_position is not None


# =============================================================================
# Phase Conditions
# =============================================================================


class IsPhase(ConditionNode):
    """Check if game is in a specific phase."""

    def __init__(self, phase: MatchPhase):
        self.phase = phase

    def check(self, context: StrategyContext) -> bool:
        return context.phase == self.phase


class IsAutoPhase(ConditionNode):
    """Check if game is in AUTO phase."""

    def check(self, context: StrategyContext) -> bool:
        return context.phase == MatchPhase.AUTO


class IsEndgamePhase(ConditionNode):
    """Check if game is in ENDGAME phase."""

    def check(self, context: StrategyContext) -> bool:
        return context.phase == MatchPhase.ENDGAME


class IsTransitionPhase(ConditionNode):
    """Check if game is in TRANSITION phase."""

    def check(self, context: StrategyContext) -> bool:
        return context.phase == MatchPhase.TRANSITION


class IsShiftPhase(ConditionNode):
    """Check if game is in any SHIFT phase (1-4)."""

    def check(self, context: StrategyContext) -> bool:
        return context.phase in (
            MatchPhase.SHIFT_1,
            MatchPhase.SHIFT_2,
            MatchPhase.SHIFT_3,
            MatchPhase.SHIFT_4,
        )


class CurrentShift(ConditionNode):
    """Compare current shift number using operator."""

    def __init__(self, op: ComparisonOp, shift_num: int):
        self.op = op
        self.shift_num = shift_num

    def check(self, context: StrategyContext) -> bool:
        if context.current_shift is None:
            return False
        return self.op.compare(context.current_shift, self.shift_num)


class PhaseTimeRemaining(ConditionNode):
    """Compare time remaining in current phase using operator."""

    def __init__(self, op: ComparisonOp, seconds: float):
        self.op = op
        self.seconds = seconds

    def check(self, context: StrategyContext) -> bool:
        return self.op.compare(context.phase_time_remaining, self.seconds)


class MatchTimeRemaining(ConditionNode):
    """Compare total match time remaining using operator."""

    def __init__(self, op: ComparisonOp, seconds: float):
        self.op = op
        self.seconds = seconds

    def check(self, context: StrategyContext) -> bool:
        # Calculate total match time remaining based on elapsed time
        # Total match time is approximately 160 seconds
        total_match_time = 160.0  # AUTO(20) + TRANSITION(10) + SHIFTS(100) + ENDGAME(30)
        remaining = total_match_time - context.game_state.elapsedTime
        return self.op.compare(remaining, self.seconds)


# =============================================================================
# Alliance Conditions
# =============================================================================


class AllianceParity(ConditionNode):
    """Check alliance parity (EVEN or ODD)."""

    def __init__(self, parity: ShiftParity):
        self.parity = parity

    def check(self, context: StrategyContext) -> bool:
        return context.alliance_parity == self.parity


class AllianceAutoClimbCount(ConditionNode):
    """Compare alliance's auto climb count using operator."""

    def __init__(self, op: ComparisonOp, count: int):
        self.op = op
        self.count = count

    def check(self, context: StrategyContext) -> bool:
        return self.op.compare(context.alliance_auto_climb_count, self.count)


class AllianceEndgameClimbCount(ConditionNode):
    """Compare alliance's endgame climb count using operator."""

    def __init__(self, op: ComparisonOp, count: int):
        self.op = op
        self.count = count

    def check(self, context: StrategyContext) -> bool:
        return self.op.compare(context.alliance_endgame_climb_count, self.count)


# =============================================================================
# Composite Conditions
# =============================================================================


class And(ConditionNode):
    """All conditions must be true."""

    def __init__(self, *conditions: ConditionNode):
        self.conditions = list(conditions)

    def check(self, context: StrategyContext) -> bool:
        return all(c.check(context) for c in self.conditions)


class Or(ConditionNode):
    """Any condition must be true."""

    def __init__(self, *conditions: ConditionNode):
        self.conditions = list(conditions)

    def check(self, context: StrategyContext) -> bool:
        return any(c.check(context) for c in self.conditions)


class Not(ConditionNode):
    """Invert condition result."""

    def __init__(self, condition: ConditionNode):
        self.condition = condition

    def check(self, context: StrategyContext) -> bool:
        return not self.condition.check(context)


class CustomCondition(ConditionNode):
    """Custom condition using a callable predicate."""

    def __init__(self, name: str, predicate: Callable[[StrategyContext], bool]):
        self.name = name
        self.predicate = predicate

    def check(self, context: StrategyContext) -> bool:
        return self.predicate(context)
