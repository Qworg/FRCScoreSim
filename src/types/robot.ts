import type { Position } from './field.js';

/**
 * Robot configuration loaded from markdown
 */
export interface RobotConfig {
  id: string;
  teamNumber: number;
  teamName: string;
  /** Width in inches */
  width: number;
  /** Length in inches */
  length: number;
  /** Height in inches */
  height: number;
  /** Top speed in inches per second */
  topSpeed: number;
  /** Acceleration in inches per second squared */
  acceleration: number;
  /** Turn rate in degrees per second */
  turnRate: number;
  /** Maximum shooting range in inches */
  shootingRange: number;
  /** Shooting accuracy (0.0 to 1.0) */
  shootingAccuracy: number;
  /** Maximum balls robot can hold */
  ballCapacity: number;
  /** Time to pick up a ball in seconds */
  pickupTime: number;
  /** Time to shoot a ball in seconds */
  shootTime: number;
  /** Whether robot can climb */
  canClimb: boolean;
  /** Whether robot can auto-climb (climb during autonomous) */
  autoClimb: boolean;
  /** Maximum climb level (1-3) */
  climbLevel: number;
  /** Time to climb up in seconds */
  climbUpTime: number;
  /** Time to descend from climb in seconds */
  climbDownTime: number;
  /** Whether robot can pass balls to teammates */
  canPass: boolean;
  /** Default strategy identifier */
  defaultStrategy: string;
}

/**
 * Actions a robot can perform
 */
export enum RobotActionType {
  IDLE = 'IDLE',
  MOVING = 'MOVING',
  PICKING_UP = 'PICKING_UP',
  SHOOTING = 'SHOOTING',
  PASSING = 'PASSING',
  CLIMBING = 'CLIMBING',
  DEFENDING = 'DEFENDING',
}

/**
 * Current action state
 */
export interface RobotAction {
  type: RobotActionType;
  /** Target position for movement */
  targetPosition?: Position;
  /** Target ball ID for pickup */
  targetBallId?: string;
  /** Target scoring zone for shooting */
  targetScoringZoneId?: string;
  /** Target robot ID for passing */
  targetRobotId?: string;
  /** Target climb level (1-3) for climbing */
  targetClimbLevel?: number;
  /** Whether this is an auto climb (vs endgame climb) */
  isAutoClimb?: boolean;
  /** Progress of current action (0.0 to 1.0) */
  progress: number;
  /** Time when action started (simulation tick) */
  startedAt: number;
}

/**
 * Current robot state
 */
export interface RobotState {
  id: string;
  config: RobotConfig;
  alliance: 'red' | 'blue';
  position: Position;
  /** Facing direction in degrees (0 = right, 90 = up) */
  heading: number;
  /** Current velocity in inches per second */
  velocity: number;
  /** Balls currently held */
  heldBalls: string[];
  /** Current action being performed */
  currentAction: RobotAction;
  /** Secondary action (pickup while shooting) */
  secondaryAction: RobotAction | null;
  /** Whether robot is disabled */
  disabled: boolean;
  /** Whether robot climbed during auto */
  hasAutoClimbed: boolean;
  /** Whether robot has climbed (endgame) */
  hasClimbed: boolean;
  /** Current climb level achieved (null if not climbed) */
  currentClimbLevel: number | null;
  /** Path being followed (grid positions) */
  currentPath: Position[];
  /** Index in current path */
  pathIndex: number;
}

/**
 * Robot command from strategy
 */
export interface RobotCommand {
  type: RobotActionType;
  targetPosition?: Position;
  targetBallId?: string;
  targetScoringZoneId?: string;
  targetRobotId?: string;
  /** Target climb level (1-3) for climbing */
  targetClimbLevel?: number;
  /** Whether this is an auto climb (vs endgame climb) */
  isAutoClimb?: boolean;
}
