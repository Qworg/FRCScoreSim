"""
Base strategy class that other strategies can inherit from.
"""

import math
from typing import Optional

from ..protocol import (
    WorldState,
    RobotCommand,
    FieldConfig,
    MatchResult,
    BallStateData,
    RobotState,
    Alliance,
)


class BaseStrategy:
    """
    Base class for robot strategies.

    Provides common utilities for distance calculation, finding nearest objects,
    and determining scoring targets.
    """

    def __init__(self):
        self.field_config: Optional[FieldConfig] = None
        self.scoring_target_id: Optional[str] = None

    def decide(self, world_state: WorldState) -> RobotCommand:
        """
        Make a decision based on the current world state.

        Override this in subclasses to implement strategy logic.
        """
        return RobotCommand.idle(world_state.tick, world_state.my_robot.id)

    def on_field_config(self, config: FieldConfig) -> None:
        """Called when field configuration is received."""
        self.field_config = config
        # Find our alliance's scoring target
        alliance_name = "red" if self._get_my_alliance(None) == Alliance.RED else "blue"
        for target in config.scoring_targets:
            if target.get("alliance") == alliance_name:
                self.scoring_target_id = target.get("id")
                break

    def on_match_end(self, result: MatchResult) -> None:
        """Called when the match ends."""
        pass

    def _get_my_alliance(self, world_state: Optional[WorldState]) -> Alliance:
        """Get our alliance. Uses RED as default before first tick."""
        if world_state:
            return world_state.my_robot.alliance
        return Alliance.RED

    @staticmethod
    def distance(x1: float, y1: float, x2: float, y2: float) -> float:
        """Calculate Euclidean distance between two points."""
        return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    @staticmethod
    def distance_to_ball(robot: RobotState, ball: BallStateData) -> float:
        """Calculate distance from robot to ball."""
        return BaseStrategy.distance(robot.x, robot.y, ball.x, ball.y)

    @staticmethod
    def distance_to_robot(robot: RobotState, other: RobotState) -> float:
        """Calculate distance between two robots."""
        return BaseStrategy.distance(robot.x, robot.y, other.x, other.y)

    def find_nearest_ball(self, world_state: WorldState) -> Optional[BallStateData]:
        """Find the nearest available ball."""
        available = world_state.get_available_balls()
        if not available:
            return None

        my_robot = world_state.my_robot
        return min(available, key=lambda b: self.distance_to_ball(my_robot, b))

    def find_scoring_target_position(self, world_state: WorldState) -> Optional[tuple[float, float]]:
        """Find the position of our scoring target."""
        if not self.field_config:
            return None

        alliance_name = "red" if world_state.my_robot.alliance == Alliance.RED else "blue"

        for target in self.field_config.scoring_targets:
            if target.get("alliance") == alliance_name:
                pos = target.get("position", {})
                return pos.get("x", 0), pos.get("y", 0)

        return None

    def get_scoring_target_id(self, world_state: WorldState) -> Optional[str]:
        """Get the scoring target ID for our alliance."""
        if not self.field_config:
            return None

        alliance_name = "red" if world_state.my_robot.alliance == Alliance.RED else "blue"

        for target in self.field_config.scoring_targets:
            if target.get("alliance") == alliance_name:
                return target.get("id")

        return None

    def is_in_shooting_range(self, world_state: WorldState, range_inches: float = 200) -> bool:
        """Check if we're in shooting range of the scoring target."""
        target_pos = self.find_scoring_target_position(world_state)
        if not target_pos:
            return False

        my_robot = world_state.my_robot
        dist = self.distance(my_robot.x, my_robot.y, target_pos[0], target_pos[1])
        return dist <= range_inches

    def has_balls(self, world_state: WorldState) -> bool:
        """Check if the robot is holding any balls."""
        return world_state.my_robot.held_balls > 0

    def can_pick_up(self, world_state: WorldState, max_capacity: int = 60) -> bool:
        """Check if the robot can pick up more balls."""
        return world_state.my_robot.held_balls < max_capacity
