"""
Protocol definitions for FRC Score Simulator distributed mode.

This module defines the message types, enums, and data structures used
in the binary MessagePack protocol between the World Server and Robot Clients.
"""

from dataclasses import dataclass, field
from enum import IntEnum
from typing import Optional

# Protocol version - must match server
PROTOCOL_VERSION = 1


class MessageType(IntEnum):
    """Message types for the distributed protocol."""
    # Server -> Robot
    FIELD_CONFIG = 0x01
    TICK_UPDATE = 0x02
    MATCH_END = 0x03

    # Robot -> Server
    CLIENT_HELLO = 0x10
    ROBOT_COMMAND = 0x11

    # Bidirectional
    PING = 0x20
    PONG = 0x21
    ERROR = 0xFF


class MatchPhase(IntEnum):
    """Match phase enumeration."""
    PRE_MATCH = 0
    AUTO = 1
    TRANSITION = 2
    SHIFT_1 = 3
    SHIFT_2 = 4
    SHIFT_3 = 5
    SHIFT_4 = 6
    ENDGAME = 7
    POST_MATCH = 8


class RobotAction(IntEnum):
    """Robot action types."""
    IDLE = 0
    MOVING = 1
    PICKING_UP = 2
    SHOOTING = 3
    CLIMBING = 4


class BallState(IntEnum):
    """Ball state enumeration."""
    ON_FIELD = 0
    HELD = 1
    IN_FLIGHT = 2
    SCORED = 3
    OUT_OF_BOUNDS = 4


class Alliance(IntEnum):
    """Alliance enumeration."""
    RED = 0
    BLUE = 1


class ShiftParity(IntEnum):
    """Shift parity enumeration."""
    EVEN = 0
    ODD = 1
    NULL = 255


@dataclass
class RobotState:
    """Robot state from the world server."""
    id: str
    alliance: Alliance
    x: float
    y: float
    heading: float
    velocity: float
    action: RobotAction
    held_balls: int
    held_ball_ids: list[str]
    has_auto_climbed: bool
    has_climbed: bool
    climb_level: Optional[int]
    is_disabled: bool

    @classmethod
    def from_wire(cls, data: dict) -> "RobotState":
        """Create RobotState from wire format."""
        return cls(
            id=data["id"],
            alliance=Alliance(data["alliance"]),
            x=data["x"],
            y=data["y"],
            heading=data["heading"],
            velocity=data["velocity"],
            action=RobotAction(data["action"]),
            held_balls=data["heldBalls"],
            held_ball_ids=data["heldBallIds"],
            has_auto_climbed=data["hasAutoClimbed"],
            has_climbed=data["hasClimbed"],
            climb_level=data["climbLevel"],
            is_disabled=data["isDisabled"],
        )


@dataclass
class BallStateData:
    """Ball state from the world server."""
    id: str
    x: float
    y: float
    height: float
    state: BallState
    held_by: Optional[str]

    @classmethod
    def from_wire(cls, data: dict) -> "BallStateData":
        """Create BallStateData from wire format."""
        return cls(
            id=data["id"],
            x=data["x"],
            y=data["y"],
            height=data["height"],
            state=BallState(data["state"]),
            held_by=data["heldBy"],
        )


@dataclass
class WorldState:
    """Complete world state received each tick."""
    tick: int
    deadline_ms: int
    phase: MatchPhase
    phase_time_remaining: float
    current_shift: int
    my_robot: RobotState
    robots: list[RobotState]
    balls: list[BallStateData]
    field_id: str
    red_score: int
    blue_score: int
    red_parity: ShiftParity
    blue_parity: ShiftParity

    @classmethod
    def from_wire(cls, data: dict) -> "WorldState":
        """Create WorldState from wire format."""
        return cls(
            tick=data["tick"],
            deadline_ms=data["deadlineMs"],
            phase=MatchPhase(data["phase"]),
            phase_time_remaining=data["phaseTimeRemaining"],
            current_shift=data["currentShift"],
            my_robot=RobotState.from_wire(data["myRobot"]),
            robots=[RobotState.from_wire(r) for r in data["robots"]],
            balls=[BallStateData.from_wire(b) for b in data["balls"]],
            field_id=data["fieldId"],
            red_score=data["redScore"],
            blue_score=data["blueScore"],
            red_parity=ShiftParity(data["redParity"]),
            blue_parity=ShiftParity(data["blueParity"]),
        )

    def get_available_balls(self) -> list[BallStateData]:
        """Get balls that are available for pickup."""
        return [b for b in self.balls if b.state == BallState.ON_FIELD]

    def get_teammates(self) -> list[RobotState]:
        """Get teammate robots (excluding self)."""
        return [
            r for r in self.robots
            if r.alliance == self.my_robot.alliance and r.id != self.my_robot.id
        ]

    def get_opponents(self) -> list[RobotState]:
        """Get opponent robots."""
        return [r for r in self.robots if r.alliance != self.my_robot.alliance]

    def can_alliance_score(self) -> bool:
        """Check if our alliance can score in the current phase."""
        parity = (
            self.red_parity if self.my_robot.alliance == Alliance.RED
            else self.blue_parity
        )

        if self.phase in (MatchPhase.AUTO, MatchPhase.TRANSITION, MatchPhase.ENDGAME):
            return True

        if self.phase in (MatchPhase.SHIFT_1, MatchPhase.SHIFT_3):
            return parity == ShiftParity.ODD

        if self.phase in (MatchPhase.SHIFT_2, MatchPhase.SHIFT_4):
            return parity == ShiftParity.EVEN

        return False


