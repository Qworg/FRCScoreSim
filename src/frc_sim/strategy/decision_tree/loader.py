"""JSON configuration loader for decision trees."""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Optional

from .nodes import DecisionNode, ConditionNode, ActionNode, ComparisonOp
from .conditions import (
    # Hopper/Ball conditions
    HasBalls,
    HasCapacity,
    HopperEmpty,
    HopperFull,
    HopperCount,
    HopperPercent,
    BallsAvailable,
    NearestBallWithinRange,
    # Climb state conditions
    HasAutoClimbed,
    HasClimbed,
    IsClimbing,
    ClimbLevel,
    # Action state conditions
    IsIdle,
    IsMoving,
    IsShooting,
    IsPickingUp,
    # Robot capability conditions
    CanRobotClimb,
    CanRobotAutoClimb,
    MaxClimbLevel,
    # Robot status conditions
    IsDisabled,
    IsOnOwnSide,
    Velocity,
    # Scoring conditions
    CanScore,
    InShootingRange,
    HasScoringTarget,
    IsGoodShootingPosition,
    HasClearShot,
    IsInNoScoreZone,
    # Climbing opportunity conditions
    CanAutoClimb,
    CanEndgameClimb,
    IsNearClimbingZone,
    HasClimbingZone,
    # Phase conditions
    IsAutoPhase,
    IsEndgamePhase,
    IsTransitionPhase,
    IsShiftPhase,
    CurrentShift,
    PhaseTimeRemaining,
    MatchTimeRemaining,
    # Alliance conditions
    AllianceParity,
    AllianceAutoClimbCount,
    AllianceEndgameClimbCount,
    # Composite conditions
    And,
    Or,
    Not,
)
from .actions import (
    IdleAction,
    MoveToBallAction,
    MoveToScoringTargetAction,
    MoveToClimbingZoneAction,
    ShootAction,
    ClimbAction,
    PickupBallAction,
)
from .selectors import (
    IfThenElse,
    Sequence,
    Fallback,
    ConditionalAction,
)
from .tree_strategy import DecisionTreeStrategy
from ...types.enums import ShiftParity


# Registry of simple condition names (no parameters)
SIMPLE_CONDITIONS: dict[str, type[ConditionNode]] = {
    "has_balls": HasBalls,
    "has_capacity": HasCapacity,
    "hopper_empty": HopperEmpty,
    "hopper_full": HopperFull,
    "has_auto_climbed": HasAutoClimbed,
    "has_climbed": HasClimbed,
    "is_climbing": IsClimbing,
    "is_idle": IsIdle,
    "is_moving": IsMoving,
    "is_shooting": IsShooting,
    "is_picking_up": IsPickingUp,
    "can_robot_climb": CanRobotClimb,
    "can_robot_auto_climb": CanRobotAutoClimb,
    "is_disabled": IsDisabled,
    "is_on_own_side": IsOnOwnSide,
    "can_score": CanScore,
    "in_shooting_range": InShootingRange,
    "has_scoring_target": HasScoringTarget,
    "is_good_shooting_position": IsGoodShootingPosition,
    "has_clear_shot": HasClearShot,
    "is_in_no_score_zone": IsInNoScoreZone,
    "can_auto_climb": CanAutoClimb,
    "can_endgame_climb": CanEndgameClimb,
    "is_near_climbing_zone": IsNearClimbingZone,
    "has_climbing_zone": HasClimbingZone,
    "is_auto_phase": IsAutoPhase,
    "is_endgame_phase": IsEndgamePhase,
    "is_transition_phase": IsTransitionPhase,
    "is_shift_phase": IsShiftPhase,
}

# Map string operators to ComparisonOp
OP_MAP: dict[str, ComparisonOp] = {
    "==": ComparisonOp.EQ,
    "!=": ComparisonOp.NE,
    "<": ComparisonOp.LT,
    "<=": ComparisonOp.LE,
    ">": ComparisonOp.GT,
    ">=": ComparisonOp.GE,
    "eq": ComparisonOp.EQ,
    "ne": ComparisonOp.NE,
    "lt": ComparisonOp.LT,
    "le": ComparisonOp.LE,
    "gt": ComparisonOp.GT,
    "ge": ComparisonOp.GE,
}


