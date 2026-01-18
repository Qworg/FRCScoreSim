import type { Position } from '../types/field.js';
import type { RobotState } from '../types/robot.js';
import type { StuckState, ObstacleInfo, EscapeAction } from '../types/simulation.js';
import { EscapeStrategy } from '../types/simulation.js';
import type { Field } from '../field/Field.js';

/**
 * Configuration for stuck detection and handling
 */
export interface StuckHandlerConfig {
  /** Number of ticks with minimal movement to consider stuck (default: 120 = 2 seconds at 60 FPS) */
  stuckThreshold: number;
  /** Minimum movement in inches to not be considered stuck (default: 0.5) */
  minMovement: number;
  /** Number of positions to track in history (default: 10) */
  positionHistorySize: number;
  /** Distance to scan for obstacles (default: 60 inches) */
  obstacleDetectionRange: number;
  /** Number of ticks between repath attempts (default: 30 = 0.5 seconds) */
  repathInterval: number;
  /** Number of ticks before trying smart backoff (default: 180 = 3 seconds) */
  smartBackoffThreshold: number;
  /** Number of ticks before abandoning target (default: 360 = 6 seconds) */
  abandonThreshold: number;
  /** Backoff distance in inches (default: 40-80 random) */
  backoffDistanceMin: number;
  backoffDistanceMax: number;
}

const DEFAULT_CONFIG: StuckHandlerConfig = {
  stuckThreshold: 120, // 2 seconds at 60 FPS
  minMovement: 0.5,
  positionHistorySize: 10,
  obstacleDetectionRange: 60,
  repathInterval: 30, // Repath every 0.5 seconds when stuck
  smartBackoffThreshold: 180, // 3 seconds: try smart backoff
  abandonThreshold: 360, // 6 seconds: give up on target
  backoffDistanceMin: 40,
  backoffDistanceMax: 80,
};

/**
 * Handles detection of stuck robots and generation of escape strategies
 */
export class StuckHandler {
  private states: Map<string, StuckState> = new Map();
  private config: StuckHandlerConfig;

