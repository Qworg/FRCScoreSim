import type { Position } from '../types/index.js';
import { Field } from '../field/Field.js';
import { angleDifference, clamp, Vector2D } from '../utils/Vector2D.js';
import { Robot } from './Robot.js';

/**
 * Movement result after a tick update
 */
export interface MovementResult {
  /** New position */
  position: Position;
  /** New heading in degrees */
  heading: number;
  /** New velocity in inches per second */
  velocity: number;
  /** Whether target was reached */
  reachedTarget: boolean;
  /** Whether movement was blocked */
  blocked: boolean;
}

/**
 * Calculate movement physics for one tick
 */
export function updateRobotMovement(
  robot: Robot,
  targetPosition: Position | null,
  field: Field,
  deltaTime: number
): MovementResult {
  if (robot.isDisabled || robot.hasClimbed) {
    return {
      position: robot.position,
      heading: robot.heading,
      velocity: 0,
      reachedTarget: false,
      blocked: false,
    };
  }

  // If no target, decelerate to stop
  if (!targetPosition) {
    return decelerateToStop(robot, deltaTime);
  }

  const currentPos = Vector2D.fromPosition(robot.position);
  const targetPos = Vector2D.fromPosition(targetPosition);
  const distanceToTarget = currentPos.distanceTo(targetPos);

  // Check if already at target
  const arrivalThreshold = 2; // 2 inches
  if (distanceToTarget < arrivalThreshold) {
    return {
      position: robot.position,
      heading: robot.heading,
      velocity: 0,
      reachedTarget: true,
      blocked: false,
    };
  }

  // Get terrain modifiers at current position
  const modifiers = field.getModifiers(robot.position);
  const speedMultiplier = modifiers.speedMultiplier ?? 1.0;

  // Calculate desired heading
  const desiredHeading = currentPos.angleTo(targetPos);

  // Turn towards target
  const newHeading = turnTowards(
    robot.heading,
    desiredHeading,
    robot.config.turnRate,
    deltaTime
  );

  // Calculate forward/backward movement based on heading alignment
  const headingError = Math.abs(angleDifference(newHeading, desiredHeading));
  const forwardFactor = headingError < 90 ? Math.cos((headingError * Math.PI) / 180) : 0;

  // Calculate velocity
  let newVelocity = robot.velocity;
  const effectiveTopSpeed = robot.config.topSpeed * speedMultiplier;

  if (forwardFactor > 0.1) {
    // Accelerate
    const acceleration = robot.config.acceleration * speedMultiplier;
    newVelocity = Math.min(
      effectiveTopSpeed,
      newVelocity + acceleration * deltaTime
    );
  } else {
    // Decelerate when turning sharply
    const deceleration = robot.config.acceleration * 2;
    newVelocity = Math.max(0, newVelocity - deceleration * deltaTime);
  }

  // Slow down when approaching target
  const stoppingDistance = calculateStoppingDistance(
    newVelocity,
    robot.config.acceleration
  );
  if (distanceToTarget < stoppingDistance * 1.5) {
    const decel = robot.config.acceleration * 1.5;
    newVelocity = Math.max(10, newVelocity - decel * deltaTime);
  }

  // Calculate displacement
  const displacement = newVelocity * forwardFactor * deltaTime;
  const direction = Vector2D.fromAngle(newHeading);
  let newPos = currentPos.add(direction.multiply(displacement));

  // Clamp to target if overshooting
  if (newPos.distanceTo(targetPos) > distanceToTarget) {
    newPos = targetPos;
  }

  // Check field bounds
  const bounded = clampToField(newPos.toPosition(), field, robot.config.width);

  // Check for collisions/blocked movement
  const gridPos = field.positionToGrid(bounded);
  const canTraverse = field.canRobotTraverse(gridPos, robot.config.height);

  if (!canTraverse) {
    return {
      position: robot.position,
      heading: newHeading,
      velocity: 0,
      reachedTarget: false,
      blocked: true,
    };
  }

  return {
    position: bounded,
    heading: newHeading,
    velocity: newVelocity,
    reachedTarget: Vector2D.fromPosition(bounded).distanceTo(targetPos) < arrivalThreshold,
    blocked: false,
  };
}

/**
 * Turn towards a target heading
 */
function turnTowards(
  currentHeading: number,
  targetHeading: number,
  turnRate: number,
  deltaTime: number
): number {
  const diff = angleDifference(currentHeading, targetHeading);
  const maxTurn = turnRate * deltaTime;

  if (Math.abs(diff) <= maxTurn) {
    return targetHeading;
  }

  return currentHeading + Math.sign(diff) * maxTurn;
}

/**
 * Calculate stopping distance at current velocity
 */
function calculateStoppingDistance(
  velocity: number,
  deceleration: number
): number {
  // v^2 = 2 * a * d => d = v^2 / (2 * a)
  return (velocity * velocity) / (2 * deceleration);
}

/**
 * Decelerate robot to a stop
 */
function decelerateToStop(robot: Robot, deltaTime: number): MovementResult {
  const deceleration = robot.config.acceleration;
  const newVelocity = Math.max(0, robot.velocity - deceleration * deltaTime);

  // Continue moving in current direction while decelerating
  if (newVelocity > 0) {
    const direction = Vector2D.fromAngle(robot.heading);
    const displacement = newVelocity * deltaTime;
    const newPos = Vector2D.fromPosition(robot.position)
      .add(direction.multiply(displacement))
      .toPosition();

    return {
      position: newPos,
      heading: robot.heading,
      velocity: newVelocity,
      reachedTarget: false,
      blocked: false,
    };
  }

  return {
    position: robot.position,
    heading: robot.heading,
    velocity: 0,
    reachedTarget: false,
    blocked: false,
  };
}

/**
 * Clamp position to field bounds with robot size consideration
 */
function clampToField(
  pos: Position,
  field: Field,
  robotWidth: number
): Position {
  const margin = robotWidth / 2;
  return {
    x: clamp(pos.x, margin, field.config.width - margin),
    y: clamp(pos.y, margin, field.config.height - margin),
  };
}

/**
 * Check if two robots are colliding
 */
export function areRobotsColliding(
  robot1: Robot,
  robot2: Robot,
  padding: number = 0
): boolean {
  const distance = robot1.distanceTo(robot2.position);
  const minDistance =
    (robot1.config.width + robot2.config.width) / 2 + padding;
  return distance < minDistance;
}

/**
 * Separate colliding robots
 */
export function separateRobots(
  robot1: Robot,
  robot2: Robot
): { pos1: Position; pos2: Position } {
  const pos1 = Vector2D.fromPosition(robot1.position);
  const pos2 = Vector2D.fromPosition(robot2.position);

  const minDistance = (robot1.config.width + robot2.config.width) / 2 + 2;
  const direction = pos2.subtract(pos1).normalize();

  if (direction.magnitude() === 0) {
    // Robots at exact same position, push apart arbitrarily
    return {
      pos1: pos1.subtract(new Vector2D(minDistance / 2, 0)).toPosition(),
      pos2: pos2.add(new Vector2D(minDistance / 2, 0)).toPosition(),
    };
  }

  const currentDistance = pos1.distanceTo(pos2);
  const overlap = minDistance - currentDistance;

  if (overlap <= 0) {
    return { pos1: robot1.position, pos2: robot2.position };
  }

  const halfOverlap = overlap / 2;

  return {
    pos1: pos1.subtract(direction.multiply(halfOverlap)).toPosition(),
    pos2: pos2.add(direction.multiply(halfOverlap)).toPosition(),
  };
}
