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
 * Handle wall bouncing for a ball, keeping it fully inside the field
 * Returns the corrected position and velocity after any wall bounces
 */
function handleWallBounce(
  pos: Position,
  vx: number,
  vy: number,
  field: Field,
  radius: number,
  bounceFactor: number = 0.7
): { pos: Position; vx: number; vy: number } {
  const minX = radius;
  const maxX = field.config.width - radius;
  const minY = radius;
  const maxY = field.config.height - radius;

  let newX = pos.x;
  let newY = pos.y;
  let newVx = vx;
  let newVy = vy;

  // Bounce off left wall
  if (newX < minX) {
    newX = minX + (minX - newX);
    newVx = -newVx * bounceFactor;
  }
  // Bounce off right wall
  else if (newX > maxX) {
    newX = maxX - (newX - maxX);
    newVx = -newVx * bounceFactor;
  }

  // Bounce off bottom wall
  if (newY < minY) {
    newY = minY + (minY - newY);
    newVy = -newVy * bounceFactor;
  }
  // Bounce off top wall
  else if (newY > maxY) {
    newY = maxY - (newY - maxY);
    newVy = -newVy * bounceFactor;
  }

  // Clamp to ensure ball stays in bounds after bounce calculation
  newX = Math.max(minX, Math.min(maxX, newX));
  newY = Math.max(minY, Math.min(maxY, newY));

  return { pos: { x: newX, y: newY }, vx: newVx, vy: newVy };
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
  let newVx = velocity.vx * Math.pow(config.airResistance, deltaTime);
  let newVy = velocity.vy * Math.pow(config.airResistance, deltaTime);

  // Update position
  let newPos: Position = {
    x: ball.position.x + newVx * deltaTime,
    y: ball.position.y + newVy * deltaTime,
  };
  const newHeight = ball.height + velocity.vz * deltaTime - 0.5 * config.gravity * deltaTime * deltaTime;

  // Check for ball-blocking zones (scoring areas block balls)
  // Pass the shot origin position so we can check if ball is from proper third
  const blockResult = checkBallBlocking(ball.position, newPos, field, ball.data.shotFromPosition);
  if (blockResult) {
    if (blockResult.shouldBounce) {
      // Ball bounces off the scoring zone wall
      const bounceFactor = 0.6;

      // Reflect velocity based on normal
      if (blockResult.normalX !== 0) {
        newVx = -newVx * bounceFactor;
      }
      if (blockResult.normalY !== 0) {
        newVy = -newVy * bounceFactor;
      }

      // Update position to the blocking point
      newPos = blockResult.position;

      // Continue flight with bounced velocity (don't land)
      ball.setPosition(newPos);
      ball.setVelocity({ vx: newVx, vy: newVy, vz: newVz });

      return result; // Ball continues in flight
    } else {
      // Ball is blocked - stop it at the blocking point and land
      ball.land(blockResult.position, tick);
      ball.setVelocity({ vx: 0, vy: 0, vz: 0 });
      return { ...result, landed: true };
    }
  }

  // Check for scoring
  const scoringCheck = checkScoring(
    ball,
    newPos,
    newHeight,
    field.config.scoringTargets,
    field
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

  // Handle wall bouncing (ball stays in play, bounces off walls)
  const bounceResult = handleWallBounce(newPos, newVx, newVy, field, config.radius, 0.7);
  newPos = bounceResult.pos;
  newVx = bounceResult.vx;
  newVy = bounceResult.vy;

  // Check for ramp collision - balls hitting ramps climb up
  const rampHeight = field.getRampHeightAtPosition(newPos);
  if (rampHeight > 0 && newHeight <= rampHeight) {
    // Ball hits the ramp - it rolls up the ramp surface
    // Apply velocity reduction as ball climbs (energy lost to climbing)
    const climbFactor = 0.7; // Ball loses 30% velocity when hitting ramp
    newVx *= climbFactor;
    newVy *= climbFactor;

    // Ball follows ramp surface (height matches ramp)
    ball.land(newPos, tick, rampHeight);
    ball.setVelocity({
      vx: newVx,
      vy: newVy,
      vz: 0,
    });
    return { ...result, landed: true };
  }

  // Check if ball hit ground (accounting for ramp height)
  const groundHeight = rampHeight;
  if (newHeight <= groundHeight) {
    ball.land(newPos, tick, groundHeight);
    ball.setVelocity({
      vx: newVx * 0.3, // Bounce reduces velocity
      vy: newVy * 0.3,
      vz: 0,
    });
    return { ...result, landed: true };
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
  _tick: number,
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
  let newVx = velocity.vx * friction;
  let newVy = velocity.vy * friction;

  // Update position
  let newPos: Position = {
    x: ball.position.x + newVx * deltaTime,
    y: ball.position.y + newVy * deltaTime,
  };

  // Handle wall bouncing (ball stays in play, bounces off walls)
  const bounceResult = handleWallBounce(newPos, newVx, newVy, field, config.radius, 0.5);
  newPos = bounceResult.pos;
  newVx = bounceResult.vx;
  newVy = bounceResult.vy;

  // Handle ramp physics - ball follows ramp surface
  const currentRampHeight = field.getRampHeightAtPosition(ball.position);
  const newRampHeight = field.getRampHeightAtPosition(newPos);

  // Calculate height change from moving across ramp
  const heightChange = newRampHeight - currentRampHeight;

  if (heightChange > 0) {
    // Ball is climbing the ramp - apply velocity reduction proportional to climb
    // Energy lost to potential energy: KE = 0.5mv² -> PE = mgh
    // v_new = sqrt(v² - 2gh) simplified with gravity factor
    const climbPenalty = Math.sqrt(Math.max(0, 1 - (heightChange * 0.02)));
    newVx *= climbPenalty;
    newVy *= climbPenalty;
  } else if (heightChange < 0) {
    // Ball is rolling down the ramp - gains speed (up to a limit)
    const downhillBoost = Math.min(1.15, 1 + Math.abs(heightChange) * 0.01);
    newVx *= downhillBoost;
    newVy *= downhillBoost;
  }

  ball.setPosition(newPos);
  ball.setHeight(newRampHeight); // Ball follows ramp surface
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
  targets: ScoringTarget[],
  field: Field
): { scored: boolean; targetId: string | null } {
  if (!ball.data.shotByRobotId) {
    return { scored: false, targetId: null };
  }

  // Check if shot originated from a no-score zone
  if (ball.data.shotFromPosition && field.isInNoScoreZone(ball.data.shotFromPosition)) {
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
 * Check if ball path intersects a ball-blocking zone
 * Returns blocking info if blocked, null otherwise
 */
interface BlockingResult {
  /** Position just before blocking zone */
  position: Position;
  /** Whether this is a bounce (vs stop) */
  shouldBounce: boolean;
  /** Approximate normal direction (for bounce calculation) */
  normalX: number;
  normalY: number;
}

function checkBallBlocking(
  fromPos: Position,
  toPos: Position,
  field: Field,
  shotOriginPos: Position | null,
  steps: number = 10
): BlockingResult | null {
  const fieldWidth = field.config.width;
  const leftThirdBoundary = fieldWidth / 3;
  const rightThirdBoundary = (fieldWidth * 2) / 3;

  // Determine if shot is from left or right third (allowed to pass through their side's scoring zone)
  const isFromLeftThird = shotOriginPos ? shotOriginPos.x < leftThirdBoundary : false;
  const isFromRightThird = shotOriginPos ? shotOriginPos.x > rightThirdBoundary : false;
  const shotFromNoScoreZone = shotOriginPos ? field.isInNoScoreZone(shotOriginPos) : false;

  // Check intermediate points along the path
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const checkPos: Position = {
      x: fromPos.x + (toPos.x - fromPos.x) * t,
      y: fromPos.y + (toPos.y - fromPos.y) * t,
    };
    if (field.isInBallBlockingZone(checkPos)) {
      // Check if this blocking zone is on the same side as the shot origin
      const zoneIsOnLeftSide = checkPos.x < fieldWidth / 2;

      // Allow balls from proper third to pass through their side's scoring zone
      const isAllowed = (isFromLeftThird && zoneIsOnLeftSide) ||
                        (isFromRightThird && !zoneIsOnLeftSide);

      if (isAllowed) {
        // Ball is allowed to pass through - continue checking
        continue;
      }

      // Return the last valid position before the blocking zone
      const prevT = (i - 1) / steps;
      const blockPos = {
        x: fromPos.x + (toPos.x - fromPos.x) * prevT,
        y: fromPos.y + (toPos.y - fromPos.y) * prevT,
      };

      // Calculate approximate normal by finding which edge we hit
      const dx = toPos.x - fromPos.x;
      const dy = toPos.y - fromPos.y;
      let normalX = 0;
      let normalY = 0;

      // Check if we're hitting from left/right or top/bottom
      if (Math.abs(dx) > Math.abs(dy)) {
        normalX = dx > 0 ? -1 : 1;
      } else {
        normalY = dy > 0 ? -1 : 1;
      }

      return {
        position: blockPos,
        shouldBounce: shotFromNoScoreZone, // Balls from no-score zone bounce
        normalX,
        normalY,
      };
    }
  }
  return null;
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
