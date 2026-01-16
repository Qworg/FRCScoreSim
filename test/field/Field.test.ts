import { describe, expect, it } from 'vitest';
import { Field } from '../../src/field/Field.js';
import { ZoneType } from '../../src/types/index.js';
import type { FieldConfig } from '../../src/types/index.js';

function createTestFieldConfig(): FieldConfig {
  return {
    name: 'Test Field',
    year: 2024,
    width: 648,
    height: 324,
    cellSize: 1,
    zones: [
      {
        name: 'Red Scoring Zone',
        type: ZoneType.SCORING_ZONE,
        bounds: { minX: 0, maxX: 50, minY: 0, maxY: 50 },
        modifiers: { alliance: 'red' },
      },
      {
        name: 'Trench',
        type: ZoneType.TRENCH,
        bounds: { minX: 200, maxX: 250, minY: 100, maxY: 200 },
        modifiers: { maxHeight: 24 },
      },
      {
        name: 'Ramp',
        type: ZoneType.RAMP,
        bounds: { minX: 300, maxX: 350, minY: 150, maxY: 200 },
        modifiers: { speedMultiplier: 0.5 },
      },
      {
        name: 'Obstacle',
        type: ZoneType.OBSTACLE,
        bounds: { minX: 400, maxX: 420, minY: 160, maxY: 180 },
      },
    ],
    ballSpawnPoints: [
      { id: 'ball1', position: { x: 100, y: 100 } },
      { id: 'ball2', position: { x: 200, y: 200 } },
    ],
    scoringTargets: [
      {
        id: 'red-high',
        name: 'Red High Goal',
        position: { x: 25, y: 162 },
        radius: 18,
        alliance: 'red',
        points: { auto: 4, teleop: 2 },
      },
      {
        id: 'blue-high',
        name: 'Blue High Goal',
        position: { x: 623, y: 162 },
        radius: 18,
        alliance: 'blue',
        points: { auto: 4, teleop: 2 },
      },
    ],
    startingPositions: {
      red: [
        { x: 50, y: 100 },
        { x: 50, y: 162 },
        { x: 50, y: 224 },
      ],
      blue: [
        { x: 598, y: 100 },
        { x: 598, y: 162 },
        { x: 598, y: 224 },
      ],
    },
  };
}

describe('Field', () => {
  describe('constructor', () => {
    it('should create a field with correct dimensions', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      expect(field.cols).toBe(648);
      expect(field.rows).toBe(324);
    });

    it('should apply zones correctly', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      // Check scoring zone
      const scoringCell = field.getCell({ col: 25, row: 25 });
      expect(scoringCell?.zone).toBe(ZoneType.SCORING_ZONE);

      // Check trench
      const trenchCell = field.getCell({ col: 225, row: 150 });
      expect(trenchCell?.zone).toBe(ZoneType.TRENCH);

      // Check ramp
      const rampCell = field.getCell({ col: 325, row: 175 });
      expect(rampCell?.zone).toBe(ZoneType.RAMP);

      // Check obstacle
      const obstacleCell = field.getCell({ col: 410, row: 170 });
      expect(obstacleCell?.zone).toBe(ZoneType.OBSTACLE);
    });
  });

  describe('positionToGrid', () => {
    it('should convert position to grid coordinates', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      const grid = field.positionToGrid({ x: 100.5, y: 50.9 });
      expect(grid.col).toBe(100);
      expect(grid.row).toBe(50);
    });

    it('should handle edge positions', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      const grid = field.positionToGrid({ x: 0, y: 0 });
      expect(grid.col).toBe(0);
      expect(grid.row).toBe(0);
    });
  });

  describe('gridToPosition', () => {
    it('should convert grid to center of cell', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      const pos = field.gridToPosition({ col: 10, row: 20 });
      expect(pos.x).toBe(10.5);
      expect(pos.y).toBe(20.5);
    });
  });

  describe('isInBounds', () => {
    it('should return true for valid positions', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      expect(field.isInBounds({ col: 0, row: 0 })).toBe(true);
      expect(field.isInBounds({ col: 647, row: 323 })).toBe(true);
      expect(field.isInBounds({ col: 324, row: 162 })).toBe(true);
    });

    it('should return false for out of bounds positions', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      expect(field.isInBounds({ col: -1, row: 0 })).toBe(false);
      expect(field.isInBounds({ col: 0, row: -1 })).toBe(false);
      expect(field.isInBounds({ col: 648, row: 0 })).toBe(false);
      expect(field.isInBounds({ col: 0, row: 324 })).toBe(false);
    });
  });

  describe('canRobotTraverse', () => {
    it('should allow traversal of normal zones', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      // Middle of field should be normal
      expect(field.canRobotTraverse({ col: 500, row: 100 }, 45)).toBe(true);
    });

    it('should block traversal of obstacles', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      expect(field.canRobotTraverse({ col: 410, row: 170 }, 45)).toBe(false);
    });

    it('should respect height restrictions in trench', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      // Short robot can traverse trench
      expect(field.canRobotTraverse({ col: 225, row: 150 }, 20)).toBe(true);

      // Tall robot cannot traverse trench
      expect(field.canRobotTraverse({ col: 225, row: 150 }, 30)).toBe(false);
    });
  });

  describe('getNeighbors', () => {
    it('should return 8 neighbors for interior cells', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      const neighbors = field.getNeighbors({ col: 100, row: 100 });
      expect(neighbors.length).toBe(8);
    });

    it('should return 3 neighbors for corner cells', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      const neighbors = field.getNeighbors({ col: 0, row: 0 });
      expect(neighbors.length).toBe(3);
    });

    it('should return 5 neighbors for edge cells', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      const neighbors = field.getNeighbors({ col: 100, row: 0 });
      expect(neighbors.length).toBe(5);
    });
  });

  describe('getScoringTargets', () => {
    it('should return correct targets for each alliance', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      const redTargets = field.getScoringTargets('red');
      expect(redTargets.length).toBe(1);
      expect(redTargets[0].id).toBe('red-high');

      const blueTargets = field.getScoringTargets('blue');
      expect(blueTargets.length).toBe(1);
      expect(blueTargets[0].id).toBe('blue-high');
    });
  });

  describe('getNearestScoringTarget', () => {
    it('should find the nearest target', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      // Near red goal
      const nearRed = field.getNearestScoringTarget({ x: 50, y: 162 }, 'red');
      expect(nearRed?.id).toBe('red-high');

      // Near blue goal
      const nearBlue = field.getNearestScoringTarget({ x: 600, y: 162 }, 'blue');
      expect(nearBlue?.id).toBe('blue-high');
    });
  });

  describe('getStartingPositions', () => {
    it('should return starting positions for each alliance', () => {
      const config = createTestFieldConfig();
      const field = new Field(config);

      const redStarts = field.getStartingPositions('red');
      expect(redStarts.length).toBe(3);

      const blueStarts = field.getStartingPositions('blue');
      expect(blueStarts.length).toBe(3);
    });
  });
});
