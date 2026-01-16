import type { GameEvent, GameState, MatchResult } from '../types/index.js';

/**
 * Recorded frame of game state
 */
export interface RecordedFrame {
  tick: number;
  state: GameState;
}

/**
 * Match recording
 */
export interface MatchRecording {
  startTime: number;
  endTime: number;
  frames: RecordedFrame[];
  events: GameEvent[];
  result: MatchResult | null;
}

/**
 * Match recorder for capturing simulation history
 */
export class MatchRecorder {
  private recording: MatchRecording;
  private isRecording: boolean = false;
  private recordInterval: number;
  private lastRecordedTick: number = -1;

  /**
   * @param recordInterval Record state every N ticks (1 = every tick)
   */
  constructor(recordInterval: number = 1) {
    this.recordInterval = recordInterval;
    this.recording = this.createEmptyRecording();
  }

  /**
   * Start recording
   */
  start(): void {
    this.recording = this.createEmptyRecording();
    this.recording.startTime = Date.now();
    this.isRecording = true;
    this.lastRecordedTick = -1;
  }

  /**
   * Stop recording
   */
  stop(result: MatchResult): void {
    this.recording.endTime = Date.now();
    this.recording.result = result;
    this.isRecording = false;
  }

  /**
   * Record a frame of game state
   */
  recordFrame(state: GameState): void {
    if (!this.isRecording) return;

    if (
      this.recordInterval === 1 ||
      state.tick - this.lastRecordedTick >= this.recordInterval
    ) {
      this.recording.frames.push({
        tick: state.tick,
        state: this.cloneState(state),
      });
      this.lastRecordedTick = state.tick;
    }
  }

  /**
   * Record a game event
   */
  recordEvent(event: GameEvent): void {
    if (!this.isRecording) return;
    this.recording.events.push({ ...event });
  }

  /**
   * Get the current recording
   */
  getRecording(): MatchRecording {
    return this.recording;
  }

  /**
   * Get frame at specific tick
   */
  getFrameAtTick(tick: number): RecordedFrame | null {
    // First try exact match
    const exact = this.recording.frames.find((f) => f.tick === tick);
    if (exact) return exact;

    // Otherwise find the latest frame before the tick
    let closest: RecordedFrame | null = null;
    for (const frame of this.recording.frames) {
      if (frame.tick <= tick) {
        closest = frame;
      } else {
        break;
      }
    }
    return closest;
  }

  /**
   * Get events in tick range
   */
  getEventsInRange(startTick: number, endTick: number): GameEvent[] {
    return this.recording.events.filter(
      (e) => e.tick >= startTick && e.tick <= endTick
    );
  }

  /**
   * Check if recording
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get total recorded frames
   */
  getFrameCount(): number {
    return this.recording.frames.length;
  }

  /**
   * Clear recording
   */
  clear(): void {
    this.recording = this.createEmptyRecording();
    this.isRecording = false;
    this.lastRecordedTick = -1;
  }

  /**
   * Export recording to JSON
   */
  toJSON(): string {
    return JSON.stringify(this.recording);
  }

  /**
   * Import recording from JSON
   */
  fromJSON(json: string): void {
    this.recording = JSON.parse(json);
    this.isRecording = false;
  }

  private createEmptyRecording(): MatchRecording {
    return {
      startTime: 0,
      endTime: 0,
      frames: [],
      events: [],
      result: null,
    };
  }

  private cloneState(state: GameState): GameState {
    return {
      ...state,
      robots: state.robots.map((r) => ({
        ...r,
        position: { ...r.position },
        heldBalls: [...r.heldBalls],
        currentAction: { ...r.currentAction },
        currentPath: r.currentPath.map((p) => ({ ...p })),
      })),
      balls: state.balls.map((b) => ({
        ...b,
        position: { ...b.position },
        velocity: { ...b.velocity },
        targetPosition: b.targetPosition ? { ...b.targetPosition } : null,
      })),
      score: {
        red: { ...state.score.red, breakdown: { ...state.score.red.breakdown } },
        blue: { ...state.score.blue, breakdown: { ...state.score.blue.breakdown } },
      },
      events: state.events.map((e) => ({ ...e })),
    };
  }
}
