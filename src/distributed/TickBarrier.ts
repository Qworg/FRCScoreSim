/**
 * TickBarrier - Synchronization primitive for distributed tick-based simulation
 *
 * The TickBarrier waits for all expected robots to submit their commands for the
 * current tick before allowing the simulation to proceed. It handles:
 * - Waiting for all robot commands (or timeout)
 * - Tracking which robots have responded
 * - Providing default commands for timed-out robots
 * - Managing consecutive timeout tracking for unresponsive robots
 */

import type { WireRobotCommand } from '../types/distributed.js';
import { WireRobotActionType } from '../types/distributed.js';

/**
 * Result of waiting for all robot commands
 */
export interface BarrierResult {
  /** Map of robot ID -> command (null if timed out) */
  commands: Map<string, WireRobotCommand | null>;
  /** Robot IDs that responded in time */
  respondedRobots: string[];
  /** Robot IDs that timed out */
  timedOutRobots: string[];
  /** Whether all robots responded before timeout */
  allResponded: boolean;
  /** Time spent waiting (ms) */
  waitTimeMs: number;
}

/**
 * Configuration for TickBarrier
 */
export interface TickBarrierConfig {
  /** Command timeout in milliseconds */
  timeoutMs: number;
  /** Consecutive timeouts before considering robot unresponsive */
  unresponsiveThreshold: number;
}

/**
 * TickBarrier manages per-tick synchronization of robot commands
 */
export class TickBarrier {
  private config: TickBarrierConfig;
  private expectedRobots: Set<string>;
  private currentTick: number = 0;
  private receivedCommands: Map<string, WireRobotCommand> = new Map();
  private resolveWait: ((result: BarrierResult) => void) | null = null;
  private waitTimeout: ReturnType<typeof setTimeout> | null = null;
  private waitStartTime: number = 0;

  /** Consecutive timeout counts for each robot */
  private consecutiveTimeouts: Map<string, number> = new Map();

  /** Robots that have been marked as unresponsive */
  private unresponsiveRobots: Set<string> = new Set();

  constructor(
    expectedRobotIds: string[],
    config: Partial<TickBarrierConfig> = {}
  ) {
    this.expectedRobots = new Set(expectedRobotIds);
    this.config = {
      timeoutMs: config.timeoutMs ?? 100,
      unresponsiveThreshold: config.unresponsiveThreshold ?? 30,
    };

    // Initialize timeout counters
    for (const id of expectedRobotIds) {
      this.consecutiveTimeouts.set(id, 0);
    }
  }

  /**
   * Start a new tick and prepare to receive commands
   */
  beginTick(tick: number): void {
    this.currentTick = tick;
    this.receivedCommands.clear();
    this.resolveWait = null;
    if (this.waitTimeout) {
      clearTimeout(this.waitTimeout);
      this.waitTimeout = null;
    }
  }

  /**
   * Receive a command from a robot
   * Returns true if command was accepted, false if robot not expected or wrong tick
   */
  receiveCommand(robotId: string, command: WireRobotCommand): boolean {
    // Verify this is for the current tick
    if (command.tick !== this.currentTick) {
      console.warn(
        `TickBarrier: Robot ${robotId} sent command for tick ${command.tick}, ` +
        `but current tick is ${this.currentTick}. Ignoring.`
      );
      return false;
    }

    // Verify robot is expected
    if (!this.expectedRobots.has(robotId)) {
      console.warn(
        `TickBarrier: Unexpected robot ${robotId} sent command. Ignoring.`
      );
      return false;
    }

    // Store the command
    this.receivedCommands.set(robotId, command);

    // Reset timeout counter for this robot
    this.consecutiveTimeouts.set(robotId, 0);
    this.unresponsiveRobots.delete(robotId);

    // Check if all robots have responded
    if (this.receivedCommands.size >= this.activeRobotCount() && this.resolveWait) {
      this.completeWait();
    }

    return true;
  }

  /**
   * Wait for all expected robots to submit commands (or timeout)
   */
  waitForAll(overrideTimeoutMs?: number): Promise<BarrierResult> {
    const timeoutMs = overrideTimeoutMs ?? this.config.timeoutMs;
    this.waitStartTime = Date.now();

    return new Promise((resolve) => {
      // Check if already complete
      if (this.receivedCommands.size >= this.activeRobotCount()) {
        resolve(this.buildResult());
        return;
      }

      // Store resolver
      this.resolveWait = resolve;

      // Set timeout
      this.waitTimeout = setTimeout(() => {
        this.completeWait();
      }, timeoutMs);
    });
  }

