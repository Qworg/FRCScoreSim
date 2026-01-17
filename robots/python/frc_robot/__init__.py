"""
FRC Robot Client - Python implementation for distributed FRC Score Simulator
"""

from .client import RobotClient
from .protocol import (
    MessageType,
    MatchPhase,
    RobotAction,
    BallState,
    Alliance,
    ShiftParity,
    WorldState,
    RobotState,
    BallStateData,
    RobotCommand,
    PROTOCOL_VERSION,
)

__version__ = "0.1.0"
__all__ = [
    "RobotClient",
    "MessageType",
    "MatchPhase",
    "RobotAction",
    "BallState",
    "Alliance",
    "ShiftParity",
    "WorldState",
    "RobotState",
    "BallStateData",
    "RobotCommand",
    "PROTOCOL_VERSION",
]
