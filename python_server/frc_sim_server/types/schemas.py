"""msgspec Struct definitions for fast serialization."""

from __future__ import annotations
from typing import Optional
import msgspec

from .enums import MatchPhase, BallState, RobotActionType, ZoneType, ShiftParity


class Position(msgspec.Struct):
    """2D position in world coordinates (inches)."""
    x: float
    y: float


class BallVelocity(msgspec.Struct):
    """Ball velocity vector."""
    vx: float
    vy: float
    vz: float


class ZoneModifiers(msgspec.Struct, omit_defaults=True):
    """Zone modifiers that affect robot behavior."""
    speedMultiplier: Optional[float] = None
    maxHeight: Optional[float] = None
    climbable: Optional[bool] = None
    protected: Optional[bool] = None
    alliance: Optional[str] = None
    noScoring: Optional[bool] = None
    blocksBalls: Optional[bool] = None
    rampHeight: Optional[float] = None
    rampDirection: Optional[str] = None


class ZoneBounds(msgspec.Struct):
    """Zone boundary definition."""
    minX: float
    maxX: float
    minY: float
    maxY: float


class ZoneDefinition(msgspec.Struct, omit_defaults=True):
    """Zone definition for field configuration."""
    name: str
    type: str
    bounds: ZoneBounds
    modifiers: Optional[ZoneModifiers] = None


class BallSpawnPoint(msgspec.Struct, omit_defaults=True):
    """Ball spawn point configuration."""
    id: str
    position: Position
    alliance: Optional[str] = None


class ScoringPoints(msgspec.Struct):
    """Scoring points for a target."""
    auto: int
    teleop: int


class ScoringTarget(msgspec.Struct, omit_defaults=True):
    """Scoring target configuration."""
    id: str
    name: str
    position: Position
    radius: float
    alliance: str
    points: ScoringPoints
    minHeight: Optional[float] = None
    maxHeight: Optional[float] = None


class StartingPositions(msgspec.Struct):
    """Starting positions for both alliances."""
    red: list[Position]
    blue: list[Position]


class FieldConfig(msgspec.Struct):
    """Complete field configuration."""
    name: str
    year: int
    width: float
    height: float
    cellSize: float
    zones: list[ZoneDefinition]
    ballSpawnPoints: list[BallSpawnPoint]
    scoringTargets: list[ScoringTarget]
    startingPositions: StartingPositions


class RobotConfig(msgspec.Struct, omit_defaults=True):
    """Robot configuration."""
    id: str
    teamNumber: int
    teamName: str
    width: float
    length: float
    height: float
    topSpeed: float
    acceleration: float
    turnRate: float
    shootingRange: float
    shootingAccuracy: float
    ballCapacity: int
    pickupTime: float
    shootTime: float
    canClimb: bool
    autoClimb: bool
    climbLevel: int
    climbUpTime: float
    climbDownTime: float
    canPass: bool
    defaultStrategy: str
    collectionFaceSize: Optional[float] = None


class RobotAction(msgspec.Struct, omit_defaults=True):
    """Current action state."""
    type: str
    progress: float
    startedAt: int
    targetPosition: Optional[Position] = None
    targetBallId: Optional[str] = None
    targetBallIds: Optional[list[str]] = None
    targetScoringZoneId: Optional[str] = None
    targetRobotId: Optional[str] = None
    targetClimbLevel: Optional[int] = None
    isAutoClimb: Optional[bool] = None


class RobotState(msgspec.Struct, omit_defaults=True):
    """Current robot state."""
    id: str
    config: RobotConfig
    alliance: str
    position: Position
    heading: float
    velocity: float
    heldBalls: list[str]
    currentAction: RobotAction
    disabled: bool
    hasAutoClimbed: bool
    hasClimbed: bool
    currentPath: list[Position]
    pathIndex: int
    secondaryAction: Optional[RobotAction] = None
    currentClimbLevel: Optional[int] = None


class BallData(msgspec.Struct, omit_defaults=True):
    """Ball entity data."""
    id: str
    state: str
    position: Position
    height: float
    velocity: BallVelocity
    spawnPointId: str
    lastUpdateTick: int
    heldByRobotId: Optional[str] = None
    shotByRobotId: Optional[str] = None
    shotFromPosition: Optional[Position] = None
    targetPosition: Optional[Position] = None
    alliance: Optional[str] = None
    claimedByRobotId: Optional[str] = None
    claimedAtTick: Optional[int] = None


class AllianceScore(msgspec.Struct):
    """Alliance score breakdown."""
    auto: int
    teleop: int
    endgame: int
    penalties: int
    total: int
    breakdown: dict[str, int]
    autoBallCount: int
    totalBallCount: int
    autoClimbCount: int
    endgameClimbCount: int
    endgameClimbLevelTotal: int


class Score(msgspec.Struct):
    """Match scores."""
    red: AllianceScore
    blue: AllianceScore


class PhaseTiming(msgspec.Struct):
    """Phase timing configuration."""
    auto: float
    transition: float
    shift1: float
    shift2: float
    shift3: float
    shift4: float
    endgame: float


class GameRules(msgspec.Struct):
    """Game rules configuration."""
    timing: PhaseTiming
    autoClimbPoints: int
    endgameClimbPointsPerLevel: int
    maxAutoClimbers: int
    maxEndgameClimbers: int
    penaltyPoints: int
    maxBallsOnField: int


class BallPhysicsConfig(msgspec.Struct):
    """Ball physics configuration."""
    radius: float
    groundFriction: float
    airResistance: float
    gravity: float
    minVelocity: float
    respawnDelay: int


class GameState(msgspec.Struct, omit_defaults=True):
    """Complete game state at a point in time."""
    tick: int
    elapsedTime: float
    phase: str
    phaseTimeRemaining: float
    robots: list[RobotState]
    balls: list[BallData]
    score: Score
    events: list[dict]
    paused: bool
    currentShift: Optional[int] = None
    redParity: Optional[str] = None
    blueParity: Optional[str] = None


class WSMessage(msgspec.Struct, omit_defaults=True):
    """WebSocket message structure."""
    type: str
    tick: Optional[int] = None
    data: Optional[object] = None


class ConfigMessage(msgspec.Struct):
    """Configuration message data."""
    field: FieldConfig
    robots: list[RobotConfig]


# Default configurations
DEFAULT_PHASE_TIMING = PhaseTiming(
    auto=20.0,
    transition=10.0,
    shift1=25.0,
    shift2=25.0,
    shift3=25.0,
    shift4=25.0,
    endgame=30.0,
)

DEFAULT_BALL_PHYSICS = BallPhysicsConfig(
    radius=2.5,
    groundFriction=0.95,
    airResistance=0.99,
    gravity=386.0,
    minVelocity=1.0,
    respawnDelay=60,
)

DEFAULT_GAME_RULES = GameRules(
    timing=DEFAULT_PHASE_TIMING,
    autoClimbPoints=15,
    endgameClimbPointsPerLevel=10,
    maxAutoClimbers=2,
    maxEndgameClimbers=3,
    penaltyPoints=3,
    maxBallsOnField=11,
)
