"""A* pathfinding implementation."""

from __future__ import annotations
import heapq
from typing import Optional
from dataclasses import dataclass, field

from ..types.schemas import Position
from .field import Field


@dataclass
class PathResult:
    """Result of pathfinding."""
    found: bool
    path: list[Position]
    cost: float = 0.0


@dataclass(order=True)
class PriorityNode:
    """Priority queue node for A*."""
    f_score: float
    g_score: float = field(compare=False)
    pos: tuple[int, int] = field(compare=False)


class AStar:
    """A* pathfinding algorithm."""

    # 8 directions: N, NE, E, SE, S, SW, W, NW
    DIRECTIONS = [
        (0, 1), (1, 1), (1, 0), (1, -1),
        (0, -1), (-1, -1), (-1, 0), (-1, 1),
    ]
    DIAGONAL_COST = 1.414  # sqrt(2)

    def __init__(
        self,
        field: Field,
        robot_height: float = 0.0,
        robot_width: float = 30.0,
        step_size: int = 12,
    ):
        self.field = field
        self.robot_height = robot_height
        self.robot_width = robot_width
        self.step_size = step_size
        self._dynamic_obstacles: set[tuple[int, int]] = set()
        self._obstacle_radius = robot_width

    def set_dynamic_obstacles(
        self, positions: list[Position], radius: float
    ) -> None:
        """Set dynamic obstacles (other robots)."""
        self._dynamic_obstacles.clear()
        self._obstacle_radius = radius
        grid_radius = int(radius / self.step_size) + 1

        for pos in positions:
            cx, cy = int(pos.x / self.step_size), int(pos.y / self.step_size)
            for dx in range(-grid_radius, grid_radius + 1):
                for dy in range(-grid_radius, grid_radius + 1):
                    self._dynamic_obstacles.add((cx + dx, cy + dy))

    def set_dynamic_obstacles_with_alliances(
        self,
        friendly_positions: list[Position],
        opponent_positions: list[Position],
        friendly_radius: float,
        opponent_radius: float,
    ) -> None:
        """Set dynamic obstacles with different radii for friendly/opponent robots."""
        self._dynamic_obstacles.clear()

        # Add friendly obstacles with larger radius
        grid_radius = int(friendly_radius / self.step_size) + 1
        for pos in friendly_positions:
            cx, cy = int(pos.x / self.step_size), int(pos.y / self.step_size)
            for dx in range(-grid_radius, grid_radius + 1):
                for dy in range(-grid_radius, grid_radius + 1):
                    self._dynamic_obstacles.add((cx + dx, cy + dy))

        # Add opponent obstacles with smaller radius
        grid_radius = int(opponent_radius / self.step_size) + 1
        for pos in opponent_positions:
            cx, cy = int(pos.x / self.step_size), int(pos.y / self.step_size)
            for dx in range(-grid_radius, grid_radius + 1):
                for dy in range(-grid_radius, grid_radius + 1):
                    self._dynamic_obstacles.add((cx + dx, cy + dy))

    def clear_dynamic_obstacles(self) -> None:
        """Clear all dynamic obstacles."""
        self._dynamic_obstacles.clear()

    def _to_grid(self, pos: Position) -> tuple[int, int]:
        """Convert world position to grid position."""
        return (int(pos.x / self.step_size), int(pos.y / self.step_size))

    def _to_world(self, grid: tuple[int, int]) -> Position:
        """Convert grid position to world position."""
        return Position(
            x=(grid[0] + 0.5) * self.step_size,
            y=(grid[1] + 0.5) * self.step_size,
        )

    def _is_passable(self, grid: tuple[int, int]) -> bool:
        """Check if a grid position is passable."""
        if grid in self._dynamic_obstacles:
            return False

        world_pos = self._to_world(grid)
        return self.field.is_passable(world_pos, self.robot_height)

    def _heuristic(
        self, a: tuple[int, int], b: tuple[int, int]
    ) -> float:
        """Calculate heuristic (Euclidean distance)."""
        dx = abs(a[0] - b[0])
        dy = abs(a[1] - b[1])
        return ((dx * dx + dy * dy) ** 0.5) * self.step_size

    def _get_cost(self, grid: tuple[int, int]) -> float:
        """Get the cost of moving to a grid cell."""
        world_pos = self._to_world(grid)
        return self.field.get_cost_at(world_pos)

    def find_path(
        self,
        start: Position,
        goal: Position,
        max_iterations: int = 10000,
    ) -> PathResult:
        """Find a path from start to goal using A*."""
        start_grid = self._to_grid(start)
        goal_grid = self._to_grid(goal)

        # Quick check if goal is reachable
        if not self._is_passable(goal_grid):
            # Try to find nearby passable position
            goal_grid = self._find_nearest_passable(goal_grid)
            if goal_grid is None:
                return PathResult(found=False, path=[])

        # A* algorithm
        open_set: list[PriorityNode] = []
        closed_set: set[tuple[int, int]] = set()
        came_from: dict[tuple[int, int], tuple[int, int]] = {}
        g_scores: dict[tuple[int, int], float] = {start_grid: 0.0}

        start_h = self._heuristic(start_grid, goal_grid)
        heapq.heappush(open_set, PriorityNode(start_h, 0.0, start_grid))

        iterations = 0
        while open_set and iterations < max_iterations:
            iterations += 1
            current = heapq.heappop(open_set)

            if current.pos == goal_grid:
                # Reconstruct path
                path = self._reconstruct_path(came_from, current.pos)
                # Always include actual start and goal positions
                if path:
                    path[0] = start
                    path[-1] = goal
                return PathResult(found=True, path=path, cost=current.g_score)

            if current.pos in closed_set:
                continue
            closed_set.add(current.pos)

            # Explore neighbors
            for i, (dx, dy) in enumerate(self.DIRECTIONS):
                neighbor = (current.pos[0] + dx, current.pos[1] + dy)

                if neighbor in closed_set:
                    continue

                if not self._is_passable(neighbor):
                    continue

                # Diagonal movement cost
                move_cost = self.DIAGONAL_COST if (dx != 0 and dy != 0) else 1.0
                move_cost *= self._get_cost(neighbor) * self.step_size

                tentative_g = current.g_score + move_cost

                if neighbor not in g_scores or tentative_g < g_scores[neighbor]:
                    came_from[neighbor] = current.pos
                    g_scores[neighbor] = tentative_g
                    f_score = tentative_g + self._heuristic(neighbor, goal_grid)
                    heapq.heappush(
                        open_set,
                        PriorityNode(f_score, tentative_g, neighbor),
                    )

        return PathResult(found=False, path=[])

    def _find_nearest_passable(
        self, grid: tuple[int, int], max_search: int = 5
    ) -> Optional[tuple[int, int]]:
        """Find the nearest passable grid cell."""
        for radius in range(1, max_search + 1):
            for dx in range(-radius, radius + 1):
                for dy in range(-radius, radius + 1):
                    if abs(dx) == radius or abs(dy) == radius:
                        candidate = (grid[0] + dx, grid[1] + dy)
                        if self._is_passable(candidate):
                            return candidate
        return None

    def _reconstruct_path(
        self,
        came_from: dict[tuple[int, int], tuple[int, int]],
        current: tuple[int, int],
    ) -> list[Position]:
        """Reconstruct the path from came_from map."""
        path = [self._to_world(current)]
        while current in came_from:
            current = came_from[current]
            path.append(self._to_world(current))
        path.reverse()
        return path
