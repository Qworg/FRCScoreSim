import type {
  Cell,
  FieldConfig,
  GridPosition,
  Position,
  ScoringTarget,
  ZoneModifiers,
} from '../types/index.js';
import { ZoneType } from '../types/index.js';
import { Vector2D } from '../utils/Vector2D.js';

/**
 * Field class representing the game field as a grid
 */
export class Field {
  readonly config: FieldConfig;
  readonly cols: number;
  readonly rows: number;
  private readonly grid: Cell[][];

  constructor(config: FieldConfig) {
    this.config = config;
    this.cols = Math.ceil(config.width / config.cellSize);
    this.rows = Math.ceil(config.height / config.cellSize);
    this.grid = this.initializeGrid();
    this.applyZones();
  }

  /**
   * Initialize grid with default NORMAL cells
   */
  private initializeGrid(): Cell[][] {
    const grid: Cell[][] = [];
    for (let row = 0; row < this.rows; row++) {
      const rowCells: Cell[] = [];
      for (let col = 0; col < this.cols; col++) {
        rowCells.push({
          zone: ZoneType.NORMAL,
          modifiers: { speedMultiplier: 1.0 },
          baseCost: 1.0,
        });
      }
      grid.push(rowCells);
    }
    return grid;
  }

  /**
   * Apply zone definitions to the grid
   */
  private applyZones(): void {
    for (const zone of this.config.zones) {
      const minCol = Math.floor(zone.bounds.minX / this.config.cellSize);
      const maxCol = Math.ceil(zone.bounds.maxX / this.config.cellSize);
      const minRow = Math.floor(zone.bounds.minY / this.config.cellSize);
      const maxRow = Math.ceil(zone.bounds.maxY / this.config.cellSize);

      for (let row = minRow; row < maxRow && row < this.rows; row++) {
        for (let col = minCol; col < maxCol && col < this.cols; col++) {
          if (row >= 0 && col >= 0) {
            const cell = this.grid[row][col];
            cell.zone = zone.type;
            cell.modifiers = { ...cell.modifiers, ...zone.modifiers };
            cell.baseCost = this.calculateBaseCost(zone.type, zone.modifiers);
          }
        }
      }
    }
  }

  /**
   * Calculate base traversal cost for a zone type
   */
  private calculateBaseCost(type: ZoneType, modifiers?: ZoneModifiers): number {
    switch (type) {
      case ZoneType.NORMAL:
        return 1.0;
      case ZoneType.RAMP:
        return 1.0 / (modifiers?.speedMultiplier ?? 0.5);
      case ZoneType.TRENCH:
        return 1.1;
      case ZoneType.CLIMBING:
        return 1.5;
      case ZoneType.SCORING_ZONE:
        return 1.0;
      case ZoneType.OBSTACLE:
        return Infinity;
      case ZoneType.OUT_OF_BOUNDS:
        return Infinity;
      default:
        return 1.0;
    }
  }

  /**
   * Convert world position to grid position
   */
  positionToGrid(pos: Position): GridPosition {
    return {
      col: Math.floor(pos.x / this.config.cellSize),
      row: Math.floor(pos.y / this.config.cellSize),
    };
  }

  /**
   * Convert grid position to world position (center of cell)
   */
  gridToPosition(grid: GridPosition): Position {
    return {
      x: (grid.col + 0.5) * this.config.cellSize,
      y: (grid.row + 0.5) * this.config.cellSize,
    };
  }

  /**
   * Check if a grid position is within bounds
   */
  isInBounds(grid: GridPosition): boolean {
    return (
      grid.col >= 0 &&
      grid.col < this.cols &&
      grid.row >= 0 &&
      grid.row < this.rows
    );
  }

  /**
   * Check if a world position is within bounds
   */
  isPositionInBounds(pos: Position): boolean {
    return (
      pos.x >= 0 &&
      pos.x < this.config.width &&
      pos.y >= 0 &&
      pos.y < this.config.height
    );
  }

  /**
   * Get cell at grid position
   */
  getCell(grid: GridPosition): Cell | null {
    if (!this.isInBounds(grid)) return null;
    return this.grid[grid.row][grid.col];
  }

  /**
   * Get cell at world position
   */
  getCellAtPosition(pos: Position): Cell | null {
    return this.getCell(this.positionToGrid(pos));
  }

  /**
   * Get zone type at position
   */
  getZoneType(pos: Position): ZoneType {
    const cell = this.getCellAtPosition(pos);
    return cell?.zone ?? ZoneType.OUT_OF_BOUNDS;
  }

  /**
   * Get zone modifiers at position
   */
  getModifiers(pos: Position): ZoneModifiers {
    const cell = this.getCellAtPosition(pos);
    return cell?.modifiers ?? { speedMultiplier: 0 };
  }

