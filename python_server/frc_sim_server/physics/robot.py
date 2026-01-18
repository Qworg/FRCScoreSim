"""Robot movement physics."""

from __future__ import annotations
import math
from dataclasses import dataclass
from typing import Optional

from ..types.schemas import Position
from ..entities.robot import Robot
from ..field.field import Field


@dataclass
class MovementResult:
    """Result of robot movement update."""
    position: Position
    heading: float
    velocity: float
    reached_target: bool
    blocked: bool


def update_robot_movement(
    robot: Robot,
    target: Optional[Position],
    field: Field,
    delta_time: float,
) -> MovementResult:
    """Update robot movement towards target.

    Returns the new position, heading, velocity, and whether target was reached.
    """
    if target is None:
        return MovementResult(
            position=robot.position,
            heading=robot.heading,
            velocity=0.0,
            reached_target=True,
            blocked=False,
        )

    # Calculate direction to target
    dx = target.x - robot.position.x
    dy = target.y - robot.position.y
    distance = math.sqrt(dx * dx + dy * dy)

    # Check if we've reached the target
    arrival_threshold = 6.0  # 6 inches
    if distance < arrival_threshold:
        return MovementResult(
            position=robot.position,
            heading=robot.heading,
            velocity=0.0,
            reached_target=True,
            blocked=False,
        )

    # Calculate target heading (degrees, 0 = right, 90 = up)
    target_heading = math.degrees(math.atan2(dy, dx))

    # Calculate heading difference
    heading_diff = target_heading - robot.heading
    # Normalize to -180 to 180
    while heading_diff > 180:
        heading_diff -= 360
    while heading_diff < -180:
        heading_diff += 360

    # Turn towards target
    max_turn = robot.config.turnRate * delta_time
    if abs(heading_diff) <= max_turn:
        new_heading = target_heading
    else:
        new_heading = robot.heading + (max_turn if heading_diff > 0 else -max_turn)

    # Normalize heading to 0-360
    while new_heading < 0:
        new_heading += 360
    while new_heading >= 360:
        new_heading -= 360

    # Calculate speed based on heading alignment
    # Slow down when turning significantly
    alignment = 1.0 - min(abs(heading_diff) / 90.0, 1.0)
    target_speed = robot.config.topSpeed * alignment

    # Get zone speed multiplier
    speed_mult = field.get_speed_multiplier_at(robot.position)
    target_speed *= speed_mult

    # Apply acceleration
    speed_diff = target_speed - robot.velocity
    max_accel = robot.config.acceleration * delta_time
    if abs(speed_diff) <= max_accel:
        new_velocity = target_speed
    else:
        new_velocity = robot.velocity + (max_accel if speed_diff > 0 else -max_accel)

    # Clamp velocity
    new_velocity = max(0.0, min(robot.config.topSpeed, new_velocity))

    # Calculate new position
    heading_rad = math.radians(new_heading)
    move_dist = new_velocity * delta_time
    new_x = robot.position.x + math.cos(heading_rad) * move_dist
    new_y = robot.position.y + math.sin(heading_rad) * move_dist

    # Clamp to field bounds
    margin = robot.config.width / 2
    new_x = max(margin, min(field.width - margin, new_x))
    new_y = max(margin, min(field.height - margin, new_y))

    new_pos = Position(x=new_x, y=new_y)

    # Check if movement was blocked (didn't move much when trying to)
    actual_move = math.sqrt(
        (new_pos.x - robot.position.x) ** 2
        + (new_pos.y - robot.position.y) ** 2
    )
    blocked = new_velocity > 1.0 and actual_move < 0.5

    return MovementResult(
        position=new_pos,
        heading=new_heading,
        velocity=new_velocity,
        reached_target=False,
        blocked=blocked,
    )
