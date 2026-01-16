import type { GridPosition, Position, RobotState } from '../types/index.js';
import { Vector2D } from '../utils/Vector2D.js';
import { Field } from './Field.js';

/**
 * Options for cost calculation
 */
export interface CostOptions {
  /** Weight for opponent proximity avoidance */
  opponentAvoidanceWeight: number;
  /** Distance at which opponents start affecting cost */
  opponentAvoidanceRadius: number;
  /** Weight for staying near allies */
  allyProximityWeight: number;
  /** Preferred distance from allies */
  allyProximityRadius: number;
  /** Additional cost for diagonal movement */
  diagonalCost: number;
}

/**
 * Default cost options
 */
export const DEFAULT_COST_OPTIONS: CostOptions = {
  opponentAvoidanceWeight: 2.0,
  opponentAvoidanceRadius: 48, // 4 feet
  allyProximityWeight: 0.5,
  allyProximityRadius: 72, // 6 feet
  diagonalCost: Math.SQRT2,
};

/**
 * Calculate the movement cost between two adjacent grid cells
 */
export function calculateMovementCost(
  field: Field,
  from: GridPosition,
  to: GridPosition,
  robotHeight: number,
  options: CostOptions = DEFAULT_COST_OPTIONS
): number {
  // Check if destination is traversable
  const baseCost = field.getTraversalCost(to, robotHeight);
  if (!isFinite(baseCost)) return Infinity;

  // Determine if diagonal movement
  const isDiagonal = from.col !== to.col && from.row !== to.row;
  const movementMultiplier = isDiagonal ? options.diagonalCost : 1.0;

  return baseCost * movementMultiplier;
}

/**
 * Calculate cost with dynamic factors (opponents, allies)
 */
export function calculateDynamicCost(
  _field: Field,
  position: Position,
  robot: RobotState,
  opponents: RobotState[],
  allies: RobotState[],
  options: CostOptions = DEFAULT_COST_OPTIONS
): number {
  let cost = 0;
  const pos = Vector2D.fromPosition(position);

  // Add cost for being near opponents
  for (const opponent of opponents) {
    if (opponent.disabled) continue;

    const distance = pos.distanceTo(opponent.position);
    if (distance < options.opponentAvoidanceRadius) {
      const proximity = 1 - distance / options.opponentAvoidanceRadius;
      cost += proximity * options.opponentAvoidanceWeight;
    }
  }

  // Slight cost reduction for being near allies (encourages grouping)
  for (const ally of allies) {
    if (ally.id === robot.id || ally.disabled) continue;

    const distance = pos.distanceTo(ally.position);
    if (distance < options.allyProximityRadius && distance > 24) {
      // Sweet spot for ally proximity
      const ideal = options.allyProximityRadius / 2;
      const deviation = Math.abs(distance - ideal) / ideal;
      cost -= (1 - deviation) * options.allyProximityWeight;
    }
  }

  return Math.max(0, cost);
}

/**
 * Heuristic function for A* (Euclidean distance)
 */
export function heuristic(from: GridPosition, to: GridPosition): number {
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Heuristic function for A* (Octile distance - better for 8-directional)
 */
export function octileHeuristic(from: GridPosition, to: GridPosition): number {
  const dx = Math.abs(to.col - from.col);
  const dy = Math.abs(to.row - from.row);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}
