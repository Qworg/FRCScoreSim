import { nanoid } from 'nanoid';
import type {
  FieldConfig,
  GameEvent,
  GameState,
  MatchResult,
  SimulationConfig,
} from '../types/index.js';
import {
  BallState,
  GameEventType,
  MatchPhase,
  DEFAULT_SIMULATION_CONFIG,
} from '../types/index.js';
import { Ball, createBall } from '../ball/Ball.js';
import { Field } from '../field/Field.js';
import { Robot } from '../robot/Robot.js';
import { GameClock } from './GameClock.js';
import { ScoringSystem } from './ScoringSystem.js';

/**
 * Match class for orchestrating a complete match
 */
export class Match {
  readonly field: Field;
  readonly clock: GameClock;
  readonly scoring: ScoringSystem;

  private robots: Robot[] = [];
  private balls: Ball[] = [];
  private events: GameEvent[] = [];
  private config: SimulationConfig;
  private paused: boolean = false;
  private ballRespawnTicks: Map<string, number> = new Map();

  constructor(fieldConfig: FieldConfig, config: SimulationConfig = DEFAULT_SIMULATION_CONFIG) {
    this.field = new Field(fieldConfig);
    this.clock = new GameClock(config.gameRules.timing, config.tickRate);
    this.scoring = new ScoringSystem(config.gameRules);
    this.config = config;
  }

  /**
   * Initialize robots for the match
   */
  initializeRobots(robots: Robot[]): void {
    this.robots = robots;
  }

  /**
   * Initialize balls on the field
   */
  initializeBalls(): void {
    this.balls = [];
    for (const spawnPoint of this.field.config.ballSpawnPoints) {
      const ball = new Ball(
        createBall(spawnPoint.id, spawnPoint.position, spawnPoint.alliance)
      );
      this.balls.push(ball);
    }
  }

  /**
   * Start the match
   */
  start(): void {
    this.clock.startMatch();
    this.addEvent(GameEventType.MATCH_START);
  }

  /**
   * Get all robots
   */
  getRobots(): Robot[] {
    return this.robots;
  }

  /**
   * Get robots by alliance
   */
  getRobotsByAlliance(alliance: 'red' | 'blue'): Robot[] {
    return this.robots.filter((r) => r.alliance === alliance);
  }

  /**
   * Get all balls
   */
  getBalls(): Ball[] {
    return this.balls;
  }

  /**
   * Get available balls (on field)
   */
  getAvailableBalls(): Ball[] {
    return this.balls.filter((b) => b.isAvailable());
  }

  /**
   * Get a ball by ID
   */
  getBall(id: string): Ball | undefined {
    return this.balls.find((b) => b.id === id);
  }

  /**
   * Get a robot by ID
   */
  getRobot(id: string): Robot | undefined {
    return this.robots.find((r) => r.id === id);
  }

  /**
   * Record a scoring event
   */
  recordScore(
    robotId: string,
    ballId: string,
    targetId: string
  ): number {
    const robot = this.getRobot(robotId);
    const target = this.field.config.scoringTargets.find((t) => t.id === targetId);

    if (!robot || !target) return 0;

    const points = this.scoring.recordScore(
      robot.alliance,
      target,
      this.clock.phase
    );

    this.addEvent(GameEventType.BALL_SCORED, {
      robotId,
      ballId,
      scoringTargetId: targetId,
      alliance: robot.alliance,
      points,
    });

    // Schedule ball respawn
    this.scheduleBallRespawn(ballId);

    return points;
  }

  /**
   * Record a missed shot
   */
  recordMiss(robotId: string, ballId: string, targetId: string): void {
    this.addEvent(GameEventType.BALL_MISSED, {
      robotId,
      ballId,
      scoringTargetId: targetId,
    });
  }