@dataclass
class RobotCommand:
    """Command to send to the server."""
    tick: int
    robot_id: str
    action: RobotAction = RobotAction.IDLE
    target_x: Optional[float] = None
    target_y: Optional[float] = None
    target_ball_id: Optional[str] = None
    target_zone_id: Optional[str] = None
    climb_level: Optional[int] = None
    is_auto_climb: bool = False

    def to_wire(self) -> dict:
        """Convert to wire format."""
        return {
            "tick": self.tick,
            "robotId": self.robot_id,
            "action": int(self.action),
            "targetX": self.target_x,
            "targetY": self.target_y,
            "targetBallId": self.target_ball_id,
            "targetZoneId": self.target_zone_id,
            "climbLevel": self.climb_level,
            "isAutoClimb": self.is_auto_climb,
        }

    @classmethod
    def idle(cls, tick: int, robot_id: str) -> "RobotCommand":
        """Create an IDLE command."""
        return cls(tick=tick, robot_id=robot_id, action=RobotAction.IDLE)

    @classmethod
    def move_to(cls, tick: int, robot_id: str, x: float, y: float) -> "RobotCommand":
        """Create a MOVING command."""
        return cls(
            tick=tick,
            robot_id=robot_id,
            action=RobotAction.MOVING,
            target_x=x,
            target_y=y,
        )

    @classmethod
    def pick_up(cls, tick: int, robot_id: str, ball_id: str) -> "RobotCommand":
        """Create a PICKING_UP command."""
        return cls(
            tick=tick,
            robot_id=robot_id,
            action=RobotAction.PICKING_UP,
            target_ball_id=ball_id,
        )

    @classmethod
    def shoot(cls, tick: int, robot_id: str, zone_id: str) -> "RobotCommand":
        """Create a SHOOTING command."""
        return cls(
            tick=tick,
            robot_id=robot_id,
            action=RobotAction.SHOOTING,
            target_zone_id=zone_id,
        )

    @classmethod
    def climb(cls, tick: int, robot_id: str, level: int, is_auto: bool = False) -> "RobotCommand":
        """Create a CLIMBING command."""
        return cls(
            tick=tick,
            robot_id=robot_id,
            action=RobotAction.CLIMBING,
            climb_level=level,
            is_auto_climb=is_auto,
        )


@dataclass
class FieldConfig:
    """Field configuration received on connect."""
    field_id: str
    width: float
    height: float
    tick_rate: int
    command_timeout_ms: int
    scoring_targets: list[dict] = field(default_factory=list)
    zones: list[dict] = field(default_factory=list)

    @classmethod
    def from_wire(cls, data: dict) -> "FieldConfig":
        """Create FieldConfig from wire format."""
        config = data.get("config", {})
        return cls(
            field_id=data["fieldId"],
            width=config.get("width", 648),
            height=config.get("height", 324),
            tick_rate=data["tickRate"],
            command_timeout_ms=data["commandTimeoutMs"],
            scoring_targets=config.get("scoringTargets", []),
            zones=config.get("zones", []),
        )


@dataclass
class MatchResult:
    """Match result received when match ends."""
    red_score: int
    blue_score: int
    winner: str
    total_ticks: int

    @classmethod
    def from_wire(cls, data: dict) -> "MatchResult":
        """Create MatchResult from wire format."""
        return cls(
            red_score=data["redScore"],
            blue_score=data["blueScore"],
            winner=data["winner"],
            total_ticks=data["totalTicks"],
        )
