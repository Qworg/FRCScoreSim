"""
Idle strategy - does nothing.
"""

from ..protocol import WorldState, RobotCommand
from .base import BaseStrategy


class IdleStrategy(BaseStrategy):
    """
    A simple strategy that always returns IDLE.

    Useful for testing or as a placeholder.
    """

    def decide(self, world_state: WorldState) -> RobotCommand:
        """Always return IDLE."""
        return RobotCommand.idle(world_state.tick, world_state.my_robot.id)
