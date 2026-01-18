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


def _calculate_stopping_distance(velocity: float, acceleration: float) -> float:
    """Calculate distance needed to stop at given velocity and deceleration."""
    if acceleration <= 0:
        return float('inf')
    return (velocity * velocity) / (2 * acceleration)


def _normalize_angle(angle: float) -> float:
    """Normalize angle to 0-360 range."""
    while angle < 0:
        angle += 360
    while angle >= 360:
        angle -= 360
    return angle


def _angle_difference(a: float, b: float) -> float:
    """Calculate the shortest angle difference between two angles."""
    diff = b - a
    while diff > 180:
        diff -= 360
    while diff < -180:
        diff += 360
    return diff


def update_robot_movement(
    robot: Robot,
    target: Optional[Position],
    field: Field,
    delta_time: float,
) -> MovementResult:
    """Update robot movement towards target.

    Returns the new position, heading, velocity, and whether target was reached.
    Matches TypeScript implementation in src/robot/Movement.ts.
    """
    # If no target, decelerate to stop
    if target is None:
        deceleration = robot.config.acceleration * 2
        new_velocity = max(0.0, robot.velocity - deceleration * delta_time)
        return MovementResult(
            position=robot.position,
            heading=robot.heading,
            velocity=new_velocity,
            reached_target=True,
            blocked=False,
        )

    # Calculate direction to target
    dx = target.x - robot.position.x
    dy = target.y - robot.position.y
    distance = math.sqrt(dx * dx + dy * dy)

    # Check if we've reached the target (2 inches threshold like TypeScript)
    arrival_threshold = 2.0
    if distance < arrival_threshold:
        return MovementResult(
            position=robot.position,
            heading=robot.heading,
            velocity=0.0,
            reached_target=True,
            blocked=False,
        )

    # Get terrain modifiers at current position
    speed_multiplier = field.get_speed_multiplier_at(robot.position)

    # Calculate desired heading (degrees, 0 = right, 90 = up)
    desired_heading = math.degrees(math.atan2(dy, dx))

    # Turn towards target
    heading_diff = _angle_difference(robot.heading, desired_heading)
    max_turn = robot.config.turnRate * delta_time
    if abs(heading_diff) <= max_turn:
        new_heading = desired_heading
    else:
        new_heading = robot.heading + (max_turn if heading_diff > 0 else -max_turn)
    new_heading = _normalize_angle(new_heading)

    # Calculate forward/backward movement based on heading alignment
    heading_error = abs(_angle_difference(new_heading, desired_heading))
    if heading_error < 90:
        forward_factor = math.cos(math.radians(heading_error))
    else:
        forward_factor = 0.0

    # Calculate velocity
    new_velocity = robot.velocity
    effective_top_speed = robot.config.topSpeed * speed_multiplier

    if forward_factor > 0.1:
        # Accelerate
        acceleration = robot.config.acceleration * speed_multiplier
        new_velocity = min(effective_top_speed, new_velocity + acceleration * delta_time)
    else:
        # Decelerate when turning sharply
        deceleration = robot.config.acceleration * 2
        new_velocity = max(0.0, new_velocity - deceleration * delta_time)

    # Slow down when approaching target
    stopping_distance = _calculate_stopping_distance(new_velocity, robot.config.acceleration)
    if distance < stopping_distance * 1.5:
        decel = robot.config.acceleration * 1.5
        new_velocity = max(10.0, new_velocity - decel * delta_time)

    # Calculate displacement (forward_factor affects actual movement, not speed)
    displacement = new_velocity * forward_factor * delta_time
    heading_rad = math.radians(new_heading)
    new_x = robot.position.x + math.cos(heading_rad) * displacement
    new_y = robot.position.y + math.sin(heading_rad) * displacement

    # Clamp to target if overshooting
    new_dist = math.sqrt((new_x - target.x) ** 2 + (new_y - target.y) ** 2)
    if new_dist > distance:
        new_x = target.x
        new_y = target.y

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