  constructor(config: Partial<StuckHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update stuck tracking for a robot and return escape action if needed
   */
  update(
    robot: RobotState,
    tick: number,
    blocked: boolean,
    field: Field,
    otherRobots: RobotState[]
  ): EscapeAction | null {
    let state = this.states.get(robot.id);

    // Initialize state if needed
    if (!state) {
      state = this.createInitialState(robot.id, tick);
      this.states.set(robot.id, state);
    }

    // Update position history
    this.updatePositionHistory(state, robot.position, tick);

    // Calculate actual movement over the history window
    const actualMovement = this.calculateMovement(state);

    // Check if stuck
    const isStuck = blocked || actualMovement < this.config.minMovement;

    if (isStuck) {
      // First time becoming stuck
      if (state.stuckTicks === 0) {
        state.stuckSince = tick;
      }
      state.stuckTicks++;

      // Detect nearby obstacles for smart escape
      state.nearbyObstacles = this.detectObstacles(
        robot,
        field,
        otherRobots
      );

      // Determine escape action based on how long we've been stuck
      return this.determineEscapeAction(state, robot, field);
    } else {
      // Not stuck - reset state
      this.resetState(state, tick);
      return null;
    }
  }

  /**
   * Create initial stuck state for a robot
   */
  private createInitialState(robotId: string, tick: number): StuckState {
    return {
      robotId,
      stuckSince: tick,
      stuckTicks: 0,
      escapeAttempts: 0,
      lastEscapeStrategy: null,
      failedStrategies: [],
      nearbyObstacles: [],
      positionHistory: [],
    };
  }

  /**
   * Reset stuck state while keeping position history
   */
  private resetState(state: StuckState, tick: number): void {
    state.stuckSince = tick;
    state.stuckTicks = 0;
    state.escapeAttempts = 0;
    state.lastEscapeStrategy = null;
    state.failedStrategies = [];
    state.nearbyObstacles = [];
  }

  /**
   * Update position history
   */
  private updatePositionHistory(
    state: StuckState,
    position: Position,
    tick: number
  ): void {
    state.positionHistory.push({ x: position.x, y: position.y, tick });

    // Keep only recent positions
    if (state.positionHistory.length > this.config.positionHistorySize) {
      state.positionHistory.shift();
    }
  }

  /**
   * Calculate total movement over position history
   */
  private calculateMovement(state: StuckState): number {
    if (state.positionHistory.length < 2) {
      return Infinity; // Not enough data
    }

    let totalMovement = 0;
    for (let i = 1; i < state.positionHistory.length; i++) {
      const prev = state.positionHistory[i - 1];
      const curr = state.positionHistory[i];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      totalMovement += Math.sqrt(dx * dx + dy * dy);
    }

    return totalMovement;
  }

  /**
   * Detect obstacles near the robot
   */
  private detectObstacles(
    robot: RobotState,
    field: Field,
    otherRobots: RobotState[]
  ): ObstacleInfo[] {
    const obstacles: ObstacleInfo[] = [];
    const range = this.config.obstacleDetectionRange;

    // Check other robots
    for (const other of otherRobots) {
      if (other.id === robot.id) continue;

      const dx = other.position.x - robot.position.x;
      const dy = other.position.y - robot.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= range) {
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        obstacles.push({
          type: 'robot',
          position: { x: other.position.x, y: other.position.y },
          distance,
          angle,
          robotId: other.id,
        });
      }
    }

    // Check field boundaries
    const wallObstacles = this.detectWallObstacles(robot, field, range);
    obstacles.push(...wallObstacles);

    return obstacles.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Detect wall/boundary obstacles
   */
  private detectWallObstacles(
    robot: RobotState,
    field: Field,
    range: number
  ): ObstacleInfo[] {
    const walls: ObstacleInfo[] = [];
    const { x, y } = robot.position;
    const width = field.config.width;
    const height = field.config.height;

    // Left wall
    if (x <= range) {
      walls.push({
        type: 'wall',
        position: { x: 0, y },
        distance: x,
        angle: 180,
      });
    }
    // Right wall
    if (x >= width - range) {
      walls.push({
        type: 'wall',
        position: { x: width, y },
        distance: width - x,
        angle: 0,
      });
    }
    // Bottom wall
    if (y <= range) {
      walls.push({
        type: 'wall',
        position: { x, y: 0 },
        distance: y,
        angle: -90,
      });
    }
    // Top wall
    if (y >= height - range) {
      walls.push({
        type: 'wall',
        position: { x, y: height },
        distance: height - y,
        angle: 90,
      });
    }

    return walls;
  }

  /**
   * Determine what escape action to take based on stuck duration
   */
  private determineEscapeAction(
    state: StuckState,
    robot: RobotState,
    field: Field
  ): EscapeAction | null {
    const ticks = state.stuckTicks;
    const interval = this.config.repathInterval;

    // Escalation timeline (at 60 FPS):
    // 120 ticks (2 sec): First repath
    // 150, 180 ticks: Additional repath attempts
    // 180+ ticks (3 sec): Smart backoff (obstacle-aware perpendicular escape)
    // 360+ ticks (6 sec): Abandon target

    if (ticks >= this.config.abandonThreshold) {
      // Give up entirely
      state.lastEscapeStrategy = EscapeStrategy.ABANDON_TARGET;
      state.escapeAttempts++;
      return {
        strategy: EscapeStrategy.ABANDON_TARGET,
        abandonCurrentAction: true,
      };
    }

    if (ticks >= this.config.smartBackoffThreshold) {
      // Smart backoff - find clearest direction
      return this.createSmartBackoffAction(state, robot, field);
    }

    // Regular repath attempts
    if (ticks >= this.config.stuckThreshold && ticks % interval === 0) {
      state.lastEscapeStrategy = EscapeStrategy.REPATH;
      state.escapeAttempts++;
      return {
        strategy: EscapeStrategy.REPATH,
        abandonCurrentAction: false,
      };
    }

    return null;
  }

  /**
   * Create a smart backoff action based on obstacle detection
   */
  private createSmartBackoffAction(
    state: StuckState,
    robot: RobotState,
    field: Field
  ): EscapeAction {
    // Find the clearest direction (8 directions)
    const directions = this.findClearDirections(state, robot, field);

    // Pick the best escape strategy based on clear directions
    let strategy: EscapeStrategy;
    let targetPosition: Position | undefined;

    if (directions.length === 0) {
      // No clear directions - try random
      strategy = EscapeStrategy.RANDOM_DIRECTION;
      targetPosition = this.calculateRandomEscapePosition(robot, field);
    } else {
      // Pick a strategy based on clearest direction
      const best = directions[0];

      // Classify direction into strategy
      if (best.angle >= -45 && best.angle < 45) {
        // Forward-ish (but we're stuck, so not useful)
        strategy = Math.random() < 0.5
          ? EscapeStrategy.PERPENDICULAR_LEFT
          : EscapeStrategy.PERPENDICULAR_RIGHT;
      } else if (best.angle >= 135 || best.angle < -135) {
        strategy = EscapeStrategy.BACKWARD;
      } else if (best.angle >= 45 && best.angle < 135) {
        strategy = EscapeStrategy.PERPENDICULAR_LEFT;
      } else {
        strategy = EscapeStrategy.PERPENDICULAR_RIGHT;
      }

      // Check if this strategy already failed
      if (state.failedStrategies.includes(strategy)) {
        // Try another direction
        const alternatives = [
          EscapeStrategy.PERPENDICULAR_LEFT,
          EscapeStrategy.PERPENDICULAR_RIGHT,
          EscapeStrategy.BACKWARD,
        ].filter(s => !state.failedStrategies.includes(s));

        if (alternatives.length > 0) {
          strategy = alternatives[Math.floor(Math.random() * alternatives.length)];
        } else {
          strategy = EscapeStrategy.RANDOM_DIRECTION;
        }
      }

      targetPosition = this.calculateEscapePosition(robot, strategy, field);
    }

    // Record this attempt
    state.lastEscapeStrategy = strategy;
    state.escapeAttempts++;

    return {
      strategy,
      targetPosition,
      abandonCurrentAction: false,
    };
  }

  /**
   * Find directions that are relatively clear of obstacles
   */
  private findClearDirections(
    state: StuckState,
    robot: RobotState,
    field: Field
  ): Array<{ angle: number; clearance: number }> {
    const directions: Array<{ angle: number; clearance: number }> = [];

    // Check 8 directions (every 45 degrees)
    for (let angle = 0; angle < 360; angle += 45) {
      let clearance = this.config.obstacleDetectionRange;

      // Check each obstacle
      for (const obstacle of state.nearbyObstacles) {
        // Calculate angular difference
        let angleDiff = Math.abs(obstacle.angle - angle);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;

        // If obstacle is roughly in this direction (within 45 degrees)
        if (angleDiff < 45) {
          clearance = Math.min(clearance, obstacle.distance);
        }
      }

      // Also check field boundaries
      const testDist = 50;
      const testX = robot.position.x + Math.cos(angle * Math.PI / 180) * testDist;
      const testY = robot.position.y + Math.sin(angle * Math.PI / 180) * testDist;

      if (testX < 20 || testX > field.config.width - 20 ||
          testY < 20 || testY > field.config.height - 20) {
        clearance = Math.min(clearance, 20);
      }

      directions.push({ angle, clearance });
    }

    // Sort by clearance (most clear first)
    return directions
      .filter(d => d.clearance > 20) // Only consider reasonably clear directions
      .sort((a, b) => b.clearance - a.clearance);
  }

  /**
   * Calculate escape position based on strategy
   */
  private calculateEscapePosition(
    robot: RobotState,
    strategy: EscapeStrategy,
    field: Field
  ): Position {
    const heading = robot.heading * Math.PI / 180;
    const distance = this.config.backoffDistanceMin +
      Math.random() * (this.config.backoffDistanceMax - this.config.backoffDistanceMin);

    let escapeAngle: number;

    switch (strategy) {
      case EscapeStrategy.PERPENDICULAR_LEFT:
        escapeAngle = heading + Math.PI / 2;
        break;
      case EscapeStrategy.PERPENDICULAR_RIGHT:
        escapeAngle = heading - Math.PI / 2;
        break;
      case EscapeStrategy.BACKWARD:
        escapeAngle = heading + Math.PI;
        break;
      default:
        escapeAngle = Math.random() * Math.PI * 2;
    }

    let x = robot.position.x + Math.cos(escapeAngle) * distance;
    let y = robot.position.y + Math.sin(escapeAngle) * distance;

    // Clamp to field bounds
    x = Math.max(20, Math.min(field.config.width - 20, x));
    y = Math.max(20, Math.min(field.config.height - 20, y));

    return { x, y };
  }

  /**
   * Calculate random escape position
   */
  private calculateRandomEscapePosition(robot: RobotState, field: Field): Position {
    const angle = Math.random() * Math.PI * 2;
    const distance = this.config.backoffDistanceMin +
      Math.random() * (this.config.backoffDistanceMax - this.config.backoffDistanceMin);

    let x = robot.position.x + Math.cos(angle) * distance;
    let y = robot.position.y + Math.sin(angle) * distance;

    // Clamp to field bounds
    x = Math.max(20, Math.min(field.config.width - 20, x));
    y = Math.max(20, Math.min(field.config.height - 20, y));

    return { x, y };
  }

  /**
   * Mark an escape strategy as failed for a robot
   */
  markStrategyFailed(robotId: string, strategy: EscapeStrategy): void {
    const state = this.states.get(robotId);
    if (state && !state.failedStrategies.includes(strategy)) {
      state.failedStrategies.push(strategy);
    }
  }

  /**
   * Get stuck state for a robot
   */
  getState(robotId: string): StuckState | undefined {
    return this.states.get(robotId);
  }

  /**
   * Check if a robot is currently stuck
   */
  isStuck(robotId: string): boolean {
    const state = this.states.get(robotId);
    return state !== undefined && state.stuckTicks > this.config.stuckThreshold;
  }

  /**
   * Get all stuck robots
   */
  getStuckRobots(): string[] {
    const stuck: string[] = [];
    for (const [robotId, state] of this.states) {
      if (state.stuckTicks > this.config.stuckThreshold) {
        stuck.push(robotId);
      }
    }
    return stuck;
  }

  /**
   * Clear state for a robot
   */
  clearState(robotId: string): void {
    this.states.delete(robotId);
  }

  /**
   * Clear all states
   */
  clear(): void {
    this.states.clear();
  }
}
