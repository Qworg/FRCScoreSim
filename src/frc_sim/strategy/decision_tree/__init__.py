"""Decision tree strategy framework.

This package provides a composable decision tree framework for robot strategies.
Trees can be built programmatically or loaded from JSON configuration files.

Example usage:

    from frc_sim.strategy.decision_tree import (
        DecisionTreeStrategy,
        Sequence,
        ConditionalAction,
        And,
        HasBalls,
        CanScore,
        InShootingRange,
        ShootAction,
        IdleAction,
    )

    # Build a simple tree programmatically
    root = Sequence(
        ConditionalAction(
            And(HasBalls(), CanScore(), InShootingRange()),
            ShootAction(priority=10)
        ),
        IdleAction()
    )
    strategy = DecisionTreeStrategy("my_strategy", root)

    # Or use pre-built strategies
    from frc_sim.strategy.decision_tree import create_collector_strategy, create_scorer_strategy
    collector = create_collector_strategy()
    scorer = create_scorer_strategy()

    # Or load from JSON
    from frc_sim.strategy.decision_tree import load_tree_from_file
    strategy = load_tree_from_file("data/strategies/custom.json")
"""

# Base classes
from .nodes import (
    ComparisonOp,
    DecisionNode,
    ConditionNode,
    ActionNode,
    SelectorNode,
)

# Conditions
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
    CurrentActionIs,
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
    IsPhase,
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
    CustomCondition,
)

# Actions
from .actions import (
    IdleAction,
    MoveToBallAction,
    MoveToScoringTargetAction,
    MoveToClimbingZoneAction,
    MoveToPositionAction,
    ShootAction,
    ClimbAction,
    PickupBallAction,
)

# Selectors
from .selectors import (
    IfThenElse,
    Sequence,
    Fallback,
    ConditionalAction,
    Priority,
    Switch,
)

# Strategy class
from .tree_strategy import DecisionTreeStrategy

# Pre-built trees
from .prebuilt import (
    build_collector_tree,
    build_scorer_tree,
    create_collector_strategy,
    create_scorer_strategy,
)

# Loader
from .loader import (
    TreeLoaderError,
    load_tree_from_dict,
    load_tree_from_file,
    load_trees_from_directory,
)

__all__ = [
    # Base classes
    "ComparisonOp",
    "DecisionNode",
    "ConditionNode",
    "ActionNode",
    "SelectorNode",
    # Conditions - Hopper/Ball
    "HasBalls",
    "HasCapacity",
    "HopperEmpty",
    "HopperFull",
    "HopperCount",
    "HopperPercent",
    "BallsAvailable",
    "NearestBallWithinRange",
    # Conditions - Climb state
    "HasAutoClimbed",
    "HasClimbed",
    "IsClimbing",
    "ClimbLevel",
    # Conditions - Action state
    "IsIdle",
    "IsMoving",
    "IsShooting",
    "IsPickingUp",
    "CurrentActionIs",
    # Conditions - Robot capability
    "CanRobotClimb",
    "CanRobotAutoClimb",
    "MaxClimbLevel",
    # Conditions - Robot status
    "IsDisabled",
    "IsOnOwnSide",
    "Velocity",
    # Conditions - Scoring
    "CanScore",
    "InShootingRange",
    "HasScoringTarget",
    "IsGoodShootingPosition",
    "HasClearShot",
    "IsInNoScoreZone",
    # Conditions - Climbing opportunity
    "CanAutoClimb",
    "CanEndgameClimb",
    "IsNearClimbingZone",
    "HasClimbingZone",
    # Conditions - Phase
    "IsPhase",
    "IsAutoPhase",
    "IsEndgamePhase",
    "IsTransitionPhase",
    "IsShiftPhase",
    "CurrentShift",
    "PhaseTimeRemaining",
    "MatchTimeRemaining",
    # Conditions - Alliance
    "AllianceParity",
    "AllianceAutoClimbCount",
    "AllianceEndgameClimbCount",
    # Conditions - Composite
    "And",
    "Or",
    "Not",
    "CustomCondition",
    # Actions
    "IdleAction",
    "MoveToBallAction",
    "MoveToScoringTargetAction",
    "MoveToClimbingZoneAction",
    "MoveToPositionAction",
    "ShootAction",
    "ClimbAction",
    "PickupBallAction",
    # Selectors
    "IfThenElse",
    "Sequence",
    "Fallback",
    "ConditionalAction",
    "Priority",
    "Switch",
    # Strategy
    "DecisionTreeStrategy",
    # Pre-built
    "build_collector_tree",
    "build_scorer_tree",
    "create_collector_strategy",
    "create_scorer_strategy",
    # Loader
    "TreeLoaderError",
    "load_tree_from_dict",
    "load_tree_from_file",
    "load_trees_from_directory",
]
