"""Selector node implementations for decision trees."""

from __future__ import annotations
from typing import Optional, TYPE_CHECKING

from .nodes import SelectorNode, DecisionNode, ConditionNode, ActionNode

if TYPE_CHECKING:
    from ..base import StrategyContext, StrategyDecision


class IfThenElse(SelectorNode):
    """Binary branch selector - evaluates condition and routes to then or else node."""

    def __init__(
        self,
        condition: ConditionNode,
        then_node: DecisionNode,
        else_node: Optional[DecisionNode] = None,
    ):
        super().__init__()
        self.condition = condition
        self.then_node = then_node
        self.else_node = else_node

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        if self.condition.check(context):
            return self.then_node.evaluate(context)
        elif self.else_node:
            return self.else_node.evaluate(context)
        return None


class Sequence(SelectorNode):
    """Try children in order - first one that returns a decision wins.

    Each child is evaluated in order. The first child that returns a
    non-None decision is returned. If all children return None, None is returned.
    """

    def __init__(self, *children: DecisionNode):
        super().__init__(list(children))

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        for child in self.children:
            result = child.evaluate(context)
            if result is not None:
                return result
        return None


class Fallback(SelectorNode):
    """Try children in order until one succeeds.

    This is similar to Sequence but semantically represents a fallback chain.
    Each child is evaluated in order. The first child that returns a
    non-None decision is returned. If all children return None, None is returned.
    """

    def __init__(self, *children: DecisionNode):
        super().__init__(list(children))

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        for child in self.children:
            result = child.evaluate(context)
            if result is not None:
                return result
        return None


class ConditionalAction(SelectorNode):
    """Shorthand for condition + action pair.

    If the condition is true, the action is returned. Otherwise, None is returned.
    """

    def __init__(self, condition: ConditionNode, action: ActionNode):
        super().__init__()
        self.condition = condition
        self.action = action

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        if self.condition.check(context):
            return self.action.get_action(context)
        return None


class Priority(SelectorNode):
    """Evaluate all children and return the one with highest priority.

    All children are evaluated, and the decision with the highest priority
    is returned. Ties are broken by evaluation order.
    """

    def __init__(self, *children: DecisionNode):
        super().__init__(list(children))

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        best_decision: Optional[StrategyDecision] = None
        best_priority = -1

        for child in self.children:
            result = child.evaluate(context)
            if result is not None and result.priority > best_priority:
                best_decision = result
                best_priority = result.priority

        return best_decision


class Switch(SelectorNode):
    """Switch statement based on a value.

    Evaluates the value_fn to get a key, then looks up the corresponding
    child node to evaluate. If no match is found, the default_node is used.
    """

    def __init__(
        self,
        value_fn: callable,
        cases: dict[any, DecisionNode],
        default_node: Optional[DecisionNode] = None,
    ):
        super().__init__()
        self.value_fn = value_fn
        self.cases = cases
        self.default_node = default_node

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        value = self.value_fn(context)
        child = self.cases.get(value)
        if child:
            return child.evaluate(context)
        elif self.default_node:
            return self.default_node.evaluate(context)
        return None
