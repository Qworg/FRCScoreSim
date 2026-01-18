"""Idle strategy - robot does nothing."""

from .base import Strategy, StrategyContext, StrategyDecision


class IdleStrategy(Strategy):
    """Strategy that does nothing - robot stays idle."""

    def __init__(self):
        super().__init__("idle")

    def decide(self, context: StrategyContext) -> StrategyDecision:
        """Always return idle action."""
        return StrategyDecision(
            action=self.create_idle_action(),
            priority=1,
            reason="Idle strategy - doing nothing",
        )
