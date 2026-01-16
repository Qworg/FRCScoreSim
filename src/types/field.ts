/**
 * 2D position in world coordinates (inches)
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Grid position (cell indices)
 */
export interface GridPosition {
  col: number;
  row: number;
}

/**
 * Types of zones on the field
 */
export enum ZoneType {
  NORMAL = 'NORMAL',
  CLIMBING = 'CLIMBING',
  RAMP = 'RAMP',
  TRENCH = 'TRENCH',
  SCORING_ZONE = 'SCORING_ZONE',
  OBSTACLE = 'OBSTACLE',
  OUT_OF_BOUNDS = 'OUT_OF_BOUNDS',
}

/**
 * Zone modifiers that affect robot behavior
 */
export interface ZoneModifiers {
  /** Speed multiplier (1.0 = normal, 0.5 = half speed) */
  speedMultiplier?: number;
  /** Maximum robot height allowed in this zone (inches) */
  maxHeight?: number;
  /** Whether robots can climb in this zone */
  climbable?: boolean;
  /** Whether this is a protected zone (robots can't enter) */
  protected?: boolean;
  /** Alliance that owns this zone ('red' | 'blue' | null) */
  alliance?: 'red' | 'blue' | null;
}

/**
 * A single cell in the field grid
 */
export interface Cell {
  zone: ZoneType;
  modifiers: ZoneModifiers;
  baseCost: number;
}

/**
 * Zone definition for field configuration
 */
export interface ZoneDefinition {
  name: string;
  type: ZoneType;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  modifiers?: ZoneModifiers;
}

/**
 * Ball spawn point configuration
 */
export interface BallSpawnPoint {
  id: string;
  position: Position;
  alliance?: 'red' | 'blue' | null;
}

/**
 * Scoring target configuration
 */
export interface ScoringTarget {
  id: string;
  name: string;
  position: Position;
  radius: number;
  minHeight?: number;
  maxHeight?: number;
  alliance: 'red' | 'blue';
  points: {
    auto: number;
    teleop: number;
  };
}

/**
 * Complete field configuration
 */
export interface FieldConfig {
  name: string;
  year: number;
  /** Field width in inches */
  width: number;
  /** Field height in inches */
  height: number;
  /** Cell resolution in inches (typically 1) */
  cellSize: number;
  zones: ZoneDefinition[];
  ballSpawnPoints: BallSpawnPoint[];
  scoringTargets: ScoringTarget[];
  /** Robot starting positions */
  startingPositions: {
    red: Position[];
    blue: Position[];
  };
}
