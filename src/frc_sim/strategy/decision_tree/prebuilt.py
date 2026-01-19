"""Pre-built decision trees replicating existing strategies."""

from __future__ import annotations

from .nodes import DecisionNode
from .conditions import (
    And,
    Not,
    HasBalls,
    HasCapacity,
    CanScore,
    InShootingRange,
    HasScoringTarget,
    CanAutoClimb,
    IsNearClimbingZone,
    IsEndgamePhase,
    CanEndgameClimb,
    HasClimbingZone,
)
from .actions import (
    IdleAction,
    ShootAction,
    MoveToBallAction,
    MoveToScoringTargetAction,
    MoveToClimbingZoneAction,
    ClimbAction,
)
from .selectors import IfThenElse, Sequence, ConditionalAction
from .tree_strategy import DecisionTreeStrategy


def build_collector_tree() -> DecisionNode:
    """Build a decision tree that replicates CollectorStrategy behavior.

    CollectorStrategy priorities:
    1. Score if has balls, can score, and in range (priority 8)
    2. Move to scoring if has balls and can score (priority 6)
    3. Auto climb if possible (priority 9)
    4. Collect balls if has capacity (priority 5)
    5. Move to scoring while waiting if has balls (priority 4)
    6. Endgame climb (priority 10/9)
    7. Idle (priority 1)
    """
    return Sequence(
        # Priority 1-2: Score if we have balls and can score
        ConditionalAction(
            And(HasBalls(), CanScore(), InShootingRange(), HasScoringTarget()),
            ShootAction(priority=8, reason="Have balls and in shooting range"),
        ),
        ConditionalAction(
            And(HasBalls(), CanScore(), HasScoringTarget()),
            MoveToScoringTargetAction(priority=6, reason="Moving to scoring position"),
        ),
        # Priority 3: Auto climb opportunity
        ConditionalAction(
            And(CanAutoClimb(), IsNearClimbingZone()),
            ClimbAction(is_auto=True, priority=9, reason="Auto climb opportunity"),
        ),
        # Priority 4: Collect balls if we have room
        ConditionalAction(
            HasCapacity(),
            MoveToBallAction(priority=5, reason="Collecting ball"),
        ),
        # Priority 5: Move to scoring area while waiting (has balls but can't score)
        ConditionalAction(
            And(HasBalls(), HasScoringTarget()),
            MoveToScoringTargetAction(priority=4, reason="Moving to scoring area while waiting"),
        ),
        # Priority 6: Endgame climbing
        IfThenElse(
            And(IsEndgamePhase(), CanEndgameClimb(), HasClimbingZone()),
            IfThenElse(
                IsNearClimbingZone(),
                ClimbAction(is_auto=False, priority=10, reason="Endgame climb"),
                MoveToClimbingZoneAction(priority=9, reason="Moving to climb zone for endgame"),
            ),
        ),
        # Fallback: Idle
        IdleAction(priority=1, reason="Nothing to do"),
    )


def build_scorer_tree() -> DecisionNode:
    """Build a decision tree that replicates ScorerStrategy behavior.

    ScorerStrategy priorities:
    1. Score if has balls, can score, and in range (priority 10)
    2. Auto climb if possible (priority 9)
    3. Move to scoring position if has balls and can score (priority 8)
    4. Collect balls if has capacity (priority 6)
    5. Position for next scoring window (priority 4)
    6. Endgame climb (priority 10/9)
    7. Idle (priority 1)
    """
    return Sequence(
        # Priority 1: Score immediately if possible
        ConditionalAction(
            And(HasBalls(), CanScore(), InShootingRange(), HasScoringTarget()),
            ShootAction(priority=10, reason="Scoring - in range with balls"),
        ),
        # Priority 2: Auto climb opportunity
        ConditionalAction(
            And(CanAutoClimb(), IsNearClimbingZone()),
            ClimbAction(is_auto=True, priority=9, reason="Auto climb opportunity"),
        ),
        # Priority 3: Move to scoring position if we have balls and can score
        ConditionalAction(
            And(HasBalls(), CanScore(), HasScoringTarget()),
            MoveToScoringTargetAction(priority=8, reason="Moving to scoring position"),
        ),
        # Priority 4: Collect balls if we have capacity
        ConditionalAction(
            HasCapacity(),
            MoveToBallAction(priority=6, reason="Collecting ball"),
        ),
        # Priority 5: Position for next scoring opportunity (when can't score)
        ConditionalAction(
            And(HasScoringTarget(), Not(CanScore())),
            MoveToScoringTargetAction(priority=4, reason="Positioning for next scoring window"),
        ),
        # Priority 6: Endgame climbing
        IfThenElse(
            And(IsEndgamePhase(), CanEndgameClimb(), HasClimbingZone()),
            IfThenElse(
                IsNearClimbingZone(),
                ClimbAction(is_auto=False, priority=10, reason="Endgame climb"),
                MoveToClimbingZoneAction(priority=9, reason="Moving to climb zone"),
            ),
        ),
        # Fallback: Idle
        IdleAction(priority=1, reason="Waiting"),
    )


def create_collector_strategy() -> DecisionTreeStrategy:
    """Create a DecisionTreeStrategy that replicates CollectorStrategy."""
    return DecisionTreeStrategy("tree_collector", build_collector_tree())


def create_scorer_strategy() -> DecisionTreeStrategy:
    """Create a DecisionTreeStrategy that replicates ScorerStrategy."""
    return DecisionTreeStrategy("tree_scorer", build_scorer_tree())
