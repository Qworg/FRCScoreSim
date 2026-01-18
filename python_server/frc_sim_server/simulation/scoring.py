"""Scoring system for managing match scores."""

from __future__ import annotations
from typing import Optional
from dataclasses import dataclass

from ..types.enums import MatchPhase, ShiftParity
from ..types.schemas import (
    Score,
    AllianceScore,
    ScoringTarget,
    GameRules,
    DEFAULT_GAME_RULES,
)


@dataclass
class ClimbResult:
    """Result of attempting a climb."""
    success: bool
    points: int
    reason: Optional[str] = None


def create_alliance_score() -> AllianceScore:
    """Create an empty alliance score."""
    return AllianceScore(
        auto=0,
        teleop=0,
        endgame=0,
        penalties=0,
        total=0,
        breakdown={},
        autoBallCount=0,
        totalBallCount=0,
        autoClimbCount=0,
        endgameClimbCount=0,
        endgameClimbLevelTotal=0,
    )


def create_score() -> Score:
    """Create initial score state."""
    return Score(
        red=create_alliance_score(),
        blue=create_alliance_score(),
    )


class ScoringSystem:
    """Scoring system for managing match scores."""

    def __init__(self, rules: GameRules = DEFAULT_GAME_RULES):
        self.rules = rules
        self.score = create_score()
        self._red_parity: Optional[ShiftParity] = None
        self._blue_parity: Optional[ShiftParity] = None
        self._parity_determined = False

    def get_score(self) -> Score:
        """Get current scores."""
        return self.score

    def get_alliance_score(self, alliance: str) -> AllianceScore:
        """Get score for an alliance."""
        return self.score.red if alliance == "red" else self.score.blue

    def get_shift_parity(self, alliance: str) -> Optional[ShiftParity]:
        """Get shift parity for an alliance (None if not yet determined)."""
        return self._red_parity if alliance == "red" else self._blue_parity

    def determine_shift_parity(self) -> None:
        """Determine shift parity based on auto ball counts.

        Should be called when transitioning out of AUTO phase.
        """
        if self._parity_determined:
            return

        red_balls = self.score.red.autoBallCount
        blue_balls = self.score.blue.autoBallCount

        # Alliance that scores MOST balls during auto is EVEN (scores in Shift 2 and 4)
        # If tied, red is EVEN (arbitrary tiebreaker)
        if red_balls >= blue_balls:
            self._red_parity = ShiftParity.EVEN
            self._blue_parity = ShiftParity.ODD
        else:
            self._red_parity = ShiftParity.ODD
            self._blue_parity = ShiftParity.EVEN

        self._parity_determined = True

    def can_alliance_score(self, alliance: str, phase: MatchPhase) -> bool:
        """Check if an alliance can score during the current phase."""
        # Everyone can score during AUTO, TRANSITION, and ENDGAME
        if phase in (MatchPhase.AUTO, MatchPhase.TRANSITION, MatchPhase.ENDGAME):
            return True

        # During shifts, only the designated alliance can score
        parity = self.get_shift_parity(alliance)
        if parity is None:
            return True  # If parity not determined, allow scoring

        if phase in (MatchPhase.SHIFT_1, MatchPhase.SHIFT_3):
            # ODD alliance scores during shifts 1 and 3
            return parity == ShiftParity.ODD
        elif phase in (MatchPhase.SHIFT_2, MatchPhase.SHIFT_4):
            # EVEN alliance scores during shifts 2 and 4
            return parity == ShiftParity.EVEN

        return True

    def record_score(
        self, alliance: str, target: ScoringTarget, phase: MatchPhase
    ) -> int:
        """Record a scored ball."""
        is_auto = phase == MatchPhase.AUTO
        points = target.points.auto if is_auto else target.points.teleop

        alliance_score = self.get_alliance_score(alliance)

        # Create mutable copy of breakdown
        breakdown = dict(alliance_score.breakdown)
        breakdown[target.id] = breakdown.get(target.id, 0) + points

        if alliance == "red":
            self.score = Score(
                red=AllianceScore(
                    auto=alliance_score.auto + (points if is_auto else 0),
                    teleop=alliance_score.teleop + (0 if is_auto else points),
                    endgame=alliance_score.endgame,
                    penalties=alliance_score.penalties,
                    total=alliance_score.total + points,
                    breakdown=breakdown,
                    autoBallCount=alliance_score.autoBallCount + (1 if is_auto else 0),
                    totalBallCount=alliance_score.totalBallCount + 1,
                    autoClimbCount=alliance_score.autoClimbCount,
                    endgameClimbCount=alliance_score.endgameClimbCount,
                    endgameClimbLevelTotal=alliance_score.endgameClimbLevelTotal,
                ),
                blue=self.score.blue,
            )
        else:
            self.score = Score(
                red=self.score.red,
                blue=AllianceScore(
                    auto=alliance_score.auto + (points if is_auto else 0),
                    teleop=alliance_score.teleop + (0 if is_auto else points),
                    endgame=alliance_score.endgame,
                    penalties=alliance_score.penalties,
                    total=alliance_score.total + points,
                    breakdown=breakdown,
                    autoBallCount=alliance_score.autoBallCount + (1 if is_auto else 0),
                    totalBallCount=alliance_score.totalBallCount + 1,
                    autoClimbCount=alliance_score.autoClimbCount,
                    endgameClimbCount=alliance_score.endgameClimbCount,
                    endgameClimbLevelTotal=alliance_score.endgameClimbLevelTotal,
                ),
            )

        return points

    def can_auto_climb(self, alliance: str) -> bool:
        """Check if an alliance can have another auto climber."""
        score = self.get_alliance_score(alliance)
        return score.autoClimbCount < self.rules.maxAutoClimbers

    def can_endgame_climb(self, alliance: str) -> bool:
        """Check if an alliance can have another endgame climber."""
        score = self.get_alliance_score(alliance)
        return score.endgameClimbCount < self.rules.maxEndgameClimbers

    def record_auto_climb(self, alliance: str) -> ClimbResult:
        """Record an auto climb (15 points, max 2 per alliance)."""
        alliance_score = self.get_alliance_score(alliance)

        if alliance_score.autoClimbCount >= self.rules.maxAutoClimbers:
            return ClimbResult(
                success=False,
                points=0,
                reason=f"Max auto climbers ({self.rules.maxAutoClimbers}) already reached",
            )

        points = self.rules.autoClimbPoints
        breakdown = dict(alliance_score.breakdown)
        breakdown["autoClimb"] = breakdown.get("autoClimb", 0) + points

        new_score = AllianceScore(
            auto=alliance_score.auto + points,
            teleop=alliance_score.teleop,
            endgame=alliance_score.endgame,
            penalties=alliance_score.penalties,
            total=alliance_score.total + points,
            breakdown=breakdown,
            autoBallCount=alliance_score.autoBallCount,
            totalBallCount=alliance_score.totalBallCount,
            autoClimbCount=alliance_score.autoClimbCount + 1,
            endgameClimbCount=alliance_score.endgameClimbCount,
            endgameClimbLevelTotal=alliance_score.endgameClimbLevelTotal,
        )

        if alliance == "red":
            self.score = Score(red=new_score, blue=self.score.blue)
        else:
            self.score = Score(red=self.score.red, blue=new_score)

        return ClimbResult(success=True, points=points)

    def record_endgame_climb(self, alliance: str, level: int) -> ClimbResult:
        """Record an endgame climb (10 points per level, max 3 per alliance)."""
        alliance_score = self.get_alliance_score(alliance)

        if level < 1 or level > 3:
            return ClimbResult(
                success=False,
                points=0,
                reason=f"Invalid climb level: {level} (must be 1-3)",
            )

        if alliance_score.endgameClimbCount >= self.rules.maxEndgameClimbers:
            return ClimbResult(
                success=False,
                points=0,
                reason=f"Max endgame climbers ({self.rules.maxEndgameClimbers}) already reached",
            )

        points = self.rules.endgameClimbPointsPerLevel * level
        breakdown = dict(alliance_score.breakdown)
        level_key = f"endgameClimbL{level}"
        breakdown[level_key] = breakdown.get(level_key, 0) + points

        new_score = AllianceScore(
            auto=alliance_score.auto,
            teleop=alliance_score.teleop,
            endgame=alliance_score.endgame + points,
            penalties=alliance_score.penalties,
            total=alliance_score.total + points,
            breakdown=breakdown,
            autoBallCount=alliance_score.autoBallCount,
            totalBallCount=alliance_score.totalBallCount,
            autoClimbCount=alliance_score.autoClimbCount,
            endgameClimbCount=alliance_score.endgameClimbCount + 1,
            endgameClimbLevelTotal=alliance_score.endgameClimbLevelTotal + level,
        )

        if alliance == "red":
            self.score = Score(red=new_score, blue=self.score.blue)
        else:
            self.score = Score(red=self.score.red, blue=new_score)

        return ClimbResult(success=True, points=points)

    def get_winner(self) -> Optional[str]:
        """Get the winner."""
        if self.score.red.total > self.score.blue.total:
            return "red"
        elif self.score.blue.total > self.score.red.total:
            return "blue"
        return None

    def reset(self) -> None:
        """Reset scores for a new match."""
        self.score = create_score()
        self._red_parity = None
        self._blue_parity = None
        self._parity_determined = False