class TreeLoaderError(Exception):
    """Error loading a decision tree from JSON."""
    pass


def _parse_comparison_op(op_str: str) -> ComparisonOp:
    """Parse a comparison operator string."""
    op = OP_MAP.get(op_str.lower())
    if op is None:
        raise TreeLoaderError(f"Unknown comparison operator: {op_str}")
    return op


def _parse_condition(config: Any) -> ConditionNode:
    """Parse a condition from JSON config."""
    # Simple string condition
    if isinstance(config, str):
        if config in SIMPLE_CONDITIONS:
            return SIMPLE_CONDITIONS[config]()
        raise TreeLoaderError(f"Unknown simple condition: {config}")

    # Complex condition (dict)
    if not isinstance(config, dict):
        raise TreeLoaderError(f"Condition must be string or dict, got: {type(config)}")

    cond_type = config.get("type")
    if not cond_type:
        raise TreeLoaderError("Condition dict must have 'type' field")

    # Composite conditions
    if cond_type == "and":
        conditions = config.get("conditions", [])
        return And(*[_parse_condition(c) for c in conditions])

    if cond_type == "or":
        conditions = config.get("conditions", [])
        return Or(*[_parse_condition(c) for c in conditions])

    if cond_type == "not":
        inner = config.get("condition")
        if inner is None:
            raise TreeLoaderError("'not' condition requires 'condition' field")
        return Not(_parse_condition(inner))

    # Parameterized conditions
    if cond_type == "has_balls":
        return HasBalls(min_count=config.get("min_count", 1))

    if cond_type == "has_capacity":
        return HasCapacity(min_free=config.get("min_free", 1))

    if cond_type == "hopper_count":
        op = _parse_comparison_op(config.get("op", ">="))
        threshold = config.get("threshold", 1)
        return HopperCount(op, threshold)

    if cond_type == "hopper_percent":
        op = _parse_comparison_op(config.get("op", ">="))
        threshold = config.get("threshold", 0.5)
        return HopperPercent(op, threshold)

    if cond_type == "balls_available":
        return BallsAvailable(min_count=config.get("min_count", 1))

    if cond_type == "nearest_ball_within_range":
        max_distance = config.get("max_distance", 100.0)
        return NearestBallWithinRange(max_distance)

    if cond_type == "climb_level":
        op = _parse_comparison_op(config.get("op", ">="))
        level = config.get("level", 1)
        return ClimbLevel(op, level)

    if cond_type == "max_climb_level":
        op = _parse_comparison_op(config.get("op", ">="))
        level = config.get("level", 1)
        return MaxClimbLevel(op, level)

    if cond_type == "velocity":
        op = _parse_comparison_op(config.get("op", ">="))
        threshold = config.get("threshold", 0.0)
        return Velocity(op, threshold)

    if cond_type == "current_shift":
        op = _parse_comparison_op(config.get("op", "=="))
        shift_num = config.get("shift", 1)
        return CurrentShift(op, shift_num)

    if cond_type == "phase_time_remaining":
        op = _parse_comparison_op(config.get("op", ">"))
        seconds = config.get("seconds", 10.0)
        return PhaseTimeRemaining(op, seconds)

    if cond_type == "match_time_remaining":
        op = _parse_comparison_op(config.get("op", ">"))
        seconds = config.get("seconds", 30.0)
        return MatchTimeRemaining(op, seconds)

    if cond_type == "alliance_parity":
        parity_str = config.get("parity", "EVEN").upper()
        parity = ShiftParity.EVEN if parity_str == "EVEN" else ShiftParity.ODD
        return AllianceParity(parity)

    if cond_type == "alliance_auto_climb_count":
        op = _parse_comparison_op(config.get("op", "<"))
        count = config.get("count", 2)
        return AllianceAutoClimbCount(op, count)

    if cond_type == "alliance_endgame_climb_count":
        op = _parse_comparison_op(config.get("op", "<"))
        count = config.get("count", 3)
        return AllianceEndgameClimbCount(op, count)

    # Try simple conditions by type name
    if cond_type in SIMPLE_CONDITIONS:
        return SIMPLE_CONDITIONS[cond_type]()

    raise TreeLoaderError(f"Unknown condition type: {cond_type}")


