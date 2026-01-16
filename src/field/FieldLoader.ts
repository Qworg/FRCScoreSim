import { readFile } from 'fs/promises';
import type { FieldConfig } from '../types/index.js';
import { Field } from './Field.js';

/**
 * Load a field configuration from a JSON file
 */
export async function loadFieldFromFile(filePath: string): Promise<Field> {
  const content = await readFile(filePath, 'utf-8');
  const config = JSON.parse(content) as FieldConfig;
  return new Field(config);
}

/**
 * Load a field configuration from a JSON string
 */
export function loadFieldFromJSON(json: string): Field {
  const config = JSON.parse(json) as FieldConfig;
  return new Field(config);
}

/**
 * Create a field from a configuration object
 */
export function createField(config: FieldConfig): Field {
  return new Field(config);
}

/**
 * Validate a field configuration
 */
export function validateFieldConfig(config: FieldConfig): string[] {
  const errors: string[] = [];

  if (!config.name) {
    errors.push('Field name is required');
  }

  if (config.width <= 0) {
    errors.push('Field width must be positive');
  }

  if (config.height <= 0) {
    errors.push('Field height must be positive');
  }

  if (config.cellSize <= 0) {
    errors.push('Cell size must be positive');
  }

  if (!config.startingPositions?.red || config.startingPositions.red.length === 0) {
    errors.push('At least one red starting position is required');
  }

  if (!config.startingPositions?.blue || config.startingPositions.blue.length === 0) {
    errors.push('At least one blue starting position is required');
  }

  // Validate zones
  for (const zone of config.zones) {
    if (zone.bounds.minX >= zone.bounds.maxX) {
      errors.push(`Zone '${zone.name}' has invalid X bounds`);
    }
    if (zone.bounds.minY >= zone.bounds.maxY) {
      errors.push(`Zone '${zone.name}' has invalid Y bounds`);
    }
  }

  // Validate scoring targets
  for (const target of config.scoringTargets) {
    if (target.radius <= 0) {
      errors.push(`Scoring target '${target.name}' has invalid radius`);
    }
    if (!['red', 'blue'].includes(target.alliance)) {
      errors.push(`Scoring target '${target.name}' has invalid alliance`);
    }
  }

  return errors;
}
