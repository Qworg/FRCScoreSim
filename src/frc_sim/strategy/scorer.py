"""Scorer strategy - optimized for high scoring."""

from .base import Strategy, StrategyContext, StrategyDecision


class ScorerStrategy(Strategy):
    """Strategy that prioritizes scoring over collection."""

    def __init__(self):
        super().__init__("scorer")

    def decide(self, context: StrategyContext) -> StrategyDecision:
        """Decide what to do based on context."""
        robot = context.robot

        # Priority 1: If we can score now, do it
        if robot.heldBalls and context.can_score and context.in_shooting_range:
            if context.nearest_scoring_target:
                return StrategyDecision(
                    action=self.create_shoot_action(context.nearest_scoring_target.id),
                    priority=10,
                    reason="Scoring - in range with balls",
                )

        # Priority 2: Auto climb if possible
        if context.can_auto_climb and context.is_near_climbing_zone:
            return StrategyDecision(
                action=self.create_climb_action(level=1, is_auto=True),
                priority=9,
                reason="Auto climb opportunity",
            )

        # Priority 3: Move to scoring position if we have balls
        if robot.heldBalls and context.can_score:
            if context.nearest_scoring_target:
                return StrategyDecision(
                    action=self.create_move_action(context.nearest_scoring_target.position),
                    priority=8,
                    reason="Moving to scoring position",
                )

        # Priority 4: Collect balls if we have capacity
        if len(robot.heldBalls) < robot.config.ballCapacity:
            target_ball = context.nearest_unclaimed_ball or context.nearest_ball
            if target_ball:
                return StrategyDecision(
                    action=self.create_move_action(target_ball.position),
                    priority=6,
                    reason="Collecting ball",
                )

        # Priority 5: Position for next scoring opportunity
        if context.nearest_scoring_target and not context.can_score:
            return StrategyDecision(
                action=self.create_move_action(context.nearest_scoring_target.position),
                priority=4,
                reason="Positioning for next scoring window",
            )

        # Priority 6: Endgame climb
        if context.phase.value == "ENDGAME" and context.alliance_can_endgame_climb:
            if context.climbing_zone_position:
                if context.is_near_climbing_zone:
                    return StrategyDecision(
                        action=self.create_climb_action(level=robot.config.climbLevel),
                        priority=10,
                        reason="Endgame climb",
                    )
                else:
                    return StrategyDecision(
                        action=self.create_move_action(context.climbing_zone_position),
                        priority=9,
                        reason="Moving to climb zone",
                    )

        return StrategyDecision(
            action=self.create_idle_action(),
            priority=1,
            reason="Waiting",
        )
