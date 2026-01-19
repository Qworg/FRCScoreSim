"""Ball entity class."""

from __future__ import annotations
from typing import Optional
from dataclasses import dataclass, field

from ..types.enums import BallState
from ..types.schemas import Position, BallVelocity, BallData


@dataclass
class Ball:
    """Ball entity with state and behavior."""

    id: str
    state: BallState
    position: Position
    height: float
    velocity: BallVelocity
    spawn_point_id: str
    last_update_tick: int
    held_by_robot_id: Optional[str] = None
    shot_by_robot_id: Optional[str] = None
    shot_from_position: Optional[Position] = None
    target_position: Optional[Position] = None
    alliance: Optional[str] = None
    claimed_by_robot_id: Optional[str] = None
    claimed_at_tick: Optional[int] = None

    def clone_data(self) -> BallData:
        """Clone the ball data for serialization."""
        return BallData(
            id=self.id,
            state=self.state.value,
            position=self.position,
            height=self.height,
            velocity=self.velocity,
            spawnPointId=self.spawn_point_id,
            lastUpdateTick=self.last_update_tick,
            heldByRobotId=self.held_by_robot_id,
            shotByRobotId=self.shot_by_robot_id,
            shotFromPosition=self.shot_from_position,
            targetPosition=self.target_position,
            alliance=self.alliance,
            claimedByRobotId=self.claimed_by_robot_id,
            claimedAtTick=self.claimed_at_tick,
        )

    def is_available(self) -> bool:
        """Check if ball is available for pickup."""
        return self.state == BallState.ON_FIELD and self.claimed_by_robot_id is None

    def is_held(self) -> bool:
        """Check if ball is held by a robot."""
        return self.state == BallState.HELD

    def is_in_flight(self) -> bool:
        """Check if ball is in flight."""
        return self.state == BallState.IN_FLIGHT

    def is_scored(self) -> bool:
        """Check if ball has been scored."""
        return self.state == BallState.SCORED

    def is_claimed(self) -> bool:
        """Check if ball has been claimed for pickup."""
        return self.claimed_by_robot_id is not None

    def is_claim_expired(self, current_tick: int, expiration_ticks: int = 180) -> bool:
        """Check if the claim has expired (default 3 seconds at 60 ticks/sec)."""
        if self.claimed_at_tick is None:
            return True
        return current_tick - self.claimed_at_tick > expiration_ticks

    def get_claiming_robot_id(self) -> Optional[str]:
        """Get the ID of the robot claiming this ball."""
        return self.claimed_by_robot_id

    def set_position(self, pos: Position) -> None:
        """Set ball position."""
        self.position = pos

    def set_height(self, height: float) -> None:
        """Set ball height."""
        self.height = height

    def set_velocity(self, vel: BallVelocity) -> None:
        """Set ball velocity."""
        self.velocity = vel

    def claim(self, robot_id: str, tick: int) -> None:
        """Claim the ball for pickup."""
        self.claimed_by_robot_id = robot_id
        self.claimed_at_tick = tick

    def release_claim(self) -> None:
        """Release the claim on the ball."""
        self.claimed_by_robot_id = None
        self.claimed_at_tick = None

    def pickup(self, robot_id: str, tick: int) -> None:
        """Mark ball as picked up by a robot."""
        self.state = BallState.HELD
        self.held_by_robot_id = robot_id
        self.last_update_tick = tick
        self.release_claim()

    def shoot(
        self,
        robot_id: str,
        from_position: Position,
        target_position: Position,
        velocity: BallVelocity,
        tick: int,
    ) -> None:
        """Mark ball as shot."""
        self.state = BallState.IN_FLIGHT
        self.held_by_robot_id = None
        self.shot_by_robot_id = robot_id
        self.shot_from_position = from_position
        self.target_position = target_position
        self.velocity = velocity
        self.last_update_tick = tick

    def land(self, position: Position, tick: int, height: float = 0.0) -> None:
        """Land the ball on the field."""
        self.state = BallState.ON_FIELD
        self.position = position
        self.height = height
        self.shot_by_robot_id = None
        self.shot_from_position = None
        self.target_position = None
        self.last_update_tick = tick

    def score(self, tick: int) -> None:
        """Mark ball as scored."""
        self.state = BallState.SCORED
        self.last_update_tick = tick

    def respawn(self, position: Position, tick: int) -> None:
        """Respawn the ball at its spawn point."""
        self.state = BallState.ON_FIELD
        self.position = position
        self.height = 0.0
        self.velocity = BallVelocity(vx=0.0, vy=0.0, vz=0.0)
        self.held_by_robot_id = None
        self.shot_by_robot_id = None
        self.shot_from_position = None
        self.target_position = None
        self.last_update_tick = tick
        self.release_claim()
