"""Match state container."""

from __future__ import annotations
from typing import Optional
import uuid

from ..types.enums import MatchPhase, BallState, ShiftParity
from ..types.schemas import (
    Position,
    FieldConfig,
    GameState,
    BallVelocity,
    ScoringTarget,
    Score,
    GameRules,
    BallPhysicsConfig,
    DEFAULT_GAME_RULES,
    DEFAULT_BALL_PHYSICS,
)
from ..entities.robot import Robot
from ..entities.ball import Ball
from ..field.field import Field
from .clock import GameClock
from .scoring import ScoringSystem


class Match:
    """Match state container."""

    def __init__(
        self,
        field_config: FieldConfig,
        rules: GameRules = DEFAULT_GAME_RULES,
        ball_physics: BallPhysicsConfig = DEFAULT_BALL_PHYSICS,
    ):
        self.field = Field(field_config)
        self.clock = GameClock(rules.timing)
        self.scoring = ScoringSystem(rules)
        self.rules = rules
        self.ball_physics = ball_physics

        self._robots: list[Robot] = []
        self._balls: dict[str, Ball] = {}
        self._events: list[dict] = []
        self._paused = False
        self._respawn_queue: list[tuple[str, int]] = []  # (ball_id, respawn_tick)

    def initialize_robots(self, robots: list[Robot]) -> None:
        """Initialize robots for the match."""
        self._robots = robots

    def initialize_balls(self) -> None:
        """Initialize balls at spawn points."""
        for spawn in self.field.get_ball_spawn_points():
            ball = Ball(
                id=f"ball-{spawn.id}",
                state=BallState.ON_FIELD,
                position=spawn.position,
                height=0.0,
                velocity=BallVelocity(vx=0.0, vy=0.0, vz=0.0),
                spawn_point_id=spawn.id,
                last_update_tick=0,
                alliance=spawn.alliance,
            )
            self._balls[ball.id] = ball

    def add_ball(self, ball: Ball) -> None:
        """Add a ball to the match."""
        self._balls[ball.id] = ball

    def get_ball(self, ball_id: str) -> Optional[Ball]:
        """Get a ball by ID."""
        return self._balls.get(ball_id)

    def get_balls(self) -> list[Ball]:
        """Get all balls."""
        return list(self._balls.values())

    def get_available_balls(self) -> list[Ball]:
        """Get all balls available for pickup."""
        return [b for b in self._balls.values() if b.is_available()]

    def get_robots(self) -> list[Robot]:
        """Get all robots."""
        return self._robots

    def get_robots_by_alliance(self, alliance: str) -> list[Robot]:
        """Get robots for an alliance."""
        return [r for r in self._robots if r.alliance == alliance]

    def start(self) -> None:
        """Start the match."""
        self.clock.start_match()
        self._paused = False

    def pause(self) -> None:
        """Pause the match."""
        self._paused = True

    def resume(self) -> None:
        """Resume the match."""
        self._paused = False

    def is_paused(self) -> bool:
        """Check if match is paused."""
        return self._paused

    def is_finished(self) -> bool:
        """Check if match has ended."""
        return self.clock.is_match_ended()

    def handle_phase_change(self, new_phase: MatchPhase) -> None:
        """Handle a phase change."""
        if new_phase == MatchPhase.TRANSITION:
            # Determine parity after AUTO
            self.scoring.determine_shift_parity()

    def can_alliance_score(self, alliance: str) -> bool:
        """Check if an alliance can score in the current phase."""
        return self.scoring.can_alliance_score(alliance, self.clock.phase)

    def record_score(
        self, robot_id: str, ball_id: str, target_id: str
    ) -> Optional[int]:
        """Record a score."""
        target = self.field.get_scoring_target(target_id)
        if not target:
            return None

        # Find the robot to get alliance
        robot = next((r for r in self._robots if r.id == robot_id), None)
        if not robot:
            return None

        # Check if alliance can score
        if not self.can_alliance_score(robot.alliance):
            return None

        # Record the score
        points = self.scoring.record_score(robot.alliance, target, self.clock.phase)

        # Queue ball for respawn
        ball = self.get_ball(ball_id)
        if ball:
            respawn_tick = self.clock.tick + self.ball_physics.respawnDelay
            self._respawn_queue.append((ball_id, respawn_tick))

        return points

    def record_auto_climb(self, robot_id: str) -> dict:
        """Record an auto climb."""
        robot = next((r for r in self._robots if r.id == robot_id), None)
        if not robot:
            return {"success": False, "points": 0}

        result = self.scoring.record_auto_climb(robot.alliance)
        return {"success": result.success, "points": result.points}

    def record_endgame_climb(self, robot_id: str, level: int) -> dict:
        """Record an endgame climb."""
        robot = next((r for r in self._robots if r.id == robot_id), None)
        if not robot:
            return {"success": False, "points": 0}

        result = self.scoring.record_endgame_climb(robot.alliance, level)
        return {"success": result.success, "points": result.points}

    def process_ball_respawns(self) -> None:
        """Process ball respawn queue."""
        current_tick = self.clock.tick
        still_waiting = []

        for ball_id, respawn_tick in self._respawn_queue:
            if current_tick >= respawn_tick:
                ball = self.get_ball(ball_id)
                if ball:
                    spawn = self.field.get_spawn_point(ball.spawn_point_id)
                    if spawn:
                        ball.respawn(spawn.position, current_tick)
            else:
                still_waiting.append((ball_id, respawn_tick))

        self._respawn_queue = still_waiting

    def add_event(self, event: dict) -> None:
        """Add an event to the event log."""
        self._events.append(event)

    def clear_tick_events(self) -> None:
        """Clear events for the current tick (called at end of tick)."""
        self._events = []

    def get_state(self) -> GameState:
        """Get the current game state."""
        red_parity = self.scoring.get_shift_parity("red")
        blue_parity = self.scoring.get_shift_parity("blue")

        return GameState(
            tick=self.clock.tick,
            elapsedTime=self.clock.elapsed_time,
            phase=self.clock.phase.value,
            phaseTimeRemaining=self.clock.phase_time_remaining,
            currentShift=self.clock.current_shift,
            redParity=red_parity.value if red_parity else None,
            blueParity=blue_parity.value if blue_parity else None,
            robots=[r.clone_state() for r in self._robots],
            balls=[b.clone_data() for b in self._balls.values()],
            score=self.scoring.get_score(),
            events=list(self._events),
            paused=self._paused,
        )
