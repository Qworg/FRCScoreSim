import type { PhaseTiming } from '../types/index.js';
import { MatchPhase, DEFAULT_SIMULATION_CONFIG } from '../types/index.js';

/**
 * Default phase timing configuration
 */
export const DEFAULT_PHASE_TIMING: PhaseTiming =
  DEFAULT_SIMULATION_CONFIG.gameRules.timing;

/**
 * Game clock for managing match phases and timing
 */
export class GameClock {
  private timing: PhaseTiming;
  private tickRate: number;
  private currentTick: number = 0;
  private currentPhase: MatchPhase = MatchPhase.PRE_MATCH;
  private phaseStartTick: number = 0;

  constructor(timing: PhaseTiming = DEFAULT_PHASE_TIMING, tickRate: number = 60) {
    this.timing = timing;
    this.tickRate = tickRate;
  }

  /**
   * Get current tick
   */
  get tick(): number {
    return this.currentTick;
  }

  /**
   * Get current phase
   */
  get phase(): MatchPhase {
    return this.currentPhase;
  }

  /**
   * Get elapsed time in seconds
   */
  get elapsedTime(): number {
    return this.currentTick / this.tickRate;
  }

  /**
   * Get time remaining in current phase
   */
  get phaseTimeRemaining(): number {
    const elapsed = (this.currentTick - this.phaseStartTick) / this.tickRate;
    const phaseDuration = this.getPhaseDuration(this.currentPhase);
    return Math.max(0, phaseDuration - elapsed);
  }

  /**
   * Get current shift number (1-4) or null if not in a shift
   */
  get currentShift(): number | null {
    switch (this.currentPhase) {
      case MatchPhase.SHIFT_1:
        return 1;
      case MatchPhase.SHIFT_2:
        return 2;
      case MatchPhase.SHIFT_3:
        return 3;
      case MatchPhase.SHIFT_4:
        return 4;
      default:
        return null;
    }
  }

  /**
   * Start the match
   */
  startMatch(): void {
    this.currentTick = 0;
    this.currentPhase = MatchPhase.AUTO;
    this.phaseStartTick = 0;
  }

  /**
   * Advance the clock by one tick
   * Returns the new phase if it changed, null otherwise
   */
  tick_forward(): MatchPhase | null {
    if (
      this.currentPhase === MatchPhase.PRE_MATCH ||
      this.currentPhase === MatchPhase.POST_MATCH
    ) {
      return null;
    }

    this.currentTick++;

    const phaseElapsed = (this.currentTick - this.phaseStartTick) / this.tickRate;
    const phaseDuration = this.getPhaseDuration(this.currentPhase);

    if (phaseElapsed >= phaseDuration) {
      return this.advancePhase();
    }

    return null;
  }

  /**
   * Advance to the next phase
   */
  private advancePhase(): MatchPhase {
    this.phaseStartTick = this.currentTick;

    switch (this.currentPhase) {
      case MatchPhase.AUTO:
        this.currentPhase = MatchPhase.TRANSITION;
        break;
      case MatchPhase.TRANSITION:
        this.currentPhase = MatchPhase.SHIFT_1;
        break;
      case MatchPhase.SHIFT_1:
        this.currentPhase = MatchPhase.SHIFT_2;
        break;
      case MatchPhase.SHIFT_2:
        this.currentPhase = MatchPhase.SHIFT_3;
        break;
      case MatchPhase.SHIFT_3:
        this.currentPhase = MatchPhase.SHIFT_4;
        break;
      case MatchPhase.SHIFT_4:
        this.currentPhase = MatchPhase.ENDGAME;
        break;
      case MatchPhase.ENDGAME:
        this.currentPhase = MatchPhase.POST_MATCH;
        break;
      default:
        break;
    }

    return this.currentPhase;
  }

  /**
   * Get duration of a phase in seconds
   */
  getPhaseDuration(phase: MatchPhase): number {
    switch (phase) {
      case MatchPhase.AUTO:
        return this.timing.auto;
      case MatchPhase.TRANSITION:
        return this.timing.transition;
      case MatchPhase.SHIFT_1:
        return this.timing.shift1;
      case MatchPhase.SHIFT_2:
        return this.timing.shift2;
      case MatchPhase.SHIFT_3:
        return this.timing.shift3;
      case MatchPhase.SHIFT_4:
        return this.timing.shift4;
      case MatchPhase.ENDGAME:
        return this.timing.endgame;
      default:
        return 0;
    }
  }

  /**
   * Get total match duration in seconds
   */
  getTotalMatchDuration(): number {
    return (
      this.timing.auto +
      this.timing.transition +
      this.timing.shift1 +
      this.timing.shift2 +
      this.timing.shift3 +
      this.timing.shift4 +
      this.timing.endgame
    );
  }

  /**
   * Check if match is in progress
   */
  isMatchInProgress(): boolean {
    return (
      this.currentPhase !== MatchPhase.PRE_MATCH &&
      this.currentPhase !== MatchPhase.POST_MATCH
    );
  }

  /**
   * Check if match has ended
   */
  isMatchEnded(): boolean {
    return this.currentPhase === MatchPhase.POST_MATCH;
  }

  /**
   * Check if currently in autonomous
   */
  isAuto(): boolean {
    return this.currentPhase === MatchPhase.AUTO;
  }

  /**
   * Check if currently in a shift phase (1-4)
   */
  isShift(): boolean {
    return (
      this.currentPhase === MatchPhase.SHIFT_1 ||
      this.currentPhase === MatchPhase.SHIFT_2 ||
      this.currentPhase === MatchPhase.SHIFT_3 ||
      this.currentPhase === MatchPhase.SHIFT_4
    );
  }

  /**
   * Check if currently in teleop (shifts or endgame)
   */
  isTeleop(): boolean {
    return this.isShift() || this.currentPhase === MatchPhase.ENDGAME;
  }

  /**
   * Check if currently in endgame
   */
  isEndgame(): boolean {
    return this.currentPhase === MatchPhase.ENDGAME;
  }

  /**
   * Reset clock for a new match
   */
  reset(): void {
    this.currentTick = 0;
    this.currentPhase = MatchPhase.PRE_MATCH;
    this.phaseStartTick = 0;
  }
}
