"""Stuck detection and escape handling for robots."""

from __future__ import annotations
import math
import random
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from ..types.enums import EscapeStrategy
from ..types.schemas import Position
from ..entities.robot import Robot
from ..field.field import Field


@dataclass
class StuckHandlerConfig:
    """Configuration for stuck detection and handling."""

    # Number of ticks with minimal movement to consider stuck (2 seconds at 60 FPS)
    stuck_threshold: int = 120
    # Minimum movement in inches to not be considered stuck
    min_movement: float = 0.5
    # Number of positions to track in history
    position_history_size: int = 10
    # Distance to scan for obstacles (inches)
    obstacle_detection_range: float = 60.0
    # Number of ticks between repath attempts (0.5 seconds)
    repath_interval: int = 30
    # Number of ticks before trying smart backoff (3 seconds)
    smart_backoff_threshold: int = 180
    # Number of ticks before abandoning target (6 seconds)
    abandon_threshold: int = 360
    # Backoff distance range (inches)
    backoff_distance_min: float = 40.0
    backoff_distance_max: float = 80.0


@dataclass
class PositionRecord:
    """Record of a position at a tick."""

    x: float
    y: float
    tick: int


@dataclass
class ObstacleInfo:
    """Information about a nearby obstacle."""

    type: str  # 'robot' or 'wall'
    position: Position
    distance: float
    angle: float
    robot_id: Optional[str] = None


@dataclass
class StuckState:
    """State tracking for stuck detection."""

    robot_id: str
    stuck_since: int = 0
    stuck_ticks: int = 0
    escape_attempts: int = 0
    last_escape_strategy: Optional[EscapeStrategy] = None
    failed_strategies: list[EscapeStrategy] = field(default_factory=list)
    nearby_obstacles: list[ObstacleInfo] = field(default_factory=list)
    position_history: deque[PositionRecord] = field(default_factory=deque)


@dataclass
class EscapeAction:
    """Action to take when robot is stuck."""

    strategy: EscapeStrategy
    target_position: Optional[Position] = None
    abandon_current_action: bool = False


