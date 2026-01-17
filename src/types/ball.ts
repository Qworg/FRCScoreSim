import type { Position } from './field.js';

/**
 * Ball state enum
 */
export enum BallState {
  /** Ball is on the field and can be picked up */
  ON_FIELD = 'ON_FIELD',
  /** Ball is held by a robot */
  HELD = 'HELD',
  /** Ball is in flight (shot or passed) */
  IN_FLIGHT = 'IN_FLIGHT',
  /** Ball has been scored and is awaiting respawn */
  SCORED = 'SCORED',
  /** Ball is out of bounds and awaiting respawn */
  OUT_OF_BOUNDS = 'OUT_OF_BOUNDS',
}

/**
 * Ball velocity vector
 */
export interface BallVelocity {
  /** Horizontal velocity in x direction (in/s) */
  vx: number;
  /** Horizontal velocity in y direction (in/s) */
  vy: number;
  /** Vertical velocity (in/s) - for flight trajectory */
  vz: number;
}

/**
 * Ball entity
 */
export interface Ball {
  id: string;
  state: BallState;
  position: Position;
  /** Height above ground (inches) */
  height: number;
  velocity: BallVelocity;
  /** ID of robot holding this ball (if HELD state) */
  heldByRobotId: string | null;
  /** ID of robot that shot/passed this ball (if IN_FLIGHT state) */
  shotByRobotId: string | null;
  /** Position from which the ball was shot (for no-score zone validation) */
  shotFromPosition: Position | null;
  /** Target position for in-flight balls */
  targetPosition: Position | null;
  /** Original spawn point ID for respawning */
  spawnPointId: string;
  /** Alliance ownership (if any) */
  alliance: 'red' | 'blue' | null;
  /** Tick when ball was last updated */
  lastUpdateTick: number;
  /** ID of robot that has claimed this ball for pickup (alliance coordination) */
  claimedByRobotId: string | null;
  /** Tick when ball was claimed (for expiration) */
  claimedAtTick: number | null;
}

/**
 * Ball physics configuration
 */
export interface BallPhysicsConfig {
  /** Ball radius in inches */
  radius: number;
  /** Ground friction coefficient (velocity multiplier per second) */
  groundFriction: number;
  /** Air resistance coefficient */
  airResistance: number;
  /** Gravity in inches per second squared */
  gravity: number;
  /** Minimum velocity before ball stops */
  minVelocity: number;
  /** Respawn delay in ticks after scoring */
  respawnDelay: number;
}
