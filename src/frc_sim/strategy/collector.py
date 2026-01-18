"""Collector strategy - focuses on picking up balls."""

from .base import Strategy, StrategyContext, StrategyDecision


class CollectorStrategy(Strategy):
    """Strategy that focuses on collecting balls and scoring when full."""

    def __init__(self):
        super().__init__("collector")

    def decide(self, context: StrategyContext) -> StrategyDecision:
        """Decide what to do based on context."""
        robot = context.robot

        # If we have balls and can score, shoot!
        if robot.heldBalls and context.can_score:
            if context.nearest_scoring_target:
                if context.in_shooting_range:
                    return StrategyDecision(
                        action=self.create_shoot_action(context.nearest_scoring_target.id),
                        priority=8,
                        reason="Have balls and in shooting range",
                    )
                else:
                    # Move towards scoring target
                    return StrategyDecision(
                        action=self.create_move_action(context.nearest_scoring_target.position),
                        priority=6,
                        reason="Moving to scoring position",
                    )

        # Check for auto climb opportunity
        if context.can_auto_climb and context.is_near_climbing_zone:
            return StrategyDecision(
                action=self.create_climb_action(level=1, is_auto=True),
                priority=9,
                reason="Auto climb opportunity",
            )

        # If we can pick up more balls, find one
        if len(robot.heldBalls) < robot.config.ballCapacity:
            # Prefer unclaimed balls
            target_ball = context.nearest_unclaimed_ball or context.nearest_ball
            if target_ball:
                return StrategyDecision(
                    action=self.create_move_action(target_ball.position),
                    priority=5,
                    reason="Collecting ball",
                )

        # If full on balls but can't score, move towards scoring area
        if robot.heldBalls and context.nearest_scoring_target:
            return StrategyDecision(
                action=self.create_move_action(context.nearest_scoring_target.position),
                priority=4,
                reason="Moving to scoring area while waiting",
            )

        # Handle endgame climbing
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
                        reason="Moving to climb zone for endgame",
                    )

        return StrategyDecision(
            action=self.create_idle_action(),
            priority=1,
            reason="Nothing to do",
        )
