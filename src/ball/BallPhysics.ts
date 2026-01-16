import type {
  BallPhysicsConfig,
  BallVelocity,
  Position,
  ScoringTarget,
} from '../types/index.js';
import { BallState, DEFAULT_SIMULATION_CONFIG } from '../types/index.js';
import { Field } from '../field/Field.js';
import { Vector2D } from '../utils/Vector2D.js';
import { Ball } from './Ball.js';

/**
 * Default ball physics configuration
 */
export const DEFAULT_BALL_PHYSICS: BallPhysicsConfig =
  DEFAULT_SIMULATION_CONFIG.ballPhysics;

/**
 * Result of updating ball physics
 */
export interface BallUpdateResult {
  /** Whether ball scored */
  scored: boolean;
  /** Scoring target ID if scored */
  scoringTargetId: string | null;
  /** Whether ball went out of bounds */
  outOfBounds: boolean;
  /** Whether ball landed on ground */
  landed: boolean;
}

/**
 * Update ball physics for one tick
 */
export function updateBallPhysics(
  ball: Ball,
  field: Field,
  deltaTime: number,
  tick: number,
  physicsConfig: BallPhysicsConfig = DEFAULT_BALL_PHYSICS
): BallUpdateResult {
  const result: BallUpdateResult = {
    scored: false,
    scoringTargetId: null,
    outOfBounds: false,
    landed: false,
  };

  if (ball.state === BallState.HELD || ball.state === BallState.SCORED) {
    return result;
  }

  if (ball.state === BallState.IN_FLIGHT) {
    return updateFlightPhysics(ball, field, deltaTime, tick, physicsConfig);
  }

  if (ball.state === BallState.ON_FIELD) {
    return updateGroundPhysics(ball, field, deltaTime, tick, physicsConfig);
  }

  return result;
}

/**
 * Update physics for a ball in flight
 */
function updateFlightPhysics(
  ball: Ball,
  field: Field,
  deltaTime: number,
  tick: number,
  config: BallPhysicsConfig
): BallUpdateResult {
  const result: BallUpdateResult = {
    scored: false,
    scoringTargetId: null,
    outOfBounds: false,
    landed: false,
  };

  const velocity = ball.velocity;

  // Apply gravity to vertical velocity
  const newVz = velocity.vz - config.gravity * deltaTime;

  // Apply air resistance
  const newVx = velocity.vx * Math.pow(config.airResistance, deltaTime);
  const newVy = velocity.vy * Math.pow(config.airResistance, deltaTime);

  // Update position
  const newPos: Position = {
    x: ball.position.x + newVx * deltaTime,
    y: ball.position.y + newVy * deltaTime,
  };
  const newHeight = ball.height + velocity.vz * deltaTime - 0.5 * config.gravity * deltaTime * deltaTime;

  // Check for scoring
  const scoringCheck = checkScoring(
    ball,
    newPos,
    newHeight,
    field.config.scoringTargets
  );
  if (scoringCheck.scored) {
    ball.score(tick);
    return {
      scored: true,
      scoringTargetId: scoringCheck.targetId,
      outOfBounds: false,
      landed: false,
    };
  }

  // Check if ball hit ground
  if (newHeight <= 0) {
    ball.land(newPos, tick);
    ball.setVelocity({
      vx: newVx * 0.3, // Bounce reduces velocity
      vy: newVy * 0.3,
      vz: 0,
    });
    return { ...result, landed: true };
  }

  // Check for out of bounds
  if (!field.isPositionInBounds(newPos)) {
    ball.outOfBounds(tick);
    return { ...result, outOfBounds: true };
  }

  // Update ball state
  ball.setPosition(newPos);
  ball.setHeight(newHeight);
  ball.setVelocity({ vx: newVx, vy: newVy, vz: newVz });

  return result;
}

/**
 * Update physics for a ball on the ground
 */
