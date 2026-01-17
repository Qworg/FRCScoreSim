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
  private ballRespawnTicks: Map<string, { tick: number; scoringTargetId: string | null }> = new Map();

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
   * Add a ball to the match (e.g., starting balls held by robots)
   */
  addBall(ball: Ball): void {
    this.balls.push(ball);
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

    // Schedule ball respawn from the scoring zone
    this.scheduleBallRespawn(ballId, targetId);

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
   * Record an auto climb (15 points)
   */
  recordAutoClimb(robotId: string): { success: boolean; points: number } {
    const robot = this.getRobot(robotId);
    if (!robot) return { success: false, points: 0 };

    const result = this.scoring.recordAutoClimb(robot.alliance);

    if (result.success) {
      this.addEvent(GameEventType.ROBOT_CLIMB_SUCCESS, {
        robotId,
        alliance: robot.alliance,
        points: result.points,
        details: { type: 'auto' },
      });
    }

    return result;
  }

  /**
   * Record an endgame climb (10 points per level)
   */
  recordEndgameClimb(robotId: string, level: number): { success: boolean; points: number } {
    const robot = this.getRobot(robotId);
    if (!robot) return { success: false, points: 0 };

    const result = this.scoring.recordEndgameClimb(robot.alliance, level);

    if (result.success) {
      this.addEvent(GameEventType.ROBOT_CLIMB_SUCCESS, {
        robotId,
        alliance: robot.alliance,
        points: result.points,
        details: { type: 'endgame', level },
      });
    }

    return result;
  }

  /**
   * @deprecated Use recordAutoClimb or recordEndgameClimb instead
   * Record a climb (legacy method)
   */
  recordClimb(robotId: string): number {
    const result = this.recordEndgameClimb(robotId, 1);
    return result.points;
  }

  /**
   * Schedule a ball to respawn after delay
   */
  private scheduleBallRespawn(ballId: string, scoringTargetId: string | null = null): void {
    const respawnTick =
      this.clock.tick + this.config.ballPhysics.respawnDelay;
    this.ballRespawnTicks.set(ballId, { tick: respawnTick, scoringTargetId });
  }

  /**
   * Process ball respawns
   */
  processBallRespawns(): void {
    const currentTick = this.clock.tick;
    const fieldCenterX = this.field.config.width / 2; // 324

    for (const [ballId, respawnData] of this.ballRespawnTicks) {
      if (currentTick >= respawnData.tick) {
        const ball = this.getBall(ballId);
        if (ball && (ball.state === BallState.SCORED || ball.state === BallState.OUT_OF_BOUNDS)) {
          // If scored, respawn from scoring zone face
          if (ball.state === BallState.SCORED && respawnData.scoringTargetId) {
            this.respawnFromScoringZone(ball, respawnData.scoringTargetId, currentTick, fieldCenterX);
          } else {
            // Out of bounds - respawn at original spawn point
            const spawnPoint = this.field.config.ballSpawnPoints.find(
              (sp) => sp.id === ball.data.spawnPointId
            );
            if (spawnPoint) {
              ball.respawn(spawnPoint.position, currentTick);
            }
          }
        }
        this.ballRespawnTicks.delete(ballId);
      }
    }
  }

  /**
   * Respawn a ball from a scoring zone with velocity towards center
   */
  private respawnFromScoringZone(
    ball: Ball,
    scoringTargetId: string,
    tick: number,
    fieldCenterX: number
  ): void {
    const target = this.field.config.scoringTargets.find(t => t.id === scoringTargetId);
    if (!target) {
      // Fallback to simple respawn
      ball.respawn({ x: fieldCenterX, y: this.field.config.height / 2 }, tick);
      return;
    }

    // Find the corresponding scoring zone (SCORING_ZONE type)
    // The scoring zones are the 47"×47" squares that block balls
    const scoringZones = this.field.config.zones.filter(
      z => z.type === 'SCORING_ZONE' && z.modifiers?.blocksBalls
    );

    // Find the zone closest to this target
    let closestZone = scoringZones[0];
    let closestDist = Infinity;
    for (const zone of scoringZones) {
      const zoneCenterX = (zone.bounds.minX + zone.bounds.maxX) / 2;
      const zoneCenterY = (zone.bounds.minY + zone.bounds.maxY) / 2;
      const dist = Math.abs(zoneCenterX - target.position.x) + Math.abs(zoneCenterY - target.position.y);
      if (dist < closestDist) {
        closestDist = dist;
        closestZone = zone;
      }
    }

    if (!closestZone) {
      ball.respawn({ x: fieldCenterX, y: this.field.config.height / 2 }, tick);
      return;
    }

    // Calculate exit position on the center-side face of the scoring zone
    const zoneCenterX = (closestZone.bounds.minX + closestZone.bounds.maxX) / 2;
    const zoneCenterY = (closestZone.bounds.minY + closestZone.bounds.maxY) / 2;
    const zoneHalfHeight = (closestZone.bounds.maxY - closestZone.bounds.minY) / 2;

    // Determine which side faces the center
    const isLeftSide = zoneCenterX < fieldCenterX;
    // Add offset to spawn ball clearly outside the scoring zone (5" buffer)
    const exitOffset = 5;
    const exitX = isLeftSide
      ? closestZone.bounds.maxX + exitOffset  // Exit from right face (towards center)
      : closestZone.bounds.minX - exitOffset; // Exit from left face (towards center)

    // Random Y position along the face
    const exitY = zoneCenterY + (Math.random() - 0.5) * zoneHalfHeight * 1.5;

    // Exit height is 30.13 inches
    const exitHeight = 30.13;

    // Random velocity within 30-degree cone towards center
    // Base direction: towards center (positive X for left side, negative X for right side)
    const baseAngle = isLeftSide ? 0 : Math.PI; // 0 = right, PI = left

    // Random angle within ±30 degrees (±PI/6 radians)
    const coneHalfAngle = Math.PI / 6; // 30 degrees
    const randomAngle = baseAngle + (Math.random() - 0.5) * 2 * coneHalfAngle;

    // Slow speed - ball just rolls out of hub (20-35 in/s)
    const speed = 20 + Math.random() * 15;

    // Calculate velocity components
    const vx = Math.cos(randomAngle) * speed;
    const vy = Math.sin(randomAngle) * speed;

    // Small downward velocity (ball drops from 30.13" height)
    const vz = -10 + Math.random() * 5; // Gentle drop, varies -10 to -5 in/s

    ball.respawnWithVelocity(
      { x: exitX, y: exitY },
      exitHeight,
      { vx, vy, vz },
      tick
    );
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
      redRP: this.scoring.calculateRankingPoints('red'),
      blueRP: this.scoring.calculateRankingPoints('blue'),
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
