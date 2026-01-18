"""Base strategy interface."""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from ..types.enums import MatchPhase, RobotActionType, ShiftParity
from ..types.schemas import (
    Position,
    FieldConfig,
    RobotState,
    BallData,
    ScoringTarget,
    GameState,
    RobotAction,
)


@dataclass
class StrategyContext:
    """Context provided to strategy for decision making."""

    # Core state
    game_state: GameState
    robot: RobotState
    field: FieldConfig

    # Other robots
    teammates: list[RobotState]
    opponents: list[RobotState]

    # Ball information
    available_balls: list[BallData]
    unclaimed_balls: list[BallData]
    teammate_balls: list[BallData]

    # Scoring
    scoring_targets: list[ScoringTarget]

    # Nearest items
    nearest_ball_distance: Optional[float] = None
    nearest_ball: Optional[BallData] = None
    nearest_unclaimed_ball_distance: Optional[float] = None
    nearest_unclaimed_ball: Optional[BallData] = None
    nearest_scoring_target_distance: Optional[float] = None
    nearest_scoring_target: Optional[ScoringTarget] = None

    # Status flags
    in_shooting_range: bool = False
    phase: MatchPhase = MatchPhase.PRE_MATCH
    phase_time_remaining: float = 0.0
    current_shift: Optional[int] = None
    alliance_parity: Optional[ShiftParity] = None
    can_score: bool = True

    # Climbing
    can_auto_climb: bool = False
    alliance_can_auto_climb: bool = True
    alliance_can_endgame_climb: bool = True
    alliance_auto_climb_count: int = 0
    alliance_endgame_climb_count: int = 0
    is_near_climbing_zone: bool = False
    climbing_zone_position: Optional[Position] = None

    # Shot quality
    has_clear_shot_path: bool = True
    is_good_shooting_position: bool = True
    is_on_own_side: bool = True
    is_in_no_score_zone: bool = False


@dataclass
class StrategyDecision:
    """Decision returned by a strategy."""

    action: RobotAction
    priority: int = 5  # 1-10, higher = more important
    reason: str = ""


class Strategy(ABC):
    """Base class for robot strategies."""

    def __init__(self, strategy_id: str):
        self.id = strategy_id

    @abstractmethod
    def decide(self, context: StrategyContext) -> StrategyDecision:
        """Make a decision based on the current context.

        Returns a StrategyDecision with the action to take.
        """
        pass

    def create_idle_action(self) -> RobotAction:
        """Create an idle action."""
        return RobotAction(
            type=RobotActionType.IDLE.value,
            progress=0.0,
            startedAt=0,
        )

    def create_move_action(self, target: Position) -> RobotAction:
        """Create a move action."""
        return RobotAction(
            type=RobotActionType.MOVING.value,
            progress=0.0,
            startedAt=0,
            targetPosition=target,
        )

    def create_pickup_action(self, ball_id: str) -> RobotAction:
        """Create a pickup action."""
        return RobotAction(
            type=RobotActionType.PICKING_UP.value,
            progress=0.0,
            startedAt=0,
            targetBallId=ball_id,
        )

    def create_shoot_action(self, target_id: str) -> RobotAction:
        """Create a shoot action."""
        return RobotAction(
            type=RobotActionType.SHOOTING.value,
            progress=0.0,
            startedAt=0,
            targetScoringZoneId=target_id,
        )

    def create_climb_action(self, level: int = 1, is_auto: bool = False) -> RobotAction:
        """Create a climb action."""
        return RobotAction(
            type=RobotActionType.CLIMBING.value,
            progress=0.0,
            startedAt=0,
            targetClimbLevel=level,
            isAutoClimb=is_auto,
        )
