"""Physics components."""

from .robot import update_robot_movement, MovementResult
from .ball import update_ball_physics, calculate_shot_velocity, BallUpdateResult
from .collision import (
    are_robots_colliding,
    separate_robots,
    handle_robot_ball_collisions,
    handle_ball_ball_collisions,
)

__all__ = [
    "update_robot_movement",
    "MovementResult",
    "update_ball_physics",
    "calculate_shot_velocity",
    "BallUpdateResult",
    "are_robots_colliding",
    "separate_robots",
    "handle_robot_ball_collisions",
    "handle_ball_ball_collisions",
]
