"""Game clock for managing match phases and timing."""

from __future__ import annotations
from typing import Optional

from ..types.enums import MatchPhase
from ..types.schemas import PhaseTiming, DEFAULT_PHASE_TIMING


class GameClock:
    """Game clock for managing match phases and timing."""

    def __init__(
        self, timing: PhaseTiming = DEFAULT_PHASE_TIMING, tick_rate: int = 60
    ):
        self.timing = timing
        self.tick_rate = tick_rate
        self._current_tick = 0
        self._current_phase = MatchPhase.PRE_MATCH
        self._phase_start_tick = 0

    @property
    def tick(self) -> int:
        """Get current tick."""
        return self._current_tick

    @property
    def phase(self) -> MatchPhase:
        """Get current phase."""
        return self._current_phase

    @property
    def elapsed_time(self) -> float:
        """Get elapsed time in seconds."""
        return self._current_tick / self.tick_rate

    @property
    def phase_time_remaining(self) -> float:
        """Get time remaining in current phase."""
        elapsed = (self._current_tick - self._phase_start_tick) / self.tick_rate
        duration = self.get_phase_duration(self._current_phase)
        return max(0.0, duration - elapsed)

    @property
    def current_shift(self) -> Optional[int]:
        """Get current shift number (1-4) or None if not in a shift."""
        if self._current_phase == MatchPhase.SHIFT_1:
            return 1
        elif self._current_phase == MatchPhase.SHIFT_2:
            return 2
        elif self._current_phase == MatchPhase.SHIFT_3:
            return 3
        elif self._current_phase == MatchPhase.SHIFT_4:
            return 4
        return None

    def start_match(self) -> None:
        """Start the match."""
        self._current_tick = 0
        self._current_phase = MatchPhase.AUTO
        self._phase_start_tick = 0

    def tick_forward(self) -> Optional[MatchPhase]:
        """Advance the clock by one tick.

        Returns the new phase if it changed, None otherwise.
        """
        if self._current_phase in (MatchPhase.PRE_MATCH, MatchPhase.POST_MATCH):
            return None

        self._current_tick += 1

        phase_elapsed = (self._current_tick - self._phase_start_tick) / self.tick_rate
        phase_duration = self.get_phase_duration(self._current_phase)

        if phase_elapsed >= phase_duration:
            return self._advance_phase()

        return None

    def _advance_phase(self) -> MatchPhase:
        """Advance to the next phase."""
        self._phase_start_tick = self._current_tick

        transitions = {
            MatchPhase.AUTO: MatchPhase.TRANSITION,
            MatchPhase.TRANSITION: MatchPhase.SHIFT_1,
            MatchPhase.SHIFT_1: MatchPhase.SHIFT_2,
            MatchPhase.SHIFT_2: MatchPhase.SHIFT_3,
            MatchPhase.SHIFT_3: MatchPhase.SHIFT_4,
            MatchPhase.SHIFT_4: MatchPhase.ENDGAME,
            MatchPhase.ENDGAME: MatchPhase.POST_MATCH,
        }

        self._current_phase = transitions.get(
            self._current_phase, self._current_phase
        )
        return self._current_phase

    def get_phase_duration(self, phase: MatchPhase) -> float:
        """Get duration of a phase in seconds."""
        durations = {
            MatchPhase.AUTO: self.timing.auto,
            MatchPhase.TRANSITION: self.timing.transition,
            MatchPhase.SHIFT_1: self.timing.shift1,
            MatchPhase.SHIFT_2: self.timing.shift2,
            MatchPhase.SHIFT_3: self.timing.shift3,
            MatchPhase.SHIFT_4: self.timing.shift4,
            MatchPhase.ENDGAME: self.timing.endgame,
        }
        return durations.get(phase, 0.0)

    def get_total_match_duration(self) -> float:
        """Get total match duration in seconds."""
        return (
            self.timing.auto
            + self.timing.transition
            + self.timing.shift1
            + self.timing.shift2
            + self.timing.shift3
            + self.timing.shift4
            + self.timing.endgame
        )

    def is_match_in_progress(self) -> bool:
        """Check if match is in progress."""
        return self._current_phase not in (
            MatchPhase.PRE_MATCH,
            MatchPhase.POST_MATCH,
        )

    def is_match_ended(self) -> bool:
        """Check if match has ended."""
        return self._current_phase == MatchPhase.POST_MATCH

    def is_auto(self) -> bool:
        """Check if currently in autonomous."""
        return self._current_phase == MatchPhase.AUTO

    def is_shift(self) -> bool:
        """Check if currently in a shift phase (1-4)."""
        return self._current_phase in (
            MatchPhase.SHIFT_1,
            MatchPhase.SHIFT_2,
            MatchPhase.SHIFT_3,
            MatchPhase.SHIFT_4,
        )

    def is_teleop(self) -> bool:
        """Check if currently in teleop (shifts or endgame)."""
        return self.is_shift() or self._current_phase == MatchPhase.ENDGAME

    def is_endgame(self) -> bool:
        """Check if currently in endgame."""
        return self._current_phase == MatchPhase.ENDGAME

    def reset(self) -> None:
        """Reset clock for a new match."""
        self._current_tick = 0
        self._current_phase = MatchPhase.PRE_MATCH
        self._phase_start_tick = 0
