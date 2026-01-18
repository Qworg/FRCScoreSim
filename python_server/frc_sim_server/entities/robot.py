"""Robot entity class."""

from __future__ import annotations
import uuid
from typing import Optional
from dataclasses import dataclass, field

from ..types.enums import RobotActionType
from ..types.schemas import Position, RobotConfig, RobotAction, RobotState


def create_idle_action(tick: int = 0) -> RobotAction:
    """Create an idle action."""
    return RobotAction(
        type=RobotActionType.IDLE.value,
        progress=0.0,
        startedAt=tick,
    )


@dataclass
class Robot:
    """Robot entity with state and behavior."""

    config: RobotConfig
    alliance: str
    position: Position
    heading: float
    velocity: float = 0.0
    held_balls: list[str] = field(default_factory=list)
    current_action: RobotAction = field(default_factory=lambda: create_idle_action())
    secondary_action: Optional[RobotAction] = None
    is_disabled: bool = False
    has_auto_climbed: bool = False
    has_climbed: bool = False
    current_climb_level: Optional[int] = None
    current_path: list[Position] = field(default_factory=list)
    path_index: int = 0

    @property
    def id(self) -> str:
        """Get robot ID."""
        return self.config.id

    def clone_state(self) -> RobotState:
        """Clone the robot state for serialization."""
        return RobotState(
            id=self.config.id,
            config=self.config,
            alliance=self.alliance,
            position=self.position,
            heading=self.heading,
            velocity=self.velocity,
            heldBalls=list(self.held_balls),
            currentAction=self.current_action,
            secondaryAction=self.secondary_action,
            disabled=self.is_disabled,
            hasAutoClimbed=self.has_auto_climbed,
            hasClimbed=self.has_climbed,
            currentClimbLevel=self.current_climb_level,
            currentPath=list(self.current_path),
            pathIndex=self.path_index,
        )

    def is_idle(self) -> bool:
        """Check if robot is idle."""
        return self.current_action.type == RobotActionType.IDLE.value

    def is_moving(self) -> bool:
        """Check if robot is moving."""
        return self.current_action.type == RobotActionType.MOVING.value

    def is_shooting(self) -> bool:
        """Check if robot is shooting."""
        return self.current_action.type == RobotActionType.SHOOTING.value

    def has_balls(self) -> bool:
        """Check if robot has any balls."""
        return len(self.held_balls) > 0

    def can_pick_up_ball(self) -> bool:
        """Check if robot can pick up another ball."""
        return len(self.held_balls) < self.config.ballCapacity

    def has_secondary_action(self) -> bool:
        """Check if robot has a secondary action in progress."""
        return self.secondary_action is not None

    def distance_to(self, pos: Position) -> float:
        """Calculate distance to a position."""
        dx = pos.x - self.position.x
        dy = pos.y - self.position.y
        return (dx * dx + dy * dy) ** 0.5

    def set_position(self, pos: Position) -> None:
        """Set robot position."""
        self.position = pos

    def set_heading(self, heading: float) -> None:
        """Set robot heading."""
        self.heading = heading

    def set_velocity(self, velocity: float) -> None:
        """Set robot velocity."""
        self.velocity = velocity

    def set_path(self, path: list[Position]) -> None:
        """Set the path for the robot to follow."""
        self.current_path = path
        self.path_index = 0

    def get_current_path_target(self) -> Optional[Position]:
        """Get the current target position on the path."""
        if self.path_index < len(self.current_path):
            return self.current_path[self.path_index]
        return None

    def advance_path(self) -> Optional[Position]:
        """Advance to the next path waypoint."""
        self.path_index += 1
        return self.get_current_path_target()

    def start_action(self, action: RobotAction, tick: int) -> None:
        """Start a new action."""
        self.current_action = RobotAction(
            type=action.type,
            progress=0.0,
            startedAt=tick,
            targetPosition=action.targetPosition,
            targetBallId=action.targetBallId,
            targetBallIds=action.targetBallIds,
            targetScoringZoneId=action.targetScoringZoneId,
            targetRobotId=action.targetRobotId,
            targetClimbLevel=action.targetClimbLevel,
            isAutoClimb=action.isAutoClimb,
        )

    def update_progress(self, progress: float) -> None:
        """Update action progress."""
        self.current_action = RobotAction(
            type=self.current_action.type,
            progress=progress,
            startedAt=self.current_action.startedAt,
            targetPosition=self.current_action.targetPosition,
            targetBallId=self.current_action.targetBallId,
            targetBallIds=self.current_action.targetBallIds,
            targetScoringZoneId=self.current_action.targetScoringZoneId,
            targetRobotId=self.current_action.targetRobotId,
            targetClimbLevel=self.current_action.targetClimbLevel,
            isAutoClimb=self.current_action.isAutoClimb,
        )

    def complete_action(self) -> None:
        """Complete the current action."""
        self.current_action = create_idle_action()
        self.current_path = []
        self.path_index = 0

    def pick_up_ball(self, ball_id: str) -> None:
        """Pick up a ball."""
        if ball_id not in self.held_balls:
            self.held_balls.append(ball_id)

    def shoot_ball(self) -> Optional[str]:
        """Shoot a ball and return its ID."""
        if self.held_balls:
            return self.held_balls.pop(0)
        return None

    def start_secondary_pickup(self, ball_id: str, tick: int) -> None:
        """Start a secondary pickup action."""
        self.secondary_action = RobotAction(
            type=RobotActionType.PICKING_UP.value,
            progress=0.0,
            startedAt=tick,
            targetBallId=ball_id,
        )

    def update_secondary_progress(self, progress: float) -> None:
        """Update secondary action progress."""
        if self.secondary_action:
            self.secondary_action = RobotAction(
                type=self.secondary_action.type,
                progress=progress,
                startedAt=self.secondary_action.startedAt,
                targetBallId=self.secondary_action.targetBallId,
            )

    def complete_secondary_action(self) -> None:
        """Complete the secondary action."""
        self.secondary_action = None

    def auto_climb(self) -> None:
        """Mark robot as having auto-climbed."""
        self.has_auto_climbed = True

    def endgame_climb(self, level: int) -> None:
        """Mark robot as having climbed in endgame."""
        self.has_climbed = True
        self.current_climb_level = level
