import type { Position } from '../types/index.js';
import { Field } from '../field/Field.js';
import {
  calculateMovementCost,
  CostOptions,
  DEFAULT_COST_OPTIONS,
  octileHeuristic,
} from '../field/CostFunction.js';
import { Vector2D } from '../utils/Vector2D.js';
import {
  createPathNode,
  PathNode,
  positionKey,
  PriorityQueue,
} from './PathNode.js';

/**
 * Pathfinding options
 */
export interface PathfindingOptions {
  /** Maximum iterations before giving up */
  maxIterations: number;
  /** Robot height for traversability checks */
  robotHeight: number;
  /** Cost calculation options */
  costOptions: CostOptions;
  /** Whether to smooth the resulting path */
  smoothPath: boolean;
}

/**
 * Default pathfinding options
 */
export const DEFAULT_PATHFINDING_OPTIONS: PathfindingOptions = {
  maxIterations: 10000,
  robotHeight: 45,
  costOptions: DEFAULT_COST_OPTIONS,
  smoothPath: true,
};

/**
 * Pathfinding result
 */
export interface PathResult {
  /** Found path (empty if no path found) */
  path: Position[];
  /** Whether a path was found */
  found: boolean;
  /** Number of iterations used */
  iterations: number;
  /** Number of nodes explored */
  nodesExplored: number;
}

/**
 * A* pathfinding algorithm
 */
export class AStar {
  private field: Field;
  private options: PathfindingOptions;

  constructor(
    field: Field,
    options: Partial<PathfindingOptions> = {}
  ) {
    this.field = field;
    this.options = { ...DEFAULT_PATHFINDING_OPTIONS, ...options };
  }

  /**
   * Find a path from start to goal positions
   */
  findPath(start: Position, goal: Position): PathResult {
    const startGrid = this.field.positionToGrid(start);
    const goalGrid = this.field.positionToGrid(goal);

    // Quick check: if goal is unreachable, fail fast
    if (!this.field.canRobotTraverse(goalGrid, this.options.robotHeight)) {
      return {
        path: [],
        found: false,
        iterations: 0,
        nodesExplored: 0,
      };
    }

    const openSet = new PriorityQueue();
    const closedSet = new Set<string>();
    const nodeMap = new Map<string, PathNode>();

    const startNode = createPathNode(
      startGrid,
      0,
      octileHeuristic(startGrid, goalGrid)
    );
    openSet.enqueue(startNode);
    nodeMap.set(positionKey(startGrid), startNode);

    let iterations = 0;
    let nodesExplored = 0;

    while (!openSet.isEmpty() && iterations < this.options.maxIterations) {
      iterations++;
      const current = openSet.dequeue()!;
      const currentKey = positionKey(current.position);

      // Check if we've reached the goal
      if (
        current.position.col === goalGrid.col &&
        current.position.row === goalGrid.row
      ) {
        let path = this.reconstructPath(current);
        if (this.options.smoothPath) {
          path = this.smoothPath(path);
        }
        return {
          path,
          found: true,
          iterations,
          nodesExplored,
        };
      }

      closedSet.add(currentKey);
      nodesExplored++;

      // Explore neighbors
      const neighbors = this.field.getNeighbors(current.position);
      for (const neighbor of neighbors) {
        const neighborKey = positionKey(neighbor);

        // Skip if already evaluated
        if (closedSet.has(neighborKey)) continue;

        // Skip if not traversable
        if (!this.field.canRobotTraverse(neighbor, this.options.robotHeight)) {
          continue;
        }

        // Calculate cost
        const movementCost = calculateMovementCost(
          this.field,
          current.position,
          neighbor,
          this.options.robotHeight,
          this.options.costOptions
        );

        if (!isFinite(movementCost)) continue;

        const tentativeGCost = current.gCost + movementCost;

        let neighborNode = nodeMap.get(neighborKey);
        if (!neighborNode) {
          // New node
          neighborNode = createPathNode(
            neighbor,
            tentativeGCost,
            octileHeuristic(neighbor, goalGrid),
            current
          );
          nodeMap.set(neighborKey, neighborNode);
          openSet.enqueue(neighborNode);
        } else if (tentativeGCost < neighborNode.gCost) {
          // Better path found
          neighborNode.gCost = tentativeGCost;
          neighborNode.fCost = tentativeGCost + neighborNode.hCost;
          neighborNode.parent = current;
          openSet.updatePriority(neighborNode);
        }
      }
    }

    // No path found
    return {
      path: [],
      found: false,
      iterations,
      nodesExplored,
    };
  }

  /**
   * Reconstruct path from goal node to start
   */
  private reconstructPath(goalNode: PathNode): Position[] {
    const path: Position[] = [];
    let current: PathNode | null = goalNode;

    while (current) {
      path.unshift(this.field.gridToPosition(current.position));
      current = current.parent;
    }

    return path;
  }

  /**
   * Smooth path by removing unnecessary waypoints
   */
  private smoothPath(path: Position[]): Position[] {
    if (path.length <= 2) return path;

    const smoothed: Position[] = [path[0]];
    let current = 0;

    while (current < path.length - 1) {
      // Find the furthest visible point
      let furthest = current + 1;
      for (let i = path.length - 1; i > current + 1; i--) {
        if (this.hasLineOfSight(path[current], path[i])) {
          furthest = i;
          break;
        }
      }
      smoothed.push(path[furthest]);
      current = furthest;
    }

    return smoothed;
  }

  /**
   * Check if there's a clear line of sight between two positions
   */
  private hasLineOfSight(from: Position, to: Position): boolean {
    const start = Vector2D.fromPosition(from);
    const distance = start.distanceTo(to);
    const steps = Math.ceil(distance / this.field.config.cellSize);

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const pos = start.lerp(to, t).toPosition();
      const gridPos = this.field.positionToGrid(pos);
      if (!this.field.canRobotTraverse(gridPos, this.options.robotHeight)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Update pathfinding options
   */
  setOptions(options: Partial<PathfindingOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

/**
 * Create a pathfinder for the given field
 */
export function createPathfinder(
  field: Field,
  robotHeight: number = 45
): AStar {
  return new AStar(field, { robotHeight });
}
