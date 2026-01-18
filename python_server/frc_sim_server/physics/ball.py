"""Ball physics simulation."""

from __future__ import annotations
import math
from dataclasses import dataclass
from typing import Optional

from ..types.enums import BallState
from ..types.schemas import Position, BallVelocity, BallPhysicsConfig, DEFAULT_BALL_PHYSICS
from ..entities.ball import Ball
from ..field.field import Field


@dataclass
class BallUpdateResult:
    """Result of updating ball physics."""
    scored: bool
    scoring_target_id: Optional[str]
    out_of_bounds: bool
    landed: bool


def update_ball_physics(
    ball: Ball,
    field: Field,
    delta_time: float,
    tick: int,
    config: BallPhysicsConfig = DEFAULT_BALL_PHYSICS,
) -> BallUpdateResult:
    """Update ball physics for one tick."""
    result = BallUpdateResult(
        scored=False,
        scoring_target_id=None,
        out_of_bounds=False,
        landed=False,
    )

    if ball.state in (BallState.HELD, BallState.SCORED):
        return result

    if ball.state == BallState.IN_FLIGHT:
        return _update_flight_physics(ball, field, delta_time, tick, config)

    if ball.state == BallState.ON_FIELD:
        return _update_ground_physics(ball, field, delta_time, tick, config)

    return result


def _update_flight_physics(
    ball: Ball,
    field: Field,
    delta_time: float,
    tick: int,
    config: BallPhysicsConfig,
) -> BallUpdateResult:
    """Update physics for a ball in flight."""
    result = BallUpdateResult(
        scored=False,
        scoring_target_id=None,
        out_of_bounds=False,
        landed=False,
    )

    vel = ball.velocity

    # Apply gravity to vertical velocity
    new_vz = vel.vz - config.gravity * delta_time

    # Apply air resistance
    resistance = config.airResistance ** delta_time
    new_vx = vel.vx * resistance
    new_vy = vel.vy * resistance

    # Update position
    new_x = ball.position.x + new_vx * delta_time
    new_y = ball.position.y + new_vy * delta_time
    new_height = ball.height + vel.vz * delta_time - 0.5 * config.gravity * delta_time ** 2

    # Check for scoring
    scoring_check = _check_scoring(ball, Position(x=new_x, y=new_y), new_height, field)
    if scoring_check[0]:
        ball.score(tick)
        return BallUpdateResult(
            scored=True,
            scoring_target_id=scoring_check[1],
            out_of_bounds=False,
            landed=False,
        )

    # Handle wall bouncing
    new_x, new_y, new_vx, new_vy = _handle_wall_bounce(
        new_x, new_y, new_vx, new_vy, field, config.radius
    )

    # Check ramp collision
    ramp_height = field.get_ramp_height_at(Position(x=new_x, y=new_y))
    if ramp_height > 0 and new_height <= ramp_height:
        # Ball hits ramp - apply velocity reduction
        climb_factor = 0.7
        new_vx *= climb_factor
        new_vy *= climb_factor

        ball.land(Position(x=new_x, y=new_y), tick, ramp_height)
        ball.set_velocity(BallVelocity(vx=new_vx, vy=new_vy, vz=0.0))
        return BallUpdateResult(scored=False, scoring_target_id=None, out_of_bounds=False, landed=True)

    # Check if ball hit ground
    ground_height = ramp_height
    if new_height <= ground_height:
        ball.land(Position(x=new_x, y=new_y), tick, ground_height)
        ball.set_velocity(BallVelocity(vx=new_vx * 0.3, vy=new_vy * 0.3, vz=0.0))
        return BallUpdateResult(scored=False, scoring_target_id=None, out_of_bounds=False, landed=True)

    # Update ball state
    ball.set_position(Position(x=new_x, y=new_y))
    ball.set_height(new_height)
    ball.set_velocity(BallVelocity(vx=new_vx, vy=new_vy, vz=new_vz))

    return result