  /**
   * Record a climb
   */
  recordClimb(robotId: string): number {
    const robot = this.getRobot(robotId);
    if (!robot) return 0;

    const points = this.scoring.recordClimb(robot.alliance);

    this.addEvent(GameEventType.ROBOT_CLIMB_SUCCESS, {
      robotId,
      alliance: robot.alliance,
      points,
    });

    return points;
  }

  /**
   * Schedule a ball to respawn after delay
   */
  private scheduleBallRespawn(ballId: string): void {
    const respawnTick =
      this.clock.tick + this.config.ballPhysics.respawnDelay;
    this.ballRespawnTicks.set(ballId, respawnTick);
  }

  /**
   * Process ball respawns
   */
  processBallRespawns(): void {
    const currentTick = this.clock.tick;

    for (const [ballId, respawnTick] of this.ballRespawnTicks) {
      if (currentTick >= respawnTick) {
        const ball = this.getBall(ballId);
        if (ball && (ball.state === BallState.SCORED || ball.state === BallState.OUT_OF_BOUNDS)) {
          const spawnPoint = this.field.config.ballSpawnPoints.find(
            (sp) => sp.id === ball.data.spawnPointId
          );
          if (spawnPoint) {
            ball.respawn(spawnPoint.position, currentTick);
          }
        }
        this.ballRespawnTicks.delete(ballId);
      }
    }
  }

  /**
   * Add a game event
   */
  addEvent(
    type: GameEventType,
    details: Partial<Omit<GameEvent, 'id' | 'type' | 'tick' | 'timestamp' | 'phase'>> = {}
  ): GameEvent {
    const event: GameEvent = {
      id: nanoid(),
      type,
      tick: this.clock.tick,
      timestamp: Date.now(),
      phase: this.clock.phase,
      ...details,
    };

    if (this.config.recordEvents) {
      this.events.push(event);
    }

    return event;
  }

  /**
   * Handle phase change
   */
  handlePhaseChange(newPhase: MatchPhase): void {
    // Determine shift parity when leaving AUTO phase
    if (newPhase === MatchPhase.TRANSITION) {
      this.scoring.determineShiftParity();
    }

    this.addEvent(GameEventType.PHASE_CHANGE, {
      details: {
        newPhase,
        redParity: this.scoring.getShiftParity('red'),
        blueParity: this.scoring.getShiftParity('blue'),
      },
    });
  }

  /**
   * Check if an alliance can score during the current phase
   */
  canAllianceScore(alliance: 'red' | 'blue'): boolean {
    return this.scoring.canAllianceScore(alliance, this.clock.phase);
  }

  /**
   * Check if match is finished
   */
  isFinished(): boolean {
    return this.clock.isMatchEnded();
  }

  /**
   * Pause the match
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Resume the match
   */
  resume(): void {
    this.paused = false;
  }

  /**
   * Check if paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Get current game state
   */
  getState(): GameState {
    return {
      tick: this.clock.tick,
      elapsedTime: this.clock.elapsedTime,
      phase: this.clock.phase,
      phaseTimeRemaining: this.clock.phaseTimeRemaining,
      currentShift: this.clock.currentShift,
      redParity: this.scoring.getShiftParity('red'),
      blueParity: this.scoring.getShiftParity('blue'),
      robots: this.robots.map((r) => r.cloneState()),
      balls: this.balls.map((b) => b.cloneData()),
      score: this.scoring.cloneScore(),
      events: [], // Events from this tick only (populated during tick)
      paused: this.paused,
    };
  }

  /**
   * Get match result (call after match ends)
   */
  getResult(): MatchResult {
    return {
      score: this.scoring.cloneScore(),
      winner: this.scoring.getWinner(),
      events: [...this.events],
      totalTicks: this.clock.tick,
      totalTime: this.clock.elapsedTime,
    };
  }

  /**
   * Reset match for replay
   */
  reset(): void {
    this.clock.reset();
    this.scoring.reset();
    this.events = [];
    this.paused = false;
    this.ballRespawnTicks.clear();
  }
}