function updateGroundPhysics(
  ball: Ball,
  field: Field,
  deltaTime: number,
  tick: number,
  config: BallPhysicsConfig
): BallUpdateResult {
  const result: BallUpdateResult = {
    scored: false,
    scoringTargetId: null,
    outOfBounds: false,
    landed: false,
  };

  const velocity = ball.velocity;
  const speed = Math.sqrt(velocity.vx * velocity.vx + velocity.vy * velocity.vy);

  // Ball has stopped
  if (speed < config.minVelocity) {
    ball.setVelocity({ vx: 0, vy: 0, vz: 0 });
    return result;
  }

  // Apply ground friction
  const friction = Math.pow(config.groundFriction, deltaTime);
  const newVx = velocity.vx * friction;
  const newVy = velocity.vy * friction;

  // Update position
  const newPos: Position = {
    x: ball.position.x + newVx * deltaTime,
    y: ball.position.y + newVy * deltaTime,
  };

  // Check for out of bounds
  if (!field.isPositionInBounds(newPos)) {
    ball.outOfBounds(tick);
    return { ...result, outOfBounds: true };
  }

  ball.setPosition(newPos);
  ball.setVelocity({ vx: newVx, vy: newVy, vz: 0 });

  return result;
}

/**
 * Check if ball scores at any target
 */
function checkScoring(
  ball: Ball,
  position: Position,
  height: number,
  targets: ScoringTarget[]
): { scored: boolean; targetId: string | null } {
  if (!ball.data.shotByRobotId) {
    return { scored: false, targetId: null };
  }

  for (const target of targets) {
    const distance = Vector2D.fromPosition(position).distanceTo(target.position);

    // Check if within target radius
    if (distance > target.radius) continue;

    // Check height requirements
    if (target.minHeight !== undefined && height < target.minHeight) continue;
    if (target.maxHeight !== undefined && height > target.maxHeight) continue;

    return { scored: true, targetId: target.id };
  }

  return { scored: false, targetId: null };
}

/**
 * Calculate initial velocity for a shot
 */
export function calculateShotVelocity(
  fromPosition: Position,
  targetPosition: Position,
  targetHeight: number,
  shotSpeed: number = 300, // inches per second
  gravity: number = DEFAULT_BALL_PHYSICS.gravity
): BallVelocity {
  const from = Vector2D.fromPosition(fromPosition);
  const to = Vector2D.fromPosition(targetPosition);
  const distance = from.distanceTo(targetPosition);

  // Direction vector
  const direction = to.subtract(from).normalize();

  // Calculate horizontal and vertical components
  // Using simplified projectile motion
  const horizontalSpeed = shotSpeed * 0.8;
  const timeToTarget = distance / horizontalSpeed;

  // Calculate required vertical velocity to reach target height
  // Using: h = vz*t - 0.5*g*t^2
  // Solving for vz: vz = (h + 0.5*g*t^2) / t
  const vz = (targetHeight + 0.5 * gravity * timeToTarget * timeToTarget) / timeToTarget;

  return {
    vx: direction.x * horizontalSpeed,
    vy: direction.y * horizontalSpeed,
    vz: Math.min(vz, shotSpeed), // Cap vertical velocity
  };
}

/**
 * Calculate pass velocity between robots
 */
export function calculatePassVelocity(
  fromPosition: Position,
  toPosition: Position,
  passSpeed: number = 200
): BallVelocity {
  const from = Vector2D.fromPosition(fromPosition);
  const to = Vector2D.fromPosition(toPosition);
  const direction = to.subtract(from).normalize();

  return {
    vx: direction.x * passSpeed,
    vy: direction.y * passSpeed,
    vz: 50, // Low arc pass
  };
}

/**
 * Check if a position is within pickup range of a ball
 */
export function isInPickupRange(
  robotPosition: Position,
  ballPosition: Position,
  pickupRange: number = 18 // inches
): boolean {
  return (
    Vector2D.fromPosition(robotPosition).distanceTo(ballPosition) <= pickupRange
  );
}
