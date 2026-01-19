"""Field representation with zone management."""

from __future__ import annotations
import math
from typing import Optional

from ..types.enums import ZoneType
from ..types.schemas import (
    Position,
    FieldConfig,
    ZoneDefinition,
    ScoringTarget,
    BallSpawnPoint,
)


class Field:
    """Field representation with zone grid and utilities."""

    def __init__(self, config: FieldConfig):
        self.config = config
        self._zone_cache: dict[tuple[int, int], ZoneDefinition | None] = {}

    @property
    def width(self) -> float:
        """Get field width."""
        return self.config.width

    @property
    def height(self) -> float:
        """Get field height."""
        return self.config.height

    def get_zone_at(self, pos: Position) -> Optional[ZoneDefinition]:
        """Get the zone at a position."""
        # Use integer grid position for caching
        grid_key = (int(pos.x), int(pos.y))
        if grid_key in self._zone_cache:
            return self._zone_cache[grid_key]

        for zone in self.config.zones:
            bounds = zone.bounds
            if (
                bounds.minX <= pos.x <= bounds.maxX
                and bounds.minY <= pos.y <= bounds.maxY
            ):
                self._zone_cache[grid_key] = zone
                return zone

        self._zone_cache[grid_key] = None
        return None

    def get_zone_type_at(self, pos: Position) -> ZoneType:
        """Get the zone type at a position."""
        zone = self.get_zone_at(pos)
        if zone:
            return ZoneType(zone.type)
        return ZoneType.NORMAL

    def get_speed_multiplier_at(self, pos: Position) -> float:
        """Get the speed multiplier at a position."""
        zone = self.get_zone_at(pos)
        if zone and zone.modifiers and zone.modifiers.speedMultiplier is not None:
            return zone.modifiers.speedMultiplier
        return 1.0

    def get_ramp_height_at(self, pos: Position) -> float:
        """Get the ramp height at a position.

        Uses parabolic profile to match TypeScript implementation.
        Ramp is highest at center, tapers to 0 at edges.
        """
        zone = self.get_zone_at(pos)
        if zone and zone.modifiers and zone.modifiers.rampHeight is not None:
            ramp_height = zone.modifiers.rampHeight
            if ramp_height == 0:
                return 0.0

            # Calculate position within ramp (0 = edge, 1 = center)
            bounds = zone.bounds
            zone_center_x = (bounds.minX + bounds.maxX) / 2
            zone_width = bounds.maxX - bounds.minX

            if zone_width == 0:
                return ramp_height

            dist_from_center = abs(pos.x - zone_center_x)
            normalized_dist = dist_from_center / (zone_width / 2)

            # Ramp is highest at center, tapers to 0 at edges
            # Use a smooth curve (parabolic) for the ramp profile
            height_factor = 1 - normalized_dist * normalized_dist
            return ramp_height * max(0.0, height_factor)

        return 0.0

    def is_in_bounds(self, pos: Position) -> bool:
        """Check if position is in bounds."""
        return 0 <= pos.x <= self.config.width and 0 <= pos.y <= self.config.height

    def is_passable(self, pos: Position, robot_height: float = 0.0) -> bool:
        """Check if a position is passable for a robot."""
        if not self.is_in_bounds(pos):
            return False

        zone = self.get_zone_at(pos)
        if zone:
            # Check for impassable zones
            if zone.type == ZoneType.OBSTACLE.value:
                return False
            if zone.type == ZoneType.OUT_OF_BOUNDS.value:
                return False

            # Scoring zones with blocksBalls are also impassable to robots
            if (
                zone.type == ZoneType.SCORING_ZONE.value
                and zone.modifiers
                and zone.modifiers.blocksBalls
            ):
                return False

            if zone.modifiers:
                # Check for protected zones
                if zone.modifiers.protected:
                    return False
                # Check height restrictions (e.g., trench)
                if (
                    zone.modifiers.maxHeight is not None
                    and robot_height > zone.modifiers.maxHeight
                ):
                    return False
        return True

    def get_cost_at(self, pos: Position) -> float:
        """Get the pathfinding cost at a position.

        Matches TypeScript calculateBaseCost implementation.
        """
        zone = self.get_zone_at(pos)
        if zone:
            zone_type = zone.type
            modifiers = zone.modifiers

            if zone_type == ZoneType.NORMAL.value:
                return 1.0
            if zone_type == ZoneType.RAMP.value:
                # Use inverse of speedMultiplier (default 0.5 -> cost 2.0)
                speed_mult = modifiers.speedMultiplier if modifiers else 0.5
                return 1.0 / (speed_mult if speed_mult else 0.5)
            if zone_type == ZoneType.TRENCH.value:
                return 1.1
            if zone_type == ZoneType.CLIMBING.value:
                return 1.5
            if zone_type == ZoneType.SCORING_ZONE.value:
                return 1.0
            if zone_type == ZoneType.OBSTACLE.value:
                return float("inf")
            if zone_type == ZoneType.OUT_OF_BOUNDS.value:
                return float("inf")

        return 1.0

    def is_near_climbing_zone(
        self, pos: Position, alliance: str, proximity_threshold: float = 36.0
    ) -> bool:
        """Check if position is within or near a climbing zone for the alliance.

        Uses position-based alliance detection: red climbing zone is on the left
        (low X), blue is on the right (high X).
        """
        for zone in self.config.zones:
            if zone.type != ZoneType.CLIMBING.value:
                continue

            # Check if this is the alliance's climbing zone based on position
            # Red climbing zone is on the left (low X), Blue is on the right (high X)
            is_red_zone = zone.bounds.minX < self.config.width / 2
            is_alliance_zone = (alliance == "red" and is_red_zone) or (
                alliance == "blue" and not is_red_zone
            )

            if not is_alliance_zone:
                continue

            # Check if position is within the zone
            bounds = zone.bounds
            in_zone_x = bounds.minX <= pos.x <= bounds.maxX
            in_zone_y = bounds.minY <= pos.y <= bounds.maxY

            if in_zone_x and in_zone_y:
                return True

            # Check proximity to zone bounds using clamped distance
            dist_to_zone = self._distance_to_zone(pos, bounds)
            if dist_to_zone <= proximity_threshold:
                return True

        return False

    def _distance_to_zone(
        self,
        pos: Position,
        bounds: "ZoneDefinition.bounds",
    ) -> float:
        """Calculate minimum distance from a position to a zone's bounds."""
        clamped_x = max(bounds.minX, min(bounds.maxX, pos.x))
        clamped_y = max(bounds.minY, min(bounds.maxY, pos.y))
        dx = pos.x - clamped_x
        dy = pos.y - clamped_y
        return math.sqrt(dx * dx + dy * dy)

    def is_in_no_score_zone(self, pos: Position) -> bool:
        """Check if position is in a no-scoring zone."""
        zone = self.get_zone_at(pos)
        if zone and zone.modifiers and zone.modifiers.noScoring:
            return True
        return False

    def is_in_ball_blocking_zone(self, pos: Position) -> bool:
        """Check if position is in a ball-blocking zone."""
        zone = self.get_zone_at(pos)
        if zone and zone.modifiers and zone.modifiers.blocksBalls:
            return True
        return False

    def get_starting_positions(self, alliance: str) -> list[Position]:
        """Get starting positions for an alliance."""
        if alliance == "red":
            return self.config.startingPositions.red
        return self.config.startingPositions.blue

    def get_scoring_targets(self, alliance: str) -> list[ScoringTarget]:
        """Get scoring targets for an alliance."""
        return [t for t in self.config.scoringTargets if t.alliance == alliance]

    def get_scoring_target(self, target_id: str) -> Optional[ScoringTarget]:
        """Get a scoring target by ID."""
        for target in self.config.scoringTargets:
            if target.id == target_id:
                return target
        return None

    def get_ball_spawn_points(self) -> list[BallSpawnPoint]:
        """Get all ball spawn points."""
        return self.config.ballSpawnPoints

    def get_spawn_point(self, spawn_id: str) -> Optional[BallSpawnPoint]:
        """Get a spawn point by ID."""
        for sp in self.config.ballSpawnPoints:
            if sp.id == spawn_id:
                return sp
        return None

    def is_on_alliance_side(self, pos: Position, alliance: str) -> bool:
        """Check if position is on the alliance's side of the field."""
        mid_x = self.config.width / 2
        if alliance == "red":
            return pos.x < mid_x
        return pos.x >= mid_x

    def is_good_shooting_position(self, pos: Position) -> bool:
        """Check if position is good for shooting.

        Cannot shoot from ramps, trenches, or no-score zones.
        """
        zone = self.get_zone_at(pos)

        # Can't shoot from ramps
        if zone and zone.type == ZoneType.RAMP.value:
            return False

        # Can't shoot from trenches
        if zone and zone.type == ZoneType.TRENCH.value:
            return False

        # Can't shoot from no-score zone
        if self.is_in_no_score_zone(pos):
            return False

        return True

    def has_clear_shot_path(self, from_pos: Position, to_pos: Position) -> bool:
        """Check if there's a clear shot path between two positions.

        Currently returns True as we don't have obstacle detection for shots.
        This could be extended to check for obstacles along the path.
        """
        # For now, assume all shots have a clear path
        # A more sophisticated implementation could check for obstacles
        return True

    def clamp_to_bounds(self, pos: Position, margin: float = 0.0) -> Position:
        """Clamp a position to be within field bounds."""
        return Position(
            x=max(margin, min(self.config.width - margin, pos.x)),
            y=max(margin, min(self.config.height - margin, pos.y)),
        )