class StuckHandler:
    """Handles detection of stuck robots and generation of escape strategies."""

    def __init__(self, config: Optional[StuckHandlerConfig] = None):
        self._config = config or StuckHandlerConfig()
        self._states: dict[str, StuckState] = {}

    def update(
        self,
        robot: Robot,
        tick: int,
        blocked: bool,
        field: Field,
        other_robots: list[Robot],
    ) -> Optional[EscapeAction]:
        """Update stuck tracking for a robot and return escape action if needed."""
        state = self._states.get(robot.id)

        # Initialize state if needed
        if state is None:
            state = self._create_initial_state(robot.id, tick)
            self._states[robot.id] = state

        # Update position history
        self._update_position_history(state, robot.position, tick)

        # Calculate actual movement over the history window
        actual_movement = self._calculate_movement(state)

        # Check if stuck
        is_stuck = blocked or actual_movement < self._config.min_movement

        if is_stuck:
            # First time becoming stuck
            if state.stuck_ticks == 0:
                state.stuck_since = tick

            state.stuck_ticks += 1

            # Detect nearby obstacles for smart escape
            state.nearby_obstacles = self._detect_obstacles(robot, field, other_robots)

            # Determine escape action based on how long we've been stuck
            return self._determine_escape_action(state, robot, field)
        else:
            # Not stuck - reset state
            self._reset_state(state, tick)
            return None

    def _create_initial_state(self, robot_id: str, tick: int) -> StuckState:
        """Create initial stuck state for a robot."""
        return StuckState(
            robot_id=robot_id,
            stuck_since=tick,
            position_history=deque(maxlen=self._config.position_history_size),
        )

    def _reset_state(self, state: StuckState, tick: int) -> None:
        """Reset stuck state while keeping position history."""
        state.stuck_since = tick
        state.stuck_ticks = 0
        state.escape_attempts = 0
        state.last_escape_strategy = None
        state.failed_strategies = []
        state.nearby_obstacles = []

    def _update_position_history(
        self, state: StuckState, position: Position, tick: int
    ) -> None:
        """Update position history."""
        # deque with maxlen automatically discards oldest items when full
        state.position_history.append(PositionRecord(x=position.x, y=position.y, tick=tick))

    def _calculate_movement(self, state: StuckState) -> float:
        """Calculate total movement over position history."""
        if len(state.position_history) < 2:
            return float("inf")  # Not enough data

        total_movement = 0.0
        for i in range(1, len(state.position_history)):
            prev = state.position_history[i - 1]
            curr = state.position_history[i]
            dx = curr.x - prev.x
            dy = curr.y - prev.y
            total_movement += math.sqrt(dx * dx + dy * dy)

        return total_movement

    def _detect_obstacles(
        self, robot: Robot, field: Field, other_robots: list[Robot]
    ) -> list[ObstacleInfo]:
        """Detect obstacles near the robot."""
        obstacles: list[ObstacleInfo] = []
        detection_range = self._config.obstacle_detection_range

        # Check other robots
        for other in other_robots:
            if other.id == robot.id:
                continue

            dx = other.position.x - robot.position.x
            dy = other.position.y - robot.position.y
            distance = math.sqrt(dx * dx + dy * dy)

            if distance <= detection_range:
                angle = math.degrees(math.atan2(dy, dx))
                obstacles.append(
                    ObstacleInfo(
                        type="robot",
                        position=Position(x=other.position.x, y=other.position.y),
                        distance=distance,
                        angle=angle,
                        robot_id=other.id,
                    )
                )

        # Check field boundaries
        wall_obstacles = self._detect_wall_obstacles(robot, field, detection_range)
        obstacles.extend(wall_obstacles)

        # Sort by distance
        obstacles.sort(key=lambda o: o.distance)
        return obstacles

    def _detect_wall_obstacles(
        self, robot: Robot, field: Field, detection_range: float
    ) -> list[ObstacleInfo]:
        """Detect wall/boundary obstacles."""
        walls: list[ObstacleInfo] = []
        x, y = robot.position.x, robot.position.y
        width = field.width
        height = field.height

        # Left wall
        if x <= detection_range:
            walls.append(
                ObstacleInfo(
                    type="wall",
                    position=Position(x=0, y=y),
                    distance=x,
                    angle=180.0,
                )
            )
        # Right wall
        if x >= width - detection_range:
            walls.append(
                ObstacleInfo(
                    type="wall",
                    position=Position(x=width, y=y),
                    distance=width - x,
                    angle=0.0,
                )
            )
        # Bottom wall
        if y <= detection_range:
            walls.append(
                ObstacleInfo(
                    type="wall",
                    position=Position(x=x, y=0),
                    distance=y,
                    angle=-90.0,
                )
            )
        # Top wall
        if y >= height - detection_range:
            walls.append(
                ObstacleInfo(
                    type="wall",
                    position=Position(x=x, y=height),
                    distance=height - y,
                    angle=90.0,
                )
            )

        return walls

    def _determine_escape_action(
        self, state: StuckState, robot: Robot, field: Field
    ) -> Optional[EscapeAction]:
        """Determine what escape action to take based on stuck duration."""
        ticks = state.stuck_ticks
        interval = self._config.repath_interval

        # Escalation timeline (at 60 FPS):
        # 120 ticks (2 sec): First repath
        # 150, 180 ticks: Additional repath attempts
        # 180+ ticks (3 sec): Smart backoff (obstacle-aware perpendicular escape)
        # 360+ ticks (6 sec): Abandon target

        if ticks >= self._config.abandon_threshold:
            # Give up entirely
            state.last_escape_strategy = EscapeStrategy.ABANDON_TARGET
            state.escape_attempts += 1
            return EscapeAction(
                strategy=EscapeStrategy.ABANDON_TARGET,
                abandon_current_action=True,
            )

        if ticks >= self._config.smart_backoff_threshold:
            # Smart backoff - find clearest direction
            return self._create_smart_backoff_action(state, robot, field)

        # Regular repath attempts
        if ticks >= self._config.stuck_threshold and ticks % interval == 0:
            state.last_escape_strategy = EscapeStrategy.REPATH
            state.escape_attempts += 1
            return EscapeAction(
                strategy=EscapeStrategy.REPATH,
                abandon_current_action=False,
            )

        return None

    def _create_smart_backoff_action(
        self, state: StuckState, robot: Robot, field: Field
    ) -> EscapeAction:
        """Create a smart backoff action based on obstacle detection."""
        # Find the clearest direction (8 directions)
        directions = self._find_clear_directions(state, robot, field)

        # Pick the best escape strategy based on clear directions
        if len(directions) == 0:
            # No clear directions - try random
            strategy = EscapeStrategy.RANDOM_DIRECTION
            target_position = self._calculate_random_escape_position(robot, field)
        else:
            # Pick a strategy based on clearest direction
            best = directions[0]

            # Classify direction into strategy
            if -45 <= best["angle"] < 45:
                # Forward-ish (but we're stuck, so not useful)
                strategy = (
                    EscapeStrategy.PERPENDICULAR_LEFT
                    if random.random() < 0.5
                    else EscapeStrategy.PERPENDICULAR_RIGHT
                )
            elif best["angle"] >= 135 or best["angle"] < -135:
                strategy = EscapeStrategy.BACKWARD
            elif 45 <= best["angle"] < 135:
                strategy = EscapeStrategy.PERPENDICULAR_LEFT
            else:
                strategy = EscapeStrategy.PERPENDICULAR_RIGHT

            # Check if this strategy already failed
            if strategy in state.failed_strategies:
                # Try another direction
                alternatives = [
                    s
                    for s in [
                        EscapeStrategy.PERPENDICULAR_LEFT,
                        EscapeStrategy.PERPENDICULAR_RIGHT,
                        EscapeStrategy.BACKWARD,
                    ]
                    if s not in state.failed_strategies
                ]

                if alternatives:
                    strategy = random.choice(alternatives)
                else:
                    strategy = EscapeStrategy.RANDOM_DIRECTION

            target_position = self._calculate_escape_position(robot, strategy, field)

        # Record this attempt
        state.last_escape_strategy = strategy
        state.escape_attempts += 1

        return EscapeAction(
            strategy=strategy,
            target_position=target_position,
            abandon_current_action=False,
        )

    def _find_clear_directions(
        self, state: StuckState, robot: Robot, field: Field
    ) -> list[dict]:
        """Find directions that are relatively clear of obstacles."""
        directions: list[dict] = []

        # Check 8 directions (every 45 degrees)
        for angle in range(0, 360, 45):
            clearance = self._config.obstacle_detection_range

            # Check each obstacle
            for obstacle in state.nearby_obstacles:
                # Calculate angular difference
                angle_diff = abs(obstacle.angle - angle)
                if angle_diff > 180:
                    angle_diff = 360 - angle_diff

                # If obstacle is roughly in this direction (within 45 degrees)
                if angle_diff < 45:
                    clearance = min(clearance, obstacle.distance)

            # Also check field boundaries
            test_dist = 50.0
            test_x = robot.position.x + math.cos(math.radians(angle)) * test_dist
            test_y = robot.position.y + math.sin(math.radians(angle)) * test_dist

            if (
                test_x < 20
                or test_x > field.width - 20
                or test_y < 20
                or test_y > field.height - 20
            ):
                clearance = min(clearance, 20.0)

            directions.append({"angle": angle, "clearance": clearance})

        # Sort by clearance (most clear first) and filter
        return sorted(
            [d for d in directions if d["clearance"] > 20],
            key=lambda d: d["clearance"],
            reverse=True,
        )

    def _calculate_escape_position(
        self, robot: Robot, strategy: EscapeStrategy, field: Field
    ) -> Position:
        """Calculate escape position based on strategy."""
        heading = math.radians(robot.heading)
        distance = self._config.backoff_distance_min + random.random() * (
            self._config.backoff_distance_max - self._config.backoff_distance_min
        )

        if strategy == EscapeStrategy.PERPENDICULAR_LEFT:
            escape_angle = heading + math.pi / 2
        elif strategy == EscapeStrategy.PERPENDICULAR_RIGHT:
            escape_angle = heading - math.pi / 2
        elif strategy == EscapeStrategy.BACKWARD:
            escape_angle = heading + math.pi
        else:
            escape_angle = random.random() * math.pi * 2

        x = robot.position.x + math.cos(escape_angle) * distance
        y = robot.position.y + math.sin(escape_angle) * distance

        # Clamp to field bounds
        x = max(20, min(field.width - 20, x))
        y = max(20, min(field.height - 20, y))

        return Position(x=x, y=y)

    def _calculate_random_escape_position(self, robot: Robot, field: Field) -> Position:
        """Calculate random escape position."""
        angle = random.random() * math.pi * 2
        distance = self._config.backoff_distance_min + random.random() * (
            self._config.backoff_distance_max - self._config.backoff_distance_min
        )

        x = robot.position.x + math.cos(angle) * distance
        y = robot.position.y + math.sin(angle) * distance

        # Clamp to field bounds
        x = max(20, min(field.width - 20, x))
        y = max(20, min(field.height - 20, y))

        return Position(x=x, y=y)

    def mark_strategy_failed(self, robot_id: str, strategy: EscapeStrategy) -> None:
        """Mark an escape strategy as failed for a robot."""
        state = self._states.get(robot_id)
        if state and strategy not in state.failed_strategies:
            state.failed_strategies.append(strategy)

    def get_state(self, robot_id: str) -> Optional[StuckState]:
        """Get stuck state for a robot."""
        return self._states.get(robot_id)

    def is_stuck(self, robot_id: str) -> bool:
        """Check if a robot is currently stuck."""
        state = self._states.get(robot_id)
        return state is not None and state.stuck_ticks >= self._config.stuck_threshold

    def get_stuck_robots(self) -> list[str]:
        """Get all stuck robots."""
        return [
            robot_id
            for robot_id, state in self._states.items()
            if state.stuck_ticks >= self._config.stuck_threshold
        ]

    def clear_state(self, robot_id: str) -> None:
        """Clear state for a robot."""
        self._states.pop(robot_id, None)

    def clear(self) -> None:
        """Clear all states."""
        self._states.clear()
