"""
Collector strategy - collects balls and scores when full or when can't score.
"""

from ..protocol import WorldState, RobotCommand, RobotAction, BallState
from .base import BaseStrategy


class CollectorStrategy(BaseStrategy):
    """
    A strategy that prioritizes collecting balls.

    Behavior:
    - If holding balls and in scoring phase and in range: shoot
    - If can pick up balls: find nearest ball and move to it / pick it up
    - Otherwise: move towards center or idle
    """

    def __init__(self, ball_capacity: int = 60, shooting_range: float = 200):
        super().__init__()
        self.ball_capacity = ball_capacity
        self.shooting_range = shooting_range

    def decide(self, world_state: WorldState) -> RobotCommand:
        """Decide what action to take."""
        my_robot = world_state.my_robot
        tick = world_state.tick

        # If disabled, idle
        if my_robot.is_disabled:
            return RobotCommand.idle(tick, my_robot.id)

        # If currently doing a non-interruptible action, idle
        if my_robot.action in (RobotAction.SHOOTING, RobotAction.PICKING_UP, RobotAction.CLIMBING):
            return RobotCommand.idle(tick, my_robot.id)

        # If holding balls and can score
        if self.has_balls(world_state) and world_state.can_alliance_score():
            # Check if in shooting range
            if self.is_in_shooting_range(world_state, self.shooting_range):
                target_id = self.get_scoring_target_id(world_state)
                if target_id:
                    return RobotCommand.shoot(tick, my_robot.id, target_id)

            # Move towards scoring target
            target_pos = self.find_scoring_target_position(world_state)
            if target_pos:
                return RobotCommand.move_to(tick, my_robot.id, target_pos[0], target_pos[1])

        # If we can pick up balls, find one
        if self.can_pick_up(world_state, self.ball_capacity):
            nearest_ball = self.find_nearest_ball(world_state)
            if nearest_ball:
                dist = self.distance_to_ball(my_robot, nearest_ball)

                # If close enough, pick up
                if dist < 24:  # Pickup range
                    return RobotCommand.pick_up(tick, my_robot.id, nearest_ball.id)

                # Otherwise move towards it
                return RobotCommand.move_to(tick, my_robot.id, nearest_ball.x, nearest_ball.y)

        # Default: move towards center
        if self.field_config:
            center_x = self.field_config.width / 2
            center_y = self.field_config.height / 2
            return RobotCommand.move_to(tick, my_robot.id, center_x, center_y)

        return RobotCommand.idle(tick, my_robot.id)