def _parse_action(config: Any) -> ActionNode:
    """Parse an action from JSON config."""
    if not isinstance(config, dict):
        raise TreeLoaderError(f"Action must be dict, got: {type(config)}")

    action_type = config.get("type")
    if not action_type:
        raise TreeLoaderError("Action dict must have 'type' field")

    priority = config.get("priority", 5)
    reason = config.get("reason", "")

    if action_type == "idle":
        return IdleAction(priority=priority, reason=reason)

    if action_type == "move_to_ball":
        return MoveToBallAction(priority=priority, reason=reason)

    if action_type == "move_to_scoring_target":
        return MoveToScoringTargetAction(priority=priority, reason=reason)

    if action_type == "move_to_climbing_zone":
        return MoveToClimbingZoneAction(priority=priority, reason=reason)

    if action_type == "shoot":
        return ShootAction(priority=priority, reason=reason)

    if action_type == "climb":
        is_auto = config.get("is_auto", False)
        level = config.get("level")
        return ClimbAction(is_auto=is_auto, level=level, priority=priority, reason=reason)

    if action_type == "pickup":
        return PickupBallAction(priority=priority, reason=reason)

    raise TreeLoaderError(f"Unknown action type: {action_type}")


def _parse_node(config: Any) -> DecisionNode:
    """Parse any node type from JSON config."""
    if not isinstance(config, dict):
        raise TreeLoaderError(f"Node must be dict, got: {type(config)}")

    node_type = config.get("node_type")

    # If no node_type, try to parse as action
    if not node_type:
        if "type" in config:
            return _parse_action(config)
        raise TreeLoaderError("Node must have 'node_type' or be an action with 'type'")

    if node_type == "if_then_else":
        condition = _parse_condition(config.get("condition"))
        then_node = _parse_node(config.get("then"))
        else_config = config.get("else")
        else_node = _parse_node(else_config) if else_config else None
        return IfThenElse(condition, then_node, else_node)

    if node_type == "sequence":
        children = [_parse_node(c) for c in config.get("children", [])]
        return Sequence(*children)

    if node_type == "fallback":
        children = [_parse_node(c) for c in config.get("children", [])]
        return Fallback(*children)

    if node_type == "conditional":
        condition = _parse_condition(config.get("condition"))
        action = _parse_action(config.get("action"))
        return ConditionalAction(condition, action)

    if node_type == "action":
        return _parse_action(config.get("action", config))

    raise TreeLoaderError(f"Unknown node type: {node_type}")


def load_tree_from_dict(config: dict[str, Any]) -> DecisionTreeStrategy:
    """Load a decision tree strategy from a dictionary config.

    Args:
        config: Dictionary with 'id' and 'root' keys

    Returns:
        DecisionTreeStrategy instance

    Raises:
        TreeLoaderError: If the config is invalid
    """
    strategy_id = config.get("id")
    if not strategy_id:
        raise TreeLoaderError("Strategy config must have 'id' field")

    root_config = config.get("root")
    if not root_config:
        raise TreeLoaderError("Strategy config must have 'root' field")

    root = _parse_node(root_config)
    return DecisionTreeStrategy(strategy_id, root)


def load_tree_from_file(path: str | Path) -> DecisionTreeStrategy:
    """Load a decision tree strategy from a JSON file.

    Args:
        path: Path to JSON file

    Returns:
        DecisionTreeStrategy instance

    Raises:
        TreeLoaderError: If the file is invalid or cannot be read
        FileNotFoundError: If the file does not exist
    """
    path = Path(path)
    try:
        with open(path) as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        raise TreeLoaderError(f"Invalid JSON in {path}: {e}") from e

    return load_tree_from_dict(config)


def load_trees_from_directory(directory: str | Path) -> list[DecisionTreeStrategy]:
    """Load all decision tree strategies from a directory.

    Args:
        directory: Path to directory containing JSON strategy files

    Returns:
        List of DecisionTreeStrategy instances
    """
    directory = Path(directory)
    strategies = []

    if not directory.exists():
        return strategies

    for path in directory.glob("*.json"):
        try:
            strategy = load_tree_from_file(path)
            strategies.append(strategy)
        except (TreeLoaderError, FileNotFoundError) as e:
            # Log error but continue loading other files
            import logging
            logging.getLogger(__name__).warning(f"Failed to load strategy from {path}: {e}")

    return strategies
