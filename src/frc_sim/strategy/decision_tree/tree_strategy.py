"""Decision tree based strategy implementation."""

from __future__ import annotations
from typing import TYPE_CHECKING

from .nodes import DecisionNode
from ..base import Strategy, StrategyContext, StrategyDecision
from ...types.enums import RobotActionType
from ...types.schemas import RobotAction

if TYPE_CHECKING:
    pass


def _create_idle_decision() -> StrategyDecision:
    """Create a fallback idle decision."""
    return StrategyDecision(
        action=RobotAction(
            type=RobotActionType.IDLE.value,
            progress=0.0,
            startedAt=0,
        ),
        priority=1,
        reason="Fallback idle",
    )


class DecisionTreeStrategy(Strategy):
    """Strategy that uses a decision tree to make decisions."""

    def __init__(self, strategy_id: str, root: DecisionNode):
        """Initialize the strategy with a decision tree root node.

        Args:
            strategy_id: Unique identifier for this strategy
            root: The root node of the decision tree
        """
        super().__init__(strategy_id)
        self.root = root

    def decide(self, context: StrategyContext) -> StrategyDecision:
        """Make a decision by evaluating the decision tree.

        Args:
            context: The current strategy context

        Returns:
            StrategyDecision from the tree, or a fallback idle decision
        """
        result = self.root.evaluate(context)
        if result is not None:
            return result
        return _create_idle_decision()
