"""Field representation with zone management."""

from __future__ import annotations
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
            if zone.type == ZoneType.OBSTACLE.value:
                return False
            if zone.type == ZoneType.OUT_OF_BOUNDS.value:
                return False
            if zone.modifiers:
                if zone.modifiers.protected:
                    return False
                if (
                    zone.modifiers.maxHeight is not None
                    and robot_height > zone.modifiers.maxHeight
                ):
                    return False
        return True

    def get_cost_at(self, pos: Position) -> float:
        """Get the pathfinding cost at a position."""
        zone = self.get_zone_at(pos)
        if zone:
            if zone.type == ZoneType.RAMP.value:
                return 2.0  # Ramps are slower
            if zone.modifiers and zone.modifiers.speedMultiplier is not None:
                return 1.0 / zone.modifiers.speedMultiplier
        return 1.0

    def is_near_climbing_zone(self, pos: Position, alliance: str) -> bool:
        """Check if position is near the alliance's climbing zone."""
        proximity = 30.0  # 30 inches proximity

        for zone in self.config.zones:
            if zone.type != ZoneType.CLIMBING.value:
                continue

            if zone.modifiers and zone.modifiers.alliance != alliance:
                continue

            # Check proximity to climbing zone
            bounds = zone.bounds
            center_x = (bounds.minX + bounds.maxX) / 2
            center_y = (bounds.minY + bounds.maxY) / 2

            dx = abs(pos.x - center_x)
            dy = abs(pos.y - center_y)

            half_width = (bounds.maxX - bounds.minX) / 2 + proximity
            half_height = (bounds.maxY - bounds.minY) / 2 + proximity

            if dx <= half_width and dy <= half_height:
                return True

        return False

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

    def has_clear_shot_path(
        self, from_pos: Position, to_pos: Position
    ) -> bool:
        """Check if there's a clear path for shooting."""
        # Simple check - no obstacles in the way
        # More sophisticated implementation could check for blocking zones
        return True

    def is_good_shooting_position(self, pos: Position) -> bool:
        """Check if position is a good shooting position."""
        # Not in a no-score zone
        return not self.is_in_no_score_zone(pos)

    def clamp_to_bounds(self, pos: Position, margin: float = 0.0) -> Position:
        """Clamp a position to be within field bounds."""
        return Position(
            x=max(margin, min(self.config.width - margin, pos.x)),
            y=max(margin, min(self.config.height - margin, pos.y)),
        )
