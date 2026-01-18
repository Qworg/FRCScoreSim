"""Enumerations for game state."""

from enum import Enum


class MatchPhase(str, Enum):
    """Match phase."""
    PRE_MATCH = "PRE_MATCH"
    AUTO = "AUTO"
    TRANSITION = "TRANSITION"
    SHIFT_1 = "SHIFT_1"
    SHIFT_2 = "SHIFT_2"
    SHIFT_3 = "SHIFT_3"
    SHIFT_4 = "SHIFT_4"
    ENDGAME = "ENDGAME"
    POST_MATCH = "POST_MATCH"


class BallState(str, Enum):
    """Ball state."""
    ON_FIELD = "ON_FIELD"
    HELD = "HELD"
    IN_FLIGHT = "IN_FLIGHT"
    SCORED = "SCORED"
    OUT_OF_BOUNDS = "OUT_OF_BOUNDS"


class RobotActionType(str, Enum):
    """Robot action types."""
    IDLE = "IDLE"
    MOVING = "MOVING"
    PICKING_UP = "PICKING_UP"
    SHOOTING = "SHOOTING"
    PASSING = "PASSING"
    CLIMBING = "CLIMBING"
    DEFENDING = "DEFENDING"


class ZoneType(str, Enum):
    """Field zone types."""
    NORMAL = "NORMAL"
    CLIMBING = "CLIMBING"
    RAMP = "RAMP"
    TRENCH = "TRENCH"
    SCORING_ZONE = "SCORING_ZONE"
    OBSTACLE = "OBSTACLE"
    OUT_OF_BOUNDS = "OUT_OF_BOUNDS"


class ShiftParity(str, Enum):
    """Shift parity for scoring rules."""
    EVEN = "EVEN"
    ODD = "ODD"


class Alliance(str, Enum):
    """Alliance color."""
    RED = "red"
    BLUE = "blue"
