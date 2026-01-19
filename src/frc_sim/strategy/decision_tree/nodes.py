"""Base classes for decision tree nodes."""

from __future__ import annotations
from abc import ABC, abstractmethod
from enum import Enum
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..base import StrategyContext, StrategyDecision


class ComparisonOp(Enum):
    """Comparison operators for numeric conditions."""
    EQ = "=="
    NE = "!="
    LT = "<"
    LE = "<="
    GT = ">"
    GE = ">="

    def compare(self, a: float, b: float) -> bool:
        """Compare two values using this operator."""
        if self == ComparisonOp.EQ:
            return a == b
        elif self == ComparisonOp.NE:
            return a != b
        elif self == ComparisonOp.LT:
            return a < b
        elif self == ComparisonOp.LE:
            return a <= b
        elif self == ComparisonOp.GT:
            return a > b
        elif self == ComparisonOp.GE:
            return a >= b
        return False


class DecisionNode(ABC):
    """Abstract base class for all decision tree nodes."""

    @abstractmethod
    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        """Evaluate this node and return a decision, or None if no decision can be made."""
        pass


class ConditionNode(DecisionNode):
    """Base class for condition nodes that evaluate to a boolean."""

    @abstractmethod
    def check(self, context: StrategyContext) -> bool:
        """Check if this condition is true."""
        pass

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        """Condition nodes don't produce decisions directly."""
        return None


class ActionNode(DecisionNode):
    """Base class for action nodes that produce strategy decisions."""

    def __init__(self, priority: int = 5, reason: str = ""):
        self.priority = priority
        self.reason = reason

    @abstractmethod
    def get_action(self, context: StrategyContext) -> Optional[StrategyDecision]:
        """Get the action to perform."""
        pass

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        """Action nodes produce decisions via get_action."""
        return self.get_action(context)


class SelectorNode(DecisionNode):
    """Base class for selector nodes that route between children."""

    def __init__(self, children: Optional[list[DecisionNode]] = None):
        self.children = children or []

    def add_child(self, child: DecisionNode) -> SelectorNode:
        """Add a child node."""
        self.children.append(child)
        return self
