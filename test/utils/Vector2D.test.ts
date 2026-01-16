import { describe, expect, it } from 'vitest';
import {
  Vector2D,
  angleDifference,
  normalizeAngle,
  clamp,
} from '../../src/utils/Vector2D.js';

describe('Vector2D', () => {
  describe('constructor', () => {
    it('should create a vector with x and y', () => {
      const v = new Vector2D(3, 4);
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
    });
  });

  describe('static methods', () => {
    it('should create zero vector', () => {
      const v = Vector2D.zero();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
    });

    it('should create from position', () => {
      const v = Vector2D.fromPosition({ x: 5, y: 10 });
      expect(v.x).toBe(5);
      expect(v.y).toBe(10);
    });

    it('should create from angle', () => {
      const v = Vector2D.fromAngle(0);
      expect(v.x).toBeCloseTo(1);
      expect(v.y).toBeCloseTo(0);

      const v90 = Vector2D.fromAngle(90);
      expect(v90.x).toBeCloseTo(0);
      expect(v90.y).toBeCloseTo(1);
    });

    it('should create from polar', () => {
      const v = Vector2D.fromPolar(5, 0);
      expect(v.x).toBeCloseTo(5);
      expect(v.y).toBeCloseTo(0);

      const v45 = Vector2D.fromPolar(Math.SQRT2, 45);
      expect(v45.x).toBeCloseTo(1);
      expect(v45.y).toBeCloseTo(1);
    });
  });

  describe('magnitude', () => {
    it('should calculate magnitude correctly', () => {
      const v = new Vector2D(3, 4);
      expect(v.magnitude()).toBe(5);
    });

    it('should return 0 for zero vector', () => {
      const v = Vector2D.zero();
      expect(v.magnitude()).toBe(0);
    });
  });

  describe('angle', () => {
    it('should return angle in degrees', () => {
      const right = new Vector2D(1, 0);
      expect(right.angle()).toBeCloseTo(0);

      const up = new Vector2D(0, 1);
      expect(up.angle()).toBeCloseTo(90);

      const left = new Vector2D(-1, 0);
      expect(left.angle()).toBeCloseTo(180);
    });
  });

  describe('normalize', () => {
    it('should normalize to unit length', () => {
      const v = new Vector2D(3, 4);
      const n = v.normalize();
      expect(n.magnitude()).toBeCloseTo(1);
      expect(n.x).toBeCloseTo(0.6);
      expect(n.y).toBeCloseTo(0.8);
    });

    it('should return zero for zero vector', () => {
      const v = Vector2D.zero();
      const n = v.normalize();
      expect(n.x).toBe(0);
      expect(n.y).toBe(0);
    });
  });

  describe('arithmetic operations', () => {
    it('should add vectors', () => {
      const a = new Vector2D(1, 2);
      const b = new Vector2D(3, 4);
      const result = a.add(b);
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
    });

    it('should subtract vectors', () => {
      const a = new Vector2D(5, 7);
      const b = new Vector2D(2, 3);
      const result = a.subtract(b);
      expect(result.x).toBe(3);
      expect(result.y).toBe(4);
    });

    it('should multiply by scalar', () => {
      const v = new Vector2D(2, 3);
      const result = v.multiply(3);
      expect(result.x).toBe(6);
      expect(result.y).toBe(9);
    });

    it('should divide by scalar', () => {
      const v = new Vector2D(6, 9);
      const result = v.divide(3);
      expect(result.x).toBe(2);
      expect(result.y).toBe(3);
    });
  });

  describe('dot product', () => {
    it('should calculate dot product', () => {
      const a = new Vector2D(1, 2);
      const b = new Vector2D(3, 4);
      expect(a.dot(b)).toBe(11); // 1*3 + 2*4
    });

    it('should return 0 for perpendicular vectors', () => {
      const a = new Vector2D(1, 0);
      const b = new Vector2D(0, 1);
      expect(a.dot(b)).toBe(0);
    });
  });

  describe('distance', () => {
    it('should calculate distance between points', () => {
      const a = new Vector2D(0, 0);
      const b = { x: 3, y: 4 };
      expect(a.distanceTo(b)).toBe(5);
    });
  });

  describe('lerp', () => {
    it('should interpolate between points', () => {
      const a = new Vector2D(0, 0);
      const b = { x: 10, y: 10 };

      const mid = a.lerp(b, 0.5);
      expect(mid.x).toBe(5);
      expect(mid.y).toBe(5);

      const start = a.lerp(b, 0);
      expect(start.x).toBe(0);
      expect(start.y).toBe(0);

      const end = a.lerp(b, 1);
      expect(end.x).toBe(10);
      expect(end.y).toBe(10);
    });
  });

  describe('rotate', () => {
    it('should rotate by angle', () => {
      const v = new Vector2D(1, 0);
      const rotated = v.rotate(90);
      expect(rotated.x).toBeCloseTo(0);
      expect(rotated.y).toBeCloseTo(1);
    });
  });

  describe('limit', () => {
    it('should limit magnitude', () => {
      const v = new Vector2D(30, 40); // magnitude 50
      const limited = v.limit(25);
      expect(limited.magnitude()).toBeCloseTo(25);
    });

    it('should not change if under limit', () => {
      const v = new Vector2D(3, 4); // magnitude 5
      const limited = v.limit(10);
      expect(limited.x).toBe(3);
      expect(limited.y).toBe(4);
    });
  });

  describe('equals', () => {
    it('should detect equal vectors', () => {
      const a = new Vector2D(1, 2);
      const b = new Vector2D(1, 2);
      expect(a.equals(b)).toBe(true);
    });

    it('should detect unequal vectors', () => {
      const a = new Vector2D(1, 2);
      const b = new Vector2D(1, 3);
      expect(a.equals(b)).toBe(false);
    });
  });
});

describe('angleDifference', () => {
  it('should calculate shortest angle difference', () => {
    expect(angleDifference(0, 90)).toBeCloseTo(90);
    expect(angleDifference(0, -90)).toBeCloseTo(-90);
    expect(angleDifference(350, 10)).toBeCloseTo(20);
    expect(angleDifference(10, 350)).toBeCloseTo(-20);
  });
});

describe('normalizeAngle', () => {
  it('should normalize angle to 0-360', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-90)).toBe(270);
  });
});

describe('clamp', () => {
  it('should clamp values to range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
