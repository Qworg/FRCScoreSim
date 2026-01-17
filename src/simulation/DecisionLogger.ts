import { writeFileSync, appendFileSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type { RobotActionType, RobotState } from '../types/robot.js';
import type { StrategyDecision } from '../types/strategy.js';
import type {
  DecisionLogEntry,
  DecisionLogStats,
  DecisionInfo,
  ExecutionInfo,
} from '../types/logging.js';
import { DecisionRejectionReason } from '../types/logging.js';

/** Default log file path */
const DEFAULT_LOG_FILE = 'logs/decisions.jsonl';

/**
 * Result of attempting to execute a command
 */
export interface ExecutionResult {
  /** Whether the command was executed */
  executed: boolean;
  /** Reason for rejection if not executed */
  reason?: DecisionRejectionReason;
}

/**
 * Logs robot decisions and their execution results for debugging and analysis
 */
export class DecisionLogger {
  private entries: DecisionLogEntry[] = [];
  private maxEntries: number;
  private enabled: boolean;
  private logFile: string | null;
  private fileInitialized: boolean = false;

  constructor(options: { maxEntries?: number; enabled?: boolean; logFile?: string | null } = {}) {
    this.maxEntries = options.maxEntries ?? 10000;
    this.enabled = options.enabled ?? true;
    // Default to logging to file, pass null to disable
    this.logFile = options.logFile === undefined ? DEFAULT_LOG_FILE : options.logFile;
  }

  /**
   * Initialize the log file (wipe if exists, create directory if needed)
   */
  initializeLogFile(): void {
    if (!this.logFile || this.fileInitialized) return;

    try {
      const dir = dirname(this.logFile);
      if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      // Wipe the file by writing empty content
      writeFileSync(this.logFile, '');
      this.fileInitialized = true;
    } catch (error) {
      console.error(`Failed to initialize log file ${this.logFile}:`, error);
      this.logFile = null; // Disable file logging on error
    }
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Log a decision and its execution result
   */
  logDecision(
    tick: number,
    robot: RobotState,
    strategyId: string,
    decision: StrategyDecision,
    executionResult: ExecutionResult
  ): void {
    if (!this.enabled) return;

    const entry: DecisionLogEntry = {
      tick,
      robotId: robot.id,
      alliance: robot.alliance,
      strategyId,
      decision: this.extractDecisionInfo(decision),
      execution: this.extractExecutionInfo(executionResult),
    };

    this.entries.push(entry);

    // Write to file (JSONL format - one JSON object per line)
    this.writeEntryToFile(entry);

    // Trim entries if over max
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  /**
   * Write a single entry to the log file
   */
  private writeEntryToFile(entry: DecisionLogEntry): void {
    if (!this.logFile) return;

    // Initialize file on first write
    if (!this.fileInitialized) {
      this.initializeLogFile();
    }

    if (!this.logFile) return; // May have been disabled on init error

    try {
      appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
    } catch (error) {
      // Silently fail on write errors to not interrupt simulation
    }
  }

  /**
   * Extract decision info from a strategy decision
   */
  private extractDecisionInfo(decision: StrategyDecision): DecisionInfo {
    const info: DecisionInfo = {
      commandType: decision.command.type,
      priority: decision.priority,
      reason: decision.reason,
    };

    if (decision.command.targetPosition) {
      info.targetPosition = { ...decision.command.targetPosition };
    }
    if (decision.command.targetBallId) {
      info.targetBallId = decision.command.targetBallId;
    }
    if (decision.command.targetScoringZoneId) {
      info.targetScoringZoneId = decision.command.targetScoringZoneId;
    }
    if (decision.command.targetClimbLevel !== undefined) {
      info.targetClimbLevel = decision.command.targetClimbLevel;
    }

    return info;
  }

  /**
   * Extract execution info from result
   */
  private extractExecutionInfo(result: ExecutionResult): ExecutionInfo {
    return {
      executed: result.executed,
      rejectionReason: result.reason,
    };
  }

  /**
   * Get all log entries
   */
  getEntries(): DecisionLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries for a specific robot
   */
  getEntriesForRobot(robotId: string): DecisionLogEntry[] {
    return this.entries.filter((e) => e.robotId === robotId);
  }

  /**
   * Get entries for a specific alliance
   */
  getEntriesForAlliance(alliance: 'red' | 'blue'): DecisionLogEntry[] {
    return this.entries.filter((e) => e.alliance === alliance);
  }

  /**
   * Get entries within a tick range
   */
  getEntriesInRange(startTick: number, endTick: number): DecisionLogEntry[] {
    return this.entries.filter((e) => e.tick >= startTick && e.tick <= endTick);
  }

  /**
   * Get all rejected decisions
   */
  getRejectedDecisions(): DecisionLogEntry[] {
    return this.entries.filter((e) => !e.execution.executed);
  }

  /**
   * Get rejected decisions by reason
   */
  getRejectedByReason(reason: DecisionRejectionReason): DecisionLogEntry[] {
    return this.entries.filter((e) => e.execution.rejectionReason === reason);
  }

  /**
   * Get decisions by command type
   */
  getDecisionsByType(type: RobotActionType): DecisionLogEntry[] {
    return this.entries.filter((e) => e.decision.commandType === type);
  }

  /**
   * Get the most recent entries
   */
  getRecentEntries(count: number): DecisionLogEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Get statistics about logged decisions
   */
  getStats(): DecisionLogStats {
    const stats: DecisionLogStats = {
      totalDecisions: this.entries.length,
      executedDecisions: 0,
      rejectedDecisions: 0,
      rejectionsByReason: {} as Record<DecisionRejectionReason, number>,
      decisionsByType: {} as Record<RobotActionType, number>,
      decisionsByRobot: {},
    };

    // Initialize rejection reasons
    for (const reason of Object.values(DecisionRejectionReason)) {
      stats.rejectionsByReason[reason] = 0;
    }

    for (const entry of this.entries) {
      // Execution counts
      if (entry.execution.executed) {
        stats.executedDecisions++;
      } else {
        stats.rejectedDecisions++;
        if (entry.execution.rejectionReason) {
          stats.rejectionsByReason[entry.execution.rejectionReason]++;
        }
      }

      // Type counts
      const type = entry.decision.commandType;
      stats.decisionsByType[type] = (stats.decisionsByType[type] ?? 0) + 1;

      // Robot counts
      stats.decisionsByRobot[entry.robotId] =
        (stats.decisionsByRobot[entry.robotId] ?? 0) + 1;
    }

    return stats;
  }

  /**
   * Export entries to JSON
   */
  export(): string {
    return JSON.stringify({
      entries: this.entries,
      stats: this.getStats(),
    }, null, 2);
  }

  /**
   * Clear all entries and reset log file
   */
  clear(): void {
    this.entries = [];
    this.fileInitialized = false;
    // Next log will wipe the file
  }

  /**
   * Get the number of entries
   */
  get length(): number {
    return this.entries.length;
  }

  /**
   * Get the log file path
   */
  getLogFilePath(): string | null {
    return this.logFile;
  }

  /**
   * Write final stats to a separate file
   */
  writeStatsFile(): void {
    if (!this.logFile) return;

    const statsFile = this.logFile.replace(/\.jsonl$/, '-stats.json');
    try {
      writeFileSync(statsFile, JSON.stringify(this.getStats(), null, 2));
    } catch (error) {
      console.error(`Failed to write stats file ${statsFile}:`, error);
    }
  }
}
