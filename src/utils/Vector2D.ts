import type { Position } from '../types/index.js';

/**
 * 2D vector utility class for mathematical operations
 */
export class Vector2D implements Position {
  constructor(
    public x: number,
    public y: number
  ) {}

  /**
   * Create a Vector2D from a Position object
   */
  static fromPosition(pos: Position): Vector2D {
    return new Vector2D(pos.x, pos.y);
  }

  /**
   * Create a zero vector
   */
  static zero(): Vector2D {
    return new Vector2D(0, 0);
  }

  /**
   * Create a unit vector from an angle in degrees
   */
  static fromAngle(degrees: number): Vector2D {
    const radians = (degrees * Math.PI) / 180;
    return new Vector2D(Math.cos(radians), Math.sin(radians));
  }

  /**
   * Create a vector from polar coordinates
   */
  static fromPolar(magnitude: number, degrees: number): Vector2D {
    const radians = (degrees * Math.PI) / 180;
    return new Vector2D(
      magnitude * Math.cos(radians),
      magnitude * Math.sin(radians)
    );
  }

  /**
   * Clone this vector
   */
  clone(): Vector2D {
    return new Vector2D(this.x, this.y);
  }

  /**
   * Get the magnitude (length) of this vector
   */
  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Get the squared magnitude (avoids sqrt for comparisons)
   */
  magnitudeSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  /**
   * Get the angle of this vector in degrees (0 = right, 90 = up)
   */
  angle(): number {
    return (Math.atan2(this.y, this.x) * 180) / Math.PI;
  }

  /**
   * Normalize this vector (make it unit length)
   */
  normalize(): Vector2D {
    const mag = this.magnitude();
    if (mag === 0) return Vector2D.zero();
    return new Vector2D(this.x / mag, this.y / mag);
  }

  /**
   * Add another vector
   */
  add(other: Position): Vector2D {
    return new Vector2D(this.x + other.x, this.y + other.y);
  }

  /**
   * Subtract another vector
   */
  subtract(other: Position): Vector2D {
    return new Vector2D(this.x - other.x, this.y - other.y);
  }

  /**
   * Multiply by a scalar
   */
  multiply(scalar: number): Vector2D {
    return new Vector2D(this.x * scalar, this.y * scalar);
  }

  /**
   * Divide by a scalar
   */
  divide(scalar: number): Vector2D {
    if (scalar === 0) return Vector2D.zero();
    return new Vector2D(this.x / scalar, this.y / scalar);
  }

  /**
   * Dot product with another vector
   */
  dot(other: Position): number {
    return this.x * other.x + this.y * other.y;
  }

  /**
   * Cross product (returns scalar z-component)
   */
  cross(other: Position): number {
    return this.x * other.y - this.y * other.x;
  }

  /**
   * Distance to another point
   */
  distanceTo(other: Position): number {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Squared distance to another point (avoids sqrt)
   */
  distanceSquaredTo(other: Position): number {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    return dx * dx + dy * dy;
  }

  /**
   * Angle to another point in degrees
   */
  angleTo(other: Position): number {
    return (Math.atan2(other.y - this.y, other.x - this.x) * 180) / Math.PI;
  }

  /**
   * Linear interpolation to another point
   */
  lerp(other: Position, t: number): Vector2D {
    return new Vector2D(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t
    );
  }

  /**
   * Rotate this vector by an angle in degrees
   */
  rotate(degrees: number): Vector2D {
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new Vector2D(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  /**
   * Get a perpendicular vector (rotated 90 degrees counterclockwise)
   */
  perpendicular(): Vector2D {
    return new Vector2D(-this.y, this.x);
  }

  /**
   * Limit the magnitude of this vector
   */
  limit(maxMagnitude: number): Vector2D {
    const mag = this.magnitude();
    if (mag <= maxMagnitude) return this.clone();
    return this.normalize().multiply(maxMagnitude);
  }

  /**
   * Set the magnitude of this vector
   */
  setMagnitude(magnitude: number): Vector2D {
    return this.normalize().multiply(magnitude);
  }

  /**
   * Check if this vector equals another (within epsilon)
   */
  equals(other: Position, epsilon: number = 0.0001): boolean {
    return (
      Math.abs(this.x - other.x) < epsilon &&
      Math.abs(this.y - other.y) < epsilon
    );
  }

  /**
   * Convert to plain Position object
   */
  toPosition(): Position {
    return { x: this.x, y: this.y };
  }

  /**
   * String representation
   */
  toString(): string {
    return `Vector2D(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
  }
}

/**
 * Calculate the shortest angle difference between two angles
 * Result is in range [-180, 180]
 */
export function angleDifference(from: number, to: number): number {
  let diff = ((to - from + 180) % 360) - 180;
  if (diff < -180) diff += 360;
  return diff;
}

/**
 * Normalize an angle to [0, 360) range
 */
export function normalizeAngle(degrees: number): number {
  const result = degrees % 360;
  return result < 0 ? result + 360 : result;
}

/**
 * Convert degrees to radians
 */
export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
