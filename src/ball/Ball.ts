import { nanoid } from 'nanoid';
import type { Ball as BallType, BallVelocity, Position } from '../types/index.js';
import { BallState } from '../types/index.js';

/**
 * Create a new ball at a spawn point
 */
export function createBall(
  spawnPointId: string,
  position: Position,
  alliance: 'red' | 'blue' | null = null
): BallType {
  return {
    id: nanoid(),
    state: BallState.ON_FIELD,
    position: { ...position },
    height: 0,
    velocity: { vx: 0, vy: 0, vz: 0 },
    heldByRobotId: null,
    shotByRobotId: null,
    shotFromPosition: null,
    targetPosition: null,
    spawnPointId,
    alliance,
    lastUpdateTick: 0,
    claimedByRobotId: null,
    claimedAtTick: null,
  };
}

/**
 * Ball entity class for managing ball state
 */
export class Ball {
  data: BallType;

  constructor(data: BallType) {
    this.data = data;
  }

  get id(): string {
    return this.data.id;
  }

  get state(): BallState {
    return this.data.state;
  }

  get position(): Position {
    return this.data.position;
  }

  get height(): number {
    return this.data.height;
  }

  get velocity(): BallVelocity {
    return this.data.velocity;
  }

  /**
   * Check if ball is available for pickup
   */
  isAvailable(): boolean {
    return this.data.state === BallState.ON_FIELD;
  }

  /**
   * Check if ball is in flight
   */
  isInFlight(): boolean {
    return this.data.state === BallState.IN_FLIGHT;
  }

  /**
   * Check if ball is held
   */
  isHeld(): boolean {
    return this.data.state === BallState.HELD;
  }

  /**
   * Check if ball is claimed by a robot
   */
  isClaimed(): boolean {
    return this.data.claimedByRobotId !== null;
  }

  /**
   * Check if ball is claimed by a specific robot
   */
  isClaimedBy(robotId: string): boolean {
    return this.data.claimedByRobotId === robotId;
  }

  /**
   * Get the robot ID that claimed this ball
   */
  getClaimingRobotId(): string | null {
    return this.data.claimedByRobotId;
  }

  /**
   * Claim this ball for pickup (alliance coordination)
   * Returns true if claim was successful
   */
  claim(robotId: string, tick: number): boolean {
    // Can't claim if already claimed by someone else
    if (this.data.claimedByRobotId !== null && this.data.claimedByRobotId !== robotId) {
      return false;
    }
    // Can't claim if not available
    if (!this.isAvailable()) {
      return false;
    }
    this.data.claimedByRobotId = robotId;
    this.data.claimedAtTick = tick;
    return true;
  }

  /**
   * Release claim on this ball
   */
  releaseClaim(robotId?: string): void {
    // If robotId specified, only release if claimed by that robot
    if (robotId && this.data.claimedByRobotId !== robotId) {
      return;
    }
    this.data.claimedByRobotId = null;
    this.data.claimedAtTick = null;
  }

  /**
   * Check if claim has expired (claims expire after 3 seconds / 180 ticks)
   */
  isClaimExpired(currentTick: number, expirationTicks: number = 180): boolean {
    if (this.data.claimedAtTick === null) return true;
    return currentTick - this.data.claimedAtTick > expirationTicks;
  }

  /**
   * Pick up the ball (robot takes possession)
   */
  pickup(robotId: string, tick: number): void {
    this.data.state = BallState.HELD;
    this.data.heldByRobotId = robotId;
    this.data.velocity = { vx: 0, vy: 0, vz: 0 };
    this.data.lastUpdateTick = tick;
    // Clear any claim when ball is picked up
    this.data.claimedByRobotId = null;
    this.data.claimedAtTick = null;
  }

  /**
   * Shoot the ball towards a target
   */
  shoot(
    robotId: string,
    fromPosition: Position,
    targetPosition: Position,
    initialVelocity: BallVelocity,
    tick: number
  ): void {
    this.data.state = BallState.IN_FLIGHT;
    this.data.position = { ...fromPosition };
    this.data.heldByRobotId = null;
    this.data.shotByRobotId = robotId;
    this.data.shotFromPosition = { ...fromPosition };
    this.data.targetPosition = { ...targetPosition };
    this.data.velocity = { ...initialVelocity };
    this.data.lastUpdateTick = tick;
  }

  /**
   * Ball lands on ground (or ramp surface)
   */
  land(position: Position, tick: number, height: number = 0): void {
    this.data.state = BallState.ON_FIELD;
    this.data.position = { ...position };
    this.data.height = Math.max(0, height);
    this.data.shotByRobotId = null;
    this.data.shotFromPosition = null;
    this.data.targetPosition = null;
    this.data.lastUpdateTick = tick;
  }

  /**
   * Ball is scored
   */
  score(tick: number): void {
    this.data.state = BallState.SCORED;
    this.data.velocity = { vx: 0, vy: 0, vz: 0 };
    this.data.lastUpdateTick = tick;
  }

  /**
   * Ball goes out of bounds
   */
  outOfBounds(tick: number): void {
    this.data.state = BallState.OUT_OF_BOUNDS;
    this.data.velocity = { vx: 0, vy: 0, vz: 0 };
    this.data.lastUpdateTick = tick;
  }

  /**
   * Respawn ball at its spawn point
   */
  respawn(position: Position, tick: number): void {
    this.data.state = BallState.ON_FIELD;
    this.data.position = { ...position };
    this.data.height = 0;
    this.data.velocity = { vx: 0, vy: 0, vz: 0 };
    this.data.heldByRobotId = null;
    this.data.shotByRobotId = null;
    this.data.shotFromPosition = null;
    this.data.targetPosition = null;
    this.data.lastUpdateTick = tick;
    this.data.claimedByRobotId = null;
    this.data.claimedAtTick = null;
  }

  /**
   * Respawn ball with specific position, height, and velocity (for scoring zone exits)
   */
  respawnWithVelocity(
    position: Position,
    height: number,
    velocity: BallVelocity,
    tick: number
  ): void {
    this.data.state = BallState.IN_FLIGHT;
    this.data.position = { ...position };
    this.data.height = height;
    this.data.velocity = { ...velocity };
    this.data.heldByRobotId = null;
    this.data.shotByRobotId = null;
    this.data.shotFromPosition = null;
    this.data.targetPosition = null;
    this.data.lastUpdateTick = tick;
    this.data.claimedByRobotId = null;
    this.data.claimedAtTick = null;
  }

  /**
   * Update ball position
   */
  setPosition(position: Position): void {
    this.data.position = { ...position };
  }

  /**
   * Update ball height
   */
  setHeight(height: number): void {
    this.data.height = Math.max(0, height);
  }

  /**
   * Update ball velocity
   */
  setVelocity(velocity: BallVelocity): void {
    this.data.velocity = { ...velocity };
  }

  /**
   * Clone ball data
   */
  cloneData(): BallType {
    return {
      ...this.data,
      position: { ...this.data.position },
      velocity: { ...this.data.velocity },
      shotFromPosition: this.data.shotFromPosition
        ? { ...this.data.shotFromPosition }
        : null,
      targetPosition: this.data.targetPosition
        ? { ...this.data.targetPosition }
        : null,
    };
  }
}