  /**
   * Check if a robot can traverse a cell based on height restrictions
   */
  canRobotTraverse(grid: GridPosition, robotHeight: number): boolean {
    const cell = this.getCell(grid);
    if (!cell) return false;

    // Check for impassable zones
    if (cell.zone === ZoneType.OBSTACLE || cell.zone === ZoneType.OUT_OF_BOUNDS) {
      return false;
    }

    // Check height restrictions (e.g., trench)
    if (cell.modifiers.maxHeight !== undefined) {
      if (robotHeight > cell.modifiers.maxHeight) {
        return false;
      }
    }

    // Check for protected zones
    if (cell.modifiers.protected) {
      return false;
    }

    return true;
  }

  /**
   * Get traversal cost for a robot at a grid position
   */
  getTraversalCost(
    grid: GridPosition,
    robotHeight: number,
    _robotAlliance?: 'red' | 'blue'
  ): number {
    const cell = this.getCell(grid);
    if (!cell) return Infinity;

    if (!this.canRobotTraverse(grid, robotHeight)) {
      return Infinity;
    }

    return cell.baseCost;
  }

  /**
   * Get neighbors of a grid position (8-directional)
   */
  getNeighbors(grid: GridPosition): GridPosition[] {
    const neighbors: GridPosition[] = [];
    const directions = [
      { col: -1, row: -1 },
      { col: 0, row: -1 },
      { col: 1, row: -1 },
      { col: -1, row: 0 },
      { col: 1, row: 0 },
      { col: -1, row: 1 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ];

    for (const dir of directions) {
      const neighbor = {
        col: grid.col + dir.col,
        row: grid.row + dir.row,
      };
      if (this.isInBounds(neighbor)) {
        neighbors.push(neighbor);
      }
    }

    return neighbors;
  }

  /**
   * Get scoring targets for an alliance
   */
  getScoringTargets(alliance: 'red' | 'blue'): ScoringTarget[] {
    return this.config.scoringTargets.filter((t) => t.alliance === alliance);
  }

  /**
   * Find the nearest scoring target to a position
   */
  getNearestScoringTarget(
    pos: Position,
    alliance: 'red' | 'blue'
  ): ScoringTarget | null {
    const targets = this.getScoringTargets(alliance);
    if (targets.length === 0) return null;

    const position = Vector2D.fromPosition(pos);
    let nearest: ScoringTarget | null = null;
    let nearestDist = Infinity;

    for (const target of targets) {
      const dist = position.distanceTo(target.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = target;
      }
    }

    return nearest;
  }

  /**
   * Check if a position is in range of a scoring target
   */
  isInScoringRange(
    pos: Position,
    targetId: string,
    shootingRange: number
  ): boolean {
    const target = this.config.scoringTargets.find((t) => t.id === targetId);
    if (!target) return false;

    const distance = Vector2D.fromPosition(pos).distanceTo(target.position);
    return distance <= shootingRange;
  }

  /**
   * Get starting positions for an alliance
   */
  getStartingPositions(alliance: 'red' | 'blue'): Position[] {
    return this.config.startingPositions[alliance];
  }

  /**
   * Get ball spawn points
   */
  getBallSpawnPoints(): Position[] {
    return this.config.ballSpawnPoints.map((sp) => sp.position);
  }

  /**
   * Check if a position is within or near a climbing zone for the specified alliance
   */
  isNearClimbingZone(pos: Position, alliance: 'red' | 'blue', proximityThreshold: number = 36): boolean {
    // Find climbing zones for this alliance
    for (const zone of this.config.zones) {
      if (zone.type !== ZoneType.CLIMBING) continue;

      // Check if this is the alliance's climbing zone
      // Red climbing zone is on the left (low X), Blue is on the right (high X)
      const isRedZone = zone.bounds.minX < this.config.width / 2;
      const isAllianceZone = (alliance === 'red' && isRedZone) || (alliance === 'blue' && !isRedZone);

      if (!isAllianceZone) continue;

      // Check if position is within the zone or within proximity threshold
      const inZoneX = pos.x >= zone.bounds.minX && pos.x <= zone.bounds.maxX;
      const inZoneY = pos.y >= zone.bounds.minY && pos.y <= zone.bounds.maxY;

      if (inZoneX && inZoneY) return true;

      // Check proximity to zone bounds
      const distToZone = this.distanceToZone(pos, zone.bounds);
      if (distToZone <= proximityThreshold) return true;
    }

    return false;
  }

  /**
   * Calculate minimum distance from a position to a zone's bounds
   */
  private distanceToZone(pos: Position, bounds: { minX: number; maxX: number; minY: number; maxY: number }): number {
    const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, pos.x));
    const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, pos.y));
    const dx = pos.x - clampedX;
    const dy = pos.y - clampedY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
