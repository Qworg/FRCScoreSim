"""Action node implementations for decision trees."""

from __future__ import annotations
from typing import Optional, TYPE_CHECKING

from .nodes import ActionNode
from ..base import StrategyDecision
from ...types.enums import RobotActionType
from ...types.schemas import RobotAction, Position

if TYPE_CHECKING:
    from ..base import StrategyContext


class IdleAction(ActionNode):
    """Returns an idle decision."""

    def __init__(self, priority: int = 1, reason: str = ""):
        super().__init__(priority, reason or "Idle")

    def get_action(self, context: StrategyContext) -> Optional[StrategyDecision]:
        return StrategyDecision(
            action=RobotAction(
                type=RobotActionType.IDLE.value,
                progress=0.0,
                startedAt=0,
            ),
            priority=self.priority,
            reason=self.reason,
        )


class MoveToBallAction(ActionNode):
    """Move to nearest unclaimed ball."""

    def __init__(self, priority: int = 5, reason: str = ""):
        super().__init__(priority, reason or "Moving to ball")

    def get_action(self, context: StrategyContext) -> Optional[StrategyDecision]:
        # Prefer unclaimed balls, fall back to any available ball
        target_ball = context.nearest_unclaimed_ball or context.nearest_ball
        if not target_ball:
            return None

        return StrategyDecision(
            action=RobotAction(
                type=RobotActionType.MOVING.value,
                progress=0.0,
                startedAt=0,
                targetPosition=target_ball.position,
            ),
            priority=self.priority,
            reason=self.reason,
        )


class MoveToScoringTargetAction(ActionNode):
    """Move to nearest scoring target."""

    def __init__(self, priority: int = 6, reason: str = ""):
        super().__init__(priority, reason or "Moving to scoring target")

    def get_action(self, context: StrategyContext) -> Optional[StrategyDecision]:
        if not context.nearest_scoring_target:
            return None

        return StrategyDecision(
            action=RobotAction(
                type=RobotActionType.MOVING.value,
                progress=0.0,
                startedAt=0,
                targetPosition=context.nearest_scoring_target.position,
            ),
            priority=self.priority,
            reason=self.reason,
        )


class MoveToClimbingZoneAction(ActionNode):
    """Move to climbing zone."""

    def __init__(self, priority: int = 9, reason: str = ""):
        super().__init__(priority, reason or "Moving to climbing zone")

    def get_action(self, context: StrategyContext) -> Optional[StrategyDecision]:
        if not context.climbing_zone_position:
            return None

        return StrategyDecision(
            action=RobotAction(
                type=RobotActionType.MOVING.value,
                progress=0.0,
                startedAt=0,
                targetPosition=context.climbing_zone_position,
            ),
            priority=self.priority,
            reason=self.reason,
        )


class MoveToPositionAction(ActionNode):
    """Move to a specific position."""

    def __init__(self, position: Position, priority: int = 5, reason: str = ""):
        super().__init__(priority, reason or "Moving to position")
        self.position = position

    def get_action(self, context: StrategyContext) -> Optional[StrategyDecision]:
        return StrategyDecision(
            action=RobotAction(
                type=RobotActionType.MOVING.value,
                progress=0.0,
                startedAt=0,
                targetPosition=self.position,
            ),
            priority=self.priority,
            reason=self.reason,
        )


class ShootAction(ActionNode):
    """Shoot at nearest scoring target."""

    def __init__(self, priority: int = 8, reason: str = ""):
        super().__init__(priority, reason or "Shooting")

    def get_action(self, context: StrategyContext) -> Optional[StrategyDecision]:
        if not context.nearest_scoring_target:
            return None

        return StrategyDecision(
            action=RobotAction(
                type=RobotActionType.SHOOTING.value,
                progress=0.0,
                startedAt=0,
                targetScoringZoneId=context.nearest_scoring_target.id,
            ),
            priority=self.priority,
            reason=self.reason,
        )


class ClimbAction(ActionNode):
    """Initiate climb (auto or endgame)."""

    def __init__(
        self,
        is_auto: bool = False,
        level: Optional[int] = None,
        priority: int = 9,
        reason: str = "",
    ):
        super().__init__(priority, reason or ("Auto climb" if is_auto else "Endgame climb"))
        self.is_auto = is_auto
        self.level = level

    def get_action(self, context: StrategyContext) -> Optional[StrategyDecision]:
        # Determine climb level
        level = self.level
        if level is None:
            level = 1 if self.is_auto else context.robot.config.climbLevel

        return StrategyDecision(
            action=RobotAction(
                type=RobotActionType.CLIMBING.value,
                progress=0.0,
                startedAt=0,
                targetClimbLevel=level,
                isAutoClimb=self.is_auto,
            ),
            priority=self.priority,
            reason=self.reason,
        )


class PickupBallAction(ActionNode):
    """Pick up the nearest ball."""

    def __init__(self, priority: int = 5, reason: str = ""):
        super().__init__(priority, reason or "Picking up ball")

    def get_action(self, context: StrategyContext) -> Optional[StrategyDecision]:
        target_ball = context.nearest_unclaimed_ball or context.nearest_ball
        if not target_ball:
            return None

        return StrategyDecision(
            action=RobotAction(
                type=RobotActionType.PICKING_UP.value,
                progress=0.0,
                startedAt=0,
                targetBallId=target_ball.id,
            ),
            priority=self.priority,
            reason=self.reason,
        )
