"""Collision detection and resolution."""

from __future__ import annotations
import math
import random

from ..types.schemas import Position, BallVelocity, BallPhysicsConfig, DEFAULT_BALL_PHYSICS
from ..entities.robot import Robot
from ..entities.ball import Ball
from ..field.field import Field

# Collision threshold multiplier for robot-robot collisions.
# Using the same value for detection and separation prevents hysteresis/oscillation.
COLLISION_THRESHOLD = 0.85


def are_robots_colliding(robot1: Robot, robot2: Robot) -> bool:
    """Check if two robots are colliding."""
    dx = robot1.position.x - robot2.position.x
    dy = robot1.position.y - robot2.position.y
    distance = math.sqrt(dx * dx + dy * dy)

    # Collision radius is half the diagonal of each robot
    r1 = math.sqrt(robot1.config.width ** 2 + robot1.config.length ** 2) / 2
    r2 = math.sqrt(robot2.config.width ** 2 + robot2.config.length ** 2) / 2

    return distance < (r1 + r2) * COLLISION_THRESHOLD


def separate_robots(
    robot1: Robot,
    robot2: Robot,
    field: Field,
) -> tuple[Position, Position]:
    """Separate two colliding robots."""
    dx = robot2.position.x - robot1.position.x
    dy = robot2.position.y - robot1.position.y
    distance = math.sqrt(dx * dx + dy * dy)

    if distance < 0.001:
        # Robots are at same position - push apart randomly
        dx, dy = 1.0, 0.0
        distance = 1.0

    # Normalize direction
    nx = dx / distance
    ny = dy / distance

    # Calculate minimum separation distance
    r1 = math.sqrt(robot1.config.width ** 2 + robot1.config.length ** 2) / 2
    r2 = math.sqrt(robot2.config.width ** 2 + robot2.config.length ** 2) / 2
    min_dist = (r1 + r2) * COLLISION_THRESHOLD

    # Calculate overlap
    overlap = min_dist - distance
    if overlap <= 0:
        return robot1.position, robot2.position

    # Move each robot half the overlap
    sep = overlap / 2 + 1.0  # Extra buffer

    new_pos1 = Position(
        x=robot1.position.x - nx * sep,
        y=robot1.position.y - ny * sep,
    )
    new_pos2 = Position(
        x=robot2.position.x + nx * sep,
        y=robot2.position.y + ny * sep,
    )

    # Clamp to field bounds
    margin = max(robot1.config.width, robot2.config.width) / 2
    new_pos1 = field.clamp_to_bounds(new_pos1, margin)
    new_pos2 = field.clamp_to_bounds(new_pos2, margin)

    return new_pos1, new_pos2


def handle_robot_ball_collisions(
    robots: list[Robot],
    balls: list[Ball],
    field: Field,
    ball_radius: float = DEFAULT_BALL_PHYSICS.radius,
) -> None:
    """Handle collisions between robots and balls."""
    for robot in robots:
        if robot.is_disabled or robot.has_climbed:
            continue

        # Collision radius - must be smaller than pickup range
        pickup_range = 12.0
        max_collision_radius = pickup_range - ball_radius - 1
        robot_radius = min(robot.config.length / 2 - 4, max_collision_radius)

        for ball in balls:
            if not ball.is_available():
                continue

            dx = ball.position.x - robot.position.x
            dy = ball.position.y - robot.position.y
            distance = math.sqrt(dx * dx + dy * dy)
            collision_distance = robot_radius + ball_radius

            if distance < collision_distance and distance > 0:
                # Push ball away from robot
                push_dir_x = dx / distance
                push_dir_y = dy / distance

                overlap = collision_distance - distance
                push_speed = max(50.0, robot.velocity * 0.5)

                new_x = ball.position.x + push_dir_x * (overlap + 5)
                new_y = ball.position.y + push_dir_y * (overlap + 5)

                # Clamp to field bounds
                new_x = max(ball_radius + 1, min(field.width - ball_radius - 1, new_x))
                new_y = max(ball_radius + 1, min(field.height - ball_radius - 1, new_y))

                ball.set_position(Position(x=new_x, y=new_y))
                ball.set_velocity(BallVelocity(
                    vx=push_dir_x * push_speed,
                    vy=push_dir_y * push_speed,
                    vz=0.0,
                ))


def handle_ball_ball_collisions(
    balls: list[Ball],
    field: Field,
    ball_radius: float = DEFAULT_BALL_PHYSICS.radius,
) -> None:
    """Handle collisions between balls."""
    min_distance = ball_radius * 2
    field_width = field.width
    field_height = field.height

    for i in range(len(balls)):
        ball_a = balls[i]
        if not ball_a.is_available():
            continue

        for j in range(i + 1, len(balls)):
            ball_b = balls[j]
            if not ball_b.is_available():
                continue

            dx = ball_b.position.x - ball_a.position.x
            dy = ball_b.position.y - ball_a.position.y
            distance = math.sqrt(dx * dx + dy * dy)

            if distance < min_distance and distance > 0:
                # Calculate separation
                nx = dx / distance
                ny = dy / distance

                overlap = min_distance - distance
                sep = overlap / 2 + 0.5

                # Move balls apart
                new_pos_a = Position(
                    x=max(ball_radius + 1, min(field_width - ball_radius - 1,
                                               ball_a.position.x - nx * sep)),
                    y=max(ball_radius + 1, min(field_height - ball_radius - 1,
                                               ball_a.position.y - ny * sep)),
                )
                new_pos_b = Position(
                    x=max(ball_radius + 1, min(field_width - ball_radius - 1,
                                               ball_b.position.x + nx * sep)),
                    y=max(ball_radius + 1, min(field_height - ball_radius - 1,
                                               ball_b.position.y + ny * sep)),
                )

                ball_a.set_position(new_pos_a)
                ball_b.set_position(new_pos_b)

                # Exchange velocity components (elastic collision)
                vel_a = ball_a.velocity
                vel_b = ball_b.velocity

                dvx = vel_a.vx - vel_b.vx
                dvy = vel_a.vy - vel_b.vy
                dvn = dvx * nx + dvy * ny

                if dvn > 0:  # Only if approaching
                    impulse = dvn * 0.8  # Coefficient of restitution

                    ball_a.set_velocity(BallVelocity(
                        vx=vel_a.vx - impulse * nx,
                        vy=vel_a.vy - impulse * ny,
                        vz=vel_a.vz,
                    ))
                    ball_b.set_velocity(BallVelocity(
                        vx=vel_b.vx + impulse * nx,
                        vy=vel_b.vy + impulse * ny,
                        vz=vel_b.vz,
                    ))

            elif distance == 0:
                # Same position - push apart randomly
                angle = random.random() * math.pi * 2
                offset = min_distance / 2 + 1

                ball_a.set_position(Position(
                    x=max(ball_radius + 1, min(field_width - ball_radius - 1,
                                               ball_a.position.x - math.cos(angle) * offset)),
                    y=max(ball_radius + 1, min(field_height - ball_radius - 1,
                                               ball_a.position.y - math.sin(angle) * offset)),
                ))
                ball_b.set_position(Position(
                    x=max(ball_radius + 1, min(field_width - ball_radius - 1,
                                               ball_b.position.x + math.cos(angle) * offset)),
                    y=max(ball_radius + 1, min(field_height - ball_radius - 1,
                                               ball_b.position.y + math.sin(angle) * offset)),
                ))
