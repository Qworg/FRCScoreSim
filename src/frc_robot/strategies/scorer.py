"""
Scorer strategy - prioritizes scoring over collecting.
"""

from ..protocol import WorldState, RobotCommand, RobotAction
from .base import BaseStrategy


class ScorerStrategy(BaseStrategy):
    """
    A strategy that prioritizes scoring balls.

    Behavior:
    - If holding balls and can score: move to range and shoot
    - If not holding balls: collect
    - Prioritizes getting to scoring position over collecting more balls
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

        # SCORING PRIORITY: If holding balls
        if self.has_balls(world_state):
            # If can score, prioritize that
            if world_state.can_alliance_score():
                target_pos = self.find_scoring_target_position(world_state)
                if target_pos:
                    dist = self.distance(my_robot.x, my_robot.y, target_pos[0], target_pos[1])

                    # If in range, shoot
                    if dist <= self.shooting_range:
                        target_id = self.get_scoring_target_id(world_state)
                        if target_id:
                            return RobotCommand.shoot(tick, my_robot.id, target_id)

                    # Move towards scoring target
                    return RobotCommand.move_to(tick, my_robot.id, target_pos[0], target_pos[1])

            # Can't score right now, but we have balls - wait near scoring area
            target_pos = self.find_scoring_target_position(world_state)
            if target_pos:
                dist = self.distance(my_robot.x, my_robot.y, target_pos[0], target_pos[1])
                # If far from target, move closer
                if dist > self.shooting_range * 1.5:
                    return RobotCommand.move_to(tick, my_robot.id, target_pos[0], target_pos[1])
                # If close enough, can collect more while waiting
                if self.can_pick_up(world_state, self.ball_capacity):
                    return self._try_collect(world_state)

            return RobotCommand.idle(tick, my_robot.id)

        # No balls - need to collect
        return self._try_collect(world_state)

    def _try_collect(self, world_state: WorldState) -> RobotCommand:
        """Try to collect a ball."""
        my_robot = world_state.my_robot
        tick = world_state.tick

        if not self.can_pick_up(world_state, self.ball_capacity):
            return RobotCommand.idle(tick, my_robot.id)

        nearest_ball = self.find_nearest_ball(world_state)
        if nearest_ball:
            dist = self.distance_to_ball(my_robot, nearest_ball)

            # If close enough, pick up
            if dist < 24:  # Pickup range
                return RobotCommand.pick_up(tick, my_robot.id, nearest_ball.id)

            # Otherwise move towards it
            return RobotCommand.move_to(tick, my_robot.id, nearest_ball.x, nearest_ball.y)

        # No balls available - move to center
        if self.field_config:
            center_x = self.field_config.width / 2
            center_y = self.field_config.height / 2
            return RobotCommand.move_to(tick, my_robot.id, center_x, center_y)

        return RobotCommand.idle(tick, my_robot.id)