  /**
   * Complete the wait and resolve the promise
   */
  private completeWait(): void {
    if (this.waitTimeout) {
      clearTimeout(this.waitTimeout);
      this.waitTimeout = null;
    }

    const result = this.buildResult();

    // Update timeout counters for robots that didn't respond
    for (const robotId of result.timedOutRobots) {
      const count = (this.consecutiveTimeouts.get(robotId) ?? 0) + 1;
      this.consecutiveTimeouts.set(robotId, count);

      if (count >= this.config.unresponsiveThreshold) {
        this.unresponsiveRobots.add(robotId);
        console.warn(
          `TickBarrier: Robot ${robotId} marked as unresponsive ` +
          `after ${count} consecutive timeouts`
        );
      }
    }

    if (this.resolveWait) {
      this.resolveWait(result);
      this.resolveWait = null;
    }
  }

  /**
   * Build the barrier result
   */
  private buildResult(): BarrierResult {
    const commands = new Map<string, WireRobotCommand | null>();
    const respondedRobots: string[] = [];
    const timedOutRobots: string[] = [];

    for (const robotId of this.expectedRobots) {
      // Skip unresponsive robots (they'll use default commands)
      if (this.unresponsiveRobots.has(robotId)) {
        commands.set(robotId, this.createDefaultCommand(robotId));
        timedOutRobots.push(robotId);
        continue;
      }

      const command = this.receivedCommands.get(robotId);
      if (command) {
        commands.set(robotId, command);
        respondedRobots.push(robotId);
      } else {
        commands.set(robotId, null);
        timedOutRobots.push(robotId);
      }
    }

    return {
      commands,
      respondedRobots,
      timedOutRobots,
      allResponded: timedOutRobots.length === 0,
      waitTimeMs: Date.now() - this.waitStartTime,
    };
  }

  /**
   * Create a default IDLE command for a robot that timed out
   */
  private createDefaultCommand(robotId: string): WireRobotCommand {
    return {
      tick: this.currentTick,
      robotId,
      action: WireRobotActionType.IDLE,
      targetX: null,
      targetY: null,
      targetBallId: null,
      targetZoneId: null,
      climbLevel: null,
      isAutoClimb: false,
    };
  }

  /**
   * Get the number of active (non-unresponsive) robots
   */
  private activeRobotCount(): number {
    return this.expectedRobots.size - this.unresponsiveRobots.size;
  }

  /**
   * Check if a robot is marked as unresponsive
   */
  isUnresponsive(robotId: string): boolean {
    return this.unresponsiveRobots.has(robotId);
  }

  /**
   * Get consecutive timeout count for a robot
   */
  getTimeoutCount(robotId: string): number {
    return this.consecutiveTimeouts.get(robotId) ?? 0;
  }

  /**
   * Get all unresponsive robot IDs
   */
  getUnresponsiveRobots(): string[] {
    return Array.from(this.unresponsiveRobots);
  }

  /**
   * Add a new expected robot
   */
  addRobot(robotId: string): void {
    this.expectedRobots.add(robotId);
    this.consecutiveTimeouts.set(robotId, 0);
  }

  /**
   * Remove an expected robot
   */
  removeRobot(robotId: string): void {
    this.expectedRobots.delete(robotId);
    this.consecutiveTimeouts.delete(robotId);
    this.unresponsiveRobots.delete(robotId);
    this.receivedCommands.delete(robotId);

    // Check if this completes the current wait
    if (this.receivedCommands.size >= this.activeRobotCount() && this.resolveWait) {
      this.completeWait();
    }
  }

  /**
   * Reset a robot's unresponsive status (e.g., on reconnection)
   */
  resetRobotStatus(robotId: string): void {
    this.unresponsiveRobots.delete(robotId);
    this.consecutiveTimeouts.set(robotId, 0);
  }

  /**
   * Get current expected robots
   */
  getExpectedRobots(): string[] {
    return Array.from(this.expectedRobots);
  }

  /**
   * Get current tick
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TickBarrierConfig>): void {
    if (config.timeoutMs !== undefined) {
      this.config.timeoutMs = config.timeoutMs;
    }
    if (config.unresponsiveThreshold !== undefined) {
      this.config.unresponsiveThreshold = config.unresponsiveThreshold;
    }
  }

  /**
   * Cancel any pending wait
   */
  cancel(): void {
    if (this.waitTimeout) {
      clearTimeout(this.waitTimeout);
      this.waitTimeout = null;
    }
    if (this.resolveWait) {
      this.resolveWait(this.buildResult());
      this.resolveWait = null;
    }
  }

  /**
   * Reset all state (for new match)
   */
  reset(): void {
    this.cancel();
    this.currentTick = 0;
    this.receivedCommands.clear();
    this.consecutiveTimeouts.clear();
    this.unresponsiveRobots.clear();

    for (const id of this.expectedRobots) {
      this.consecutiveTimeouts.set(id, 0);
    }
  }
}
