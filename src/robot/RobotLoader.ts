import { readFile } from 'fs/promises';
import { nanoid } from 'nanoid';
import type { RobotConfig } from '../types/index.js';
import {
  findSection,
  getOptionalValue,
  getRequiredValue,
  parseBooleanValue,
  parseMarkdown,
  parseNumericValue,
} from '../utils/MarkdownParser.js';

/**
 * Parse a robot configuration from markdown content
 */
export function parseRobotMarkdown(content: string): RobotConfig {
  const sections = parseMarkdown(content);

  // Get team info from first heading
  const titleSection = sections[0];
  if (!titleSection) {
    throw new Error('Robot markdown must start with a team heading');
  }

  // Parse team number and name from heading
  // Format: "# Team 254 - Cheesy Poofs" or "# 254 - Cheesy Poofs"
  const titleMatch = titleSection.heading.match(
    /(?:Team\s*)?(\d+)\s*[-–]\s*(.+)/i
  );
  if (!titleMatch) {
    throw new Error(
      `Invalid team heading format: ${titleSection.heading}. Expected "Team ### - Name" or "### - Name"`
    );
  }

  const teamNumber = parseInt(titleMatch[1], 10);
  const teamName = titleMatch[2].trim();

  // Parse dimensions section
  const dimensionsSection = findSection(sections, 'Dimensions');
  if (!dimensionsSection) {
    throw new Error('Missing required "Dimensions" section');
  }

  const width = parseNumericValue(getRequiredValue(dimensionsSection, 'width'));
  const length = parseNumericValue(getRequiredValue(dimensionsSection, 'length'));
  const height = parseNumericValue(getRequiredValue(dimensionsSection, 'height'));

  // Parse capabilities section
  const capabilitiesSection = findSection(sections, 'Capabilities');
  if (!capabilitiesSection) {
    throw new Error('Missing required "Capabilities" section');
  }

  const topSpeed = parseNumericValue(
    getRequiredValue(capabilitiesSection, 'top_speed')
  );
  const acceleration = parseNumericValue(
    getRequiredValue(capabilitiesSection, 'acceleration')
  );
  const shootingRange = parseNumericValue(
    getOptionalValue(capabilitiesSection, 'shooting_range', '240')
  );
  const shootingAccuracy = parseNumericValue(
    getOptionalValue(capabilitiesSection, 'shooting_accuracy', '0.7')
  );
  const ballCapacity = parseNumericValue(
    getOptionalValue(capabilitiesSection, 'ball_capacity', '5')
  );
  const canClimb = parseBooleanValue(
    getOptionalValue(capabilitiesSection, 'can_climb', 'no')
  );
  const autoClimb = parseBooleanValue(
    getOptionalValue(capabilitiesSection, 'auto_climb', 'no')
  );
  const climbLevel = parseNumericValue(
    getOptionalValue(capabilitiesSection, 'climb_level', '1')
  );
  const climbUpTime = parseNumericValue(
    getOptionalValue(capabilitiesSection, 'climb_up_time', '3.0')
  );
  const climbDownTime = parseNumericValue(
    getOptionalValue(capabilitiesSection, 'climb_down_time', '2.0')
  );
  const canPass = parseBooleanValue(
    getOptionalValue(capabilitiesSection, 'can_pass', 'no')
  );

  // Optional fields with defaults
  const turnRate = parseNumericValue(
    getOptionalValue(capabilitiesSection, 'turn_rate', '180')
  );
  const pickupTime = parseNumericValue(
    getOptionalValue(capabilitiesSection, 'pickup_time', '0.5')
  );
  const shootTime = parseNumericValue(
    getOptionalValue(capabilitiesSection, 'shoot_time', '0.3')
  );

  // Parse default strategy
  const strategySection = findSection(sections, 'Default Strategy');
  const defaultStrategy = strategySection?.content[0]?.toLowerCase() ?? 'scorer';

  return {
    id: nanoid(),
    teamNumber,
    teamName,
    width,
    length,
    height,
    topSpeed,
    acceleration,
    turnRate,
    shootingRange,
    shootingAccuracy,
    ballCapacity,
    pickupTime,
    shootTime,
    canClimb,
    autoClimb,
    climbLevel: Math.max(1, Math.min(3, climbLevel)), // Clamp to 1-3
    climbUpTime,
    climbDownTime,
    canPass,
    defaultStrategy,
  };
}

/**
 * Load a robot configuration from a markdown file
 */
export async function loadRobotFromFile(filePath: string): Promise<RobotConfig> {
  const content = await readFile(filePath, 'utf-8');
  return parseRobotMarkdown(content);
}

/**
 * Create a default robot configuration
 */
export function createDefaultRobotConfig(
  teamNumber: number,
  teamName: string
): RobotConfig {
  return {
    id: nanoid(),
    teamNumber,
    teamName,
    width: 28,
    length: 32,
    height: 45,
    topSpeed: 150,
    acceleration: 100,
    turnRate: 180,
    shootingRange: 240,
    shootingAccuracy: 0.7,
    ballCapacity: 5,
    pickupTime: 0.5,
    shootTime: 0.3,
    canClimb: true,
    autoClimb: false,
    climbLevel: 2,
    climbUpTime: 3.0,
    climbDownTime: 2.0,
    canPass: false,
    defaultStrategy: 'scorer',
  };
}

/**
 * Validate a robot configuration
 */
export function validateRobotConfig(config: RobotConfig): string[] {
  const errors: string[] = [];

  if (config.width <= 0 || config.width > 36) {
    errors.push('Robot width must be between 0 and 36 inches');
  }

  if (config.length <= 0 || config.length > 36) {
    errors.push('Robot length must be between 0 and 36 inches');
  }

  if (config.height <= 0 || config.height > 60) {
    errors.push('Robot height must be between 0 and 60 inches');
  }

  if (config.topSpeed <= 0) {
    errors.push('Top speed must be positive');
  }

  if (config.acceleration <= 0) {
    errors.push('Acceleration must be positive');
  }

  if (config.shootingAccuracy < 0 || config.shootingAccuracy > 1) {
    errors.push('Shooting accuracy must be between 0 and 1');
  }

  if (config.ballCapacity < 1) {
    errors.push('Ball capacity must be at least 1');
  }

  if (config.climbLevel < 1 || config.climbLevel > 3) {
    errors.push('Climb level must be between 1 and 3');
  }

  if (config.climbUpTime <= 0) {
    errors.push('Climb up time must be positive');
  }

  if (config.climbDownTime <= 0) {
    errors.push('Climb down time must be positive');
  }

  return errors;
}