def _update_ground_physics(
    ball: Ball,
    field: Field,
    delta_time: float,
    tick: int,
    config: BallPhysicsConfig,
) -> BallUpdateResult:
    """Update physics for a ball on the ground."""
    result = BallUpdateResult(
        scored=False,
        scoring_target_id=None,
        out_of_bounds=False,
        landed=False,
    )

    vel = ball.velocity
    speed = math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy)

    # Ball has stopped
    if speed < config.minVelocity:
        ball.set_velocity(BallVelocity(vx=0.0, vy=0.0, vz=0.0))
        return result

    # Apply ground friction
    friction = config.groundFriction ** delta_time
    new_vx = vel.vx * friction
    new_vy = vel.vy * friction

    # Update position
    new_x = ball.position.x + new_vx * delta_time
    new_y = ball.position.y + new_vy * delta_time

    # Handle wall bouncing
    new_x, new_y, new_vx, new_vy = _handle_wall_bounce(
        new_x, new_y, new_vx, new_vy, field, config.radius, 0.5
    )

    # Handle ramp physics
    current_ramp_height = field.get_ramp_height_at(ball.position)
    new_pos = Position(x=new_x, y=new_y)
    new_ramp_height = field.get_ramp_height_at(new_pos)

    height_change = new_ramp_height - current_ramp_height

    if height_change > 0:
        # Ball is climbing - apply velocity reduction
        climb_penalty = math.sqrt(max(0.0, 1.0 - height_change * 0.02))
        new_vx *= climb_penalty
        new_vy *= climb_penalty
    elif height_change < 0:
        # Ball is rolling down - gains speed
        downhill_boost = min(1.15, 1.0 + abs(height_change) * 0.01)
        new_vx *= downhill_boost
        new_vy *= downhill_boost

    ball.set_position(new_pos)
    ball.set_height(new_ramp_height)
    ball.set_velocity(BallVelocity(vx=new_vx, vy=new_vy, vz=0.0))

    return result


def _handle_wall_bounce(
    x: float,
    y: float,
    vx: float,
    vy: float,
    field: Field,
    radius: float,
    bounce_factor: float = 0.7,
) -> tuple[float, float, float, float]:
    """Handle wall bouncing for a ball."""
    min_x = radius
    max_x = field.width - radius
    min_y = radius
    max_y = field.height - radius

    new_x, new_y = x, y
    new_vx, new_vy = vx, vy

    # Bounce off walls
    if new_x < min_x:
        new_x = min_x + (min_x - new_x)
        new_vx = -new_vx * bounce_factor
    elif new_x > max_x:
        new_x = max_x - (new_x - max_x)
        new_vx = -new_vx * bounce_factor

    if new_y < min_y:
        new_y = min_y + (min_y - new_y)
        new_vy = -new_vy * bounce_factor
    elif new_y > max_y:
        new_y = max_y - (new_y - max_y)
        new_vy = -new_vy * bounce_factor

    # Clamp to bounds
    new_x = max(min_x, min(max_x, new_x))
    new_y = max(min_y, min(max_y, new_y))

    return new_x, new_y, new_vx, new_vy


def _check_scoring(
    ball: Ball,
    position: Position,
    height: float,
    field: Field,
) -> tuple[bool, Optional[str]]:
    """Check if ball scores at any target."""
    if ball.shot_by_robot_id is None:
        return False, None

    # Check if shot from no-score zone
    if ball.shot_from_position and field.is_in_no_score_zone(ball.shot_from_position):
        return False, None

    for target in field.config.scoringTargets:
        dx = position.x - target.position.x
        dy = position.y - target.position.y
        distance = math.sqrt(dx * dx + dy * dy)

        # Check if within target radius
        if distance > target.radius:
            continue

        # Check height requirements
        if target.minHeight is not None and height < target.minHeight:
            continue
        if target.maxHeight is not None and height > target.maxHeight:
            continue

        return True, target.id

    return False, None


def calculate_shot_velocity(
    from_position: Position,
    target_position: Position,
    target_height: float,
    shot_speed: float = 300.0,
    gravity: float = DEFAULT_BALL_PHYSICS.gravity,
) -> BallVelocity:
    """Calculate initial velocity for a shot."""
    dx = target_position.x - from_position.x
    dy = target_position.y - from_position.y
    distance = math.sqrt(dx * dx + dy * dy)

    if distance < 0.001:
        return BallVelocity(vx=0.0, vy=0.0, vz=shot_speed)

    # Direction
    dir_x = dx / distance
    dir_y = dy / distance

    # Calculate horizontal and vertical components
    horizontal_speed = shot_speed * 0.8
    time_to_target = distance / horizontal_speed

    # Calculate required vertical velocity
    # h = vz*t - 0.5*g*t^2 -> vz = (h + 0.5*g*t^2) / t
    vz = (target_height + 0.5 * gravity * time_to_target ** 2) / time_to_target

    return BallVelocity(
        vx=dir_x * horizontal_speed,
        vy=dir_y * horizontal_speed,
        vz=min(vz, shot_speed),  # Cap vertical velocity
    )


def is_in_pickup_range(
    robot_position: Position,
    ball_position: Position,
    pickup_range: float = 18.0,
) -> bool:
    """Check if a ball is within pickup range of a robot."""
    dx = robot_position.x - ball_position.x
    dy = robot_position.y - ball_position.y
    return math.sqrt(dx * dx + dy * dy) <= pickup_range
