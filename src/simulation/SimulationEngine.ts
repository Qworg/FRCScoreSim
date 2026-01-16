import type {
  GameState,
  MatchResult,
  MatchSetup,
  Position,
  SimulationConfig,
  StrategyContext,
} from '../types/index.js';
import {
  GameEventType,
  RobotActionType,
  SimulationMode,
  DEFAULT_SIMULATION_CONFIG,
} from '../types/index.js';
import { updateBallPhysics, isInPickupRange, calculateShotVelocity } from '../ball/BallPhysics.js';
import { Match } from '../game/Match.js';
import { AStar } from '../pathfinding/AStar.js';
import { Robot } from '../robot/Robot.js';
import { updateRobotMovement, areRobotsColliding, separateRobots } from '../robot/Movement.js';
import type { Strategy } from '../types/strategy.js';
import { EventBus, SimulationEvents } from './EventBus.js';
import { MatchRecorder } from './MatchRecorder.js';

/**
 * Simulation engine - core tick loop for the simulation
 */
export class SimulationEngine {
  private match: Match;
  private config: SimulationConfig;
  private pathfinders: Map<string, AStar> = new Map();
  private strategies: Map<string, Strategy> = new Map();
  private robotStrategies: Map<string, string> = new Map();

  readonly events: EventBus;
  readonly recorder: MatchRecorder;

  private running: boolean = false;
  private tickTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(setup: MatchSetup) {
    this.config = { ...DEFAULT_SIMULATION_CONFIG, ...setup.simulation };
    this.match = new Match(setup.field, this.config);
    this.events = new EventBus();
    this.recorder = new MatchRecorder();

    this.initializeRobots(setup);
    this.initializePathfinders();
    this.match.initializeBalls();
  }

  /**
   * Initialize robots from setup
   */
  private initializeRobots(setup: MatchSetup): void {
    const robots: Robot[] = [];
    const redPositions = this.match.field.getStartingPositions('red');
    const bluePositions = this.match.field.getStartingPositions('blue');

    let redIndex = 0;
    let blueIndex = 0;

    for (const robotSetup of setup.robots) {
      const alliance = robotSetup.alliance;
      const positions = alliance === 'red' ? redPositions : bluePositions;
      const index = alliance === 'red' ? redIndex++ : blueIndex++;
      const position = positions[index % positions.length];
      const heading = alliance === 'red' ? 0 : 180;

      const robot = new Robot(robotSetup.config, alliance, position, heading);
      robots.push(robot);

      this.robotStrategies.set(robot.id, robotSetup.strategy);
    }

    this.match.initializeRobots(robots);
  }

  /**
   * Initialize pathfinders for each robot height
   */
  private initializePathfinders(): void {
    const heights = new Set<number>();
    for (const robot of this.match.getRobots()) {
      heights.add(robot.config.height);
    }

    for (const height of heights) {
      this.pathfinders.set(
        height.toString(),
        new AStar(this.match.field, { robotHeight: height })
      );
    }
  }

  /**
   * Register a strategy
   */
  registerStrategy(strategy: Strategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  /**
   * Get pathfinder for a robot
   */
  private getPathfinder(robot: Robot): AStar {
    const key = robot.config.height.toString();
    return this.pathfinders.get(key) ?? new AStar(this.match.field);
  }

  /**
   * Get the match instance
   */
  getMatch(): Match {
    return this.match;
  }

  /**
   * Start the simulation
   */
  async start(): Promise<MatchResult> {
    this.running = true;
    this.match.start();
    this.recorder.start();
    this.events.emit(SimulationEvents.MATCH_START, { tick: 0 });

    if (this.config.mode === SimulationMode.HEADLESS) {
      return this.runHeadless();
    } else if (this.config.mode === SimulationMode.REALTIME) {
      return this.runRealtime();
    } else {
      // STEP mode - manual control
      return new Promise((resolve) => {
        this.events.once('manual_end', () => {
          resolve(this.endMatch());
        });
      });
    }
  }

  /**
   * Run in headless mode (as fast as possible)
   */
  private async runHeadless(): Promise<MatchResult> {
    while (this.running && !this.match.isFinished()) {
      this.tick();
    }
    return this.endMatch();
  }

  /**
   * Run in real-time mode
   */
  private runRealtime(): Promise<MatchResult> {
    return new Promise((resolve) => {
      const tickInterval = 1000 / this.config.tickRate;

      const scheduleNextTick = () => {
        if (!this.running || this.match.isFinished()) {
          resolve(this.endMatch());
          return;
        }

        if (!this.match.isPaused()) {
          this.tick();
        }

        this.tickTimeout = setTimeout(scheduleNextTick, tickInterval);
      };

      scheduleNextTick();
    });
  }

  /**
   * Perform a single simulation tick
   */
  tick(): void {
    const deltaTime = 1 / this.config.tickRate;

    // Advance game clock
    const newPhase = this.match.clock.tick_forward();
    if (newPhase) {
      this.match.handlePhaseChange(newPhase);
      this.events.emit(SimulationEvents.PHASE_CHANGE, { phase: newPhase });
    }

    // Update strategies and get commands
    this.updateStrategies();

    // Update robot movement
    this.updateRobots(deltaTime);

    // Handle robot collisions
    this.handleCollisions();

    // Update ball physics
    this.updateBalls(deltaTime);

    // Process ball respawns
    this.match.processBallRespawns();

    // Process pickups
    this.processPickups();

    // Record state
    const state = this.match.getState();
    this.recorder.recordFrame(state);
    this.events.emit(SimulationEvents.TICK, { tick: state.tick, state });
    this.events.emit(SimulationEvents.STATE_UPDATE, state);
  }

  /**
   * Manual tick (for STEP mode)
   */
  step(): void {
    if (this.config.mode !== SimulationMode.STEP) return;
    this.tick();

    if (this.match.isFinished()) {
      this.events.emit('manual_end', {});
    }
  }

  /**
   * Update all robot strategies
   */
  private updateStrategies(): void {
    for (const robot of this.match.getRobots()) {
      if (robot.isDisabled) continue;

      const strategyId = this.robotStrategies.get(robot.id);
      if (!strategyId) continue;

      const strategy = this.strategies.get(strategyId);
      if (!strategy) continue;

      const context = this.buildStrategyContext(robot);
      const decision = strategy.decide(context);

      this.executeCommand(robot, decision.command);
    }
  }

  /**
   * Build strategy context for a robot
   */
  private buildStrategyContext(robot: Robot): StrategyContext {
    const state = this.match.getState();
    const teammates = this.match
      .getRobotsByAlliance(robot.alliance)
      .filter((r) => r.id !== robot.id)
      .map((r) => r.cloneState());
    const opponents = this.match
      .getRobotsByAlliance(robot.alliance === 'red' ? 'blue' : 'red')
      .map((r) => r.cloneState());
    const availableBalls = this.match
      .getAvailableBalls()
      .map((b) => b.cloneData());
    const teammateBalls = this.match
      .getBalls()
      .filter(
        (b) =>
          b.isHeld() &&
          teammates.some((t) => t.heldBalls.includes(b.id))
      )
      .map((b) => b.cloneData());
    const scoringTargets = this.match.field.getScoringTargets(robot.alliance);

    // Find nearest ball
    let nearestBall = null;
    let nearestBallDistance: number | null = null;
    for (const ball of availableBalls) {
      const dist = robot.distanceTo(ball.position);
      if (nearestBallDistance === null || dist < nearestBallDistance) {
        nearestBallDistance = dist;
        nearestBall = ball;
      }
    }

    // Find nearest scoring target
    let nearestScoringTarget = null;
    let nearestScoringTargetDistance: number | null = null;
    for (const target of scoringTargets) {
      const dist = robot.distanceTo(target.position);
      if (
        nearestScoringTargetDistance === null ||
        dist < nearestScoringTargetDistance
      ) {
        nearestScoringTargetDistance = dist;
        nearestScoringTarget = target;
      }
    }

    const inShootingRange =
      nearestScoringTargetDistance !== null &&
      nearestScoringTargetDistance <= robot.config.shootingRange;

    return {
      gameState: state,
      robot: robot.cloneState(),
      field: this.match.field.config,
      teammates,
      opponents,
      availableBalls,
      teammateBalls,
      scoringTargets,
      nearestBallDistance,
      nearestBall,
      nearestScoringTargetDistance,
      nearestScoringTarget,
      inShootingRange,
      phase: this.match.clock.phase,
      phaseTimeRemaining: this.match.clock.phaseTimeRemaining,
    };
  }

  /**
   * Execute a robot command
   */
  private executeCommand(
    robot: Robot,
    command: { type: RobotActionType; targetPosition?: Position; targetBallId?: string; targetScoringZoneId?: string }
  ): void {
    if (robot.isDisabled) return;

    // Allow certain action transitions
    if (!robot.isIdle()) {
      // Allow transitioning from MOVING to PICKING_UP or SHOOTING when in range
      if (robot.isMoving()) {
        if (command.type === RobotActionType.PICKING_UP || command.type === RobotActionType.SHOOTING) {
          // Interrupt movement to pick up ball or shoot
          robot.completeAction();
        } else {
          return;
        }
      } else {
        return;
      }
    }

    switch (command.type) {
      case RobotActionType.MOVING:
        if (command.targetPosition && robot.isIdle()) {
          const pathfinder = this.getPathfinder(robot);
          const result = pathfinder.findPath(robot.position, command.targetPosition);
          if (result.found) {
            robot.setPath(result.path);
            robot.startAction(command, this.match.clock.tick);
          }
        }
        break;

      case RobotActionType.SHOOTING:
        if (robot.hasBalls() && command.targetScoringZoneId && robot.isIdle()) {
          robot.startAction(command, this.match.clock.tick);
        }
        break;

      case RobotActionType.PICKING_UP:
        if (robot.canPickUpBall() && command.targetBallId && robot.isIdle()) {
          robot.startAction(command, this.match.clock.tick);
        }
        break;

      case RobotActionType.CLIMBING:
        if (robot.config.canClimb && this.match.clock.isEndgame() && robot.isIdle()) {
          robot.startAction(command, this.match.clock.tick);
        }
        break;

      case RobotActionType.IDLE:
        // Only go idle if explicitly commanded
        if (robot.currentAction.type !== RobotActionType.IDLE) {
          robot.completeAction();
        }
        break;
    }
  }

  /**
   * Update all robots
   */
  private updateRobots(deltaTime: number): void {
    for (const robot of this.match.getRobots()) {
      if (robot.isDisabled || robot.hasClimbed) continue;

      const action = robot.currentAction;

      switch (action.type) {
        case RobotActionType.MOVING:
          this.updateMovingRobot(robot, deltaTime);
          break;

        case RobotActionType.SHOOTING:
          this.updateShootingRobot(robot, deltaTime);
          break;

        case RobotActionType.PICKING_UP:
          this.updatePickingUpRobot(robot, deltaTime);
          break;

        case RobotActionType.CLIMBING:
          this.updateClimbingRobot(robot, deltaTime);
          break;
      }
    }
  }

  /**
   * Update robot movement along path
   */
  private updateMovingRobot(robot: Robot, deltaTime: number): void {
    const target = robot.getCurrentPathTarget();
    const result = updateRobotMovement(
      robot,
      target,
      this.match.field,
      deltaTime
    );

    robot.setPosition(result.position);
    robot.setHeading(result.heading);
    robot.setVelocity(result.velocity);

    if (result.reachedTarget) {
      const nextTarget = robot.advancePath();
      if (!nextTarget) {
        robot.completeAction();
        this.events.emit(SimulationEvents.ROBOT_ARRIVED, { robotId: robot.id });
      }
    }
  }

  /**
   * Update robot shooting action
   */
  private updateShootingRobot(robot: Robot, deltaTime: number): void {
    const progress = robot.currentAction.progress + deltaTime / robot.config.shootTime;
    robot.updateProgress(progress);

    if (progress >= 1) {
      const ballId = robot.shootBall();
      if (ballId) {
        const ball = this.match.getBall(ballId);
        const targetId = robot.currentAction.targetScoringZoneId;
        const target = this.match.field.config.scoringTargets.find(
          (t) => t.id === targetId
        );

        if (ball && target) {
          const velocity = calculateShotVelocity(
            robot.position,
            target.position,
            target.minHeight ?? 100
          );
          ball.shoot(
            robot.id,
            robot.position,
            target.position,
            velocity,
            this.match.clock.tick
          );

          // Determine if shot hits (based on accuracy)
          const hits = Math.random() < robot.config.shootingAccuracy;
          if (!hits) {
            // Perturb the velocity slightly
            ball.setVelocity({
              vx: velocity.vx * (0.8 + Math.random() * 0.4),
              vy: velocity.vy * (0.8 + Math.random() * 0.4),
              vz: velocity.vz * (0.8 + Math.random() * 0.2),
            });
          }

          this.events.emit(SimulationEvents.BALL_SHOT, {
            robotId: robot.id,
            ballId,
            targetId,
          });
        }
      }
      robot.completeAction();
    }
  }

  /**
   * Update robot pickup action
   */
  private updatePickingUpRobot(robot: Robot, deltaTime: number): void {
    const progress = robot.currentAction.progress + deltaTime / robot.config.pickupTime;
    robot.updateProgress(progress);

    if (progress >= 1) {
      const ballId = robot.currentAction.targetBallId;
      if (ballId) {
        const ball = this.match.getBall(ballId);
        // Use a larger tolerance (24") for completion check to account for collisions pushing robot
        if (ball && ball.isAvailable() && isInPickupRange(robot.position, ball.position, 24)) {
          ball.pickup(robot.id, this.match.clock.tick);
          robot.pickUpBall(ballId);

          this.match.addEvent(GameEventType.BALL_PICKED_UP, {
            robotId: robot.id,
            ballId,
            position: robot.position,
          });

          this.events.emit(SimulationEvents.BALL_PICKED_UP, {
            robotId: robot.id,
            ballId,
          });
        }
      }
      robot.completeAction();
    }
  }

  /**
   * Update robot climbing action
   */
  private updateClimbingRobot(robot: Robot, deltaTime: number): void {
    const climbTime = 3.0; // 3 seconds to climb
    const progress = robot.currentAction.progress + deltaTime / climbTime;
    robot.updateProgress(progress);

    if (progress >= 1) {
      robot.climb();
      this.match.recordClimb(robot.id);
      robot.completeAction();
    }
  }

  /**
   * Handle robot-robot collisions
   */
  private handleCollisions(): void {
    const robots = this.match.getRobots();

    for (let i = 0; i < robots.length; i++) {
      for (let j = i + 1; j < robots.length; j++) {
        if (areRobotsColliding(robots[i], robots[j])) {
          const { pos1, pos2 } = separateRobots(robots[i], robots[j]);
          robots[i].setPosition(pos1);
          robots[j].setPosition(pos2);

          this.events.emit(SimulationEvents.ROBOT_COLLISION, {
            robot1Id: robots[i].id,
            robot2Id: robots[j].id,
          });
        }
      }
    }
  }

  /**
   * Update all balls
   */
  private updateBalls(deltaTime: number): void {
    for (const ball of this.match.getBalls()) {
      if (ball.isHeld()) continue;

      const result = updateBallPhysics(
        ball,
        this.match.field,
        deltaTime,
        this.match.clock.tick,
        this.config.ballPhysics
      );

      if (result.scored && result.scoringTargetId && ball.data.shotByRobotId) {
        this.match.recordScore(
          ball.data.shotByRobotId,
          ball.id,
          result.scoringTargetId
        );
        this.events.emit(SimulationEvents.BALL_SCORED, {
          ballId: ball.id,
          targetId: result.scoringTargetId,
          robotId: ball.data.shotByRobotId,
        });
      }
    }
  }

  /**
   * Process automatic ball pickups when robots are near available balls
   */
  private processPickups(): void {
    // Only process for idle robots with capacity
    for (const robot of this.match.getRobots()) {
      if (!robot.isIdle() || !robot.canPickUpBall()) continue;

      for (const ball of this.match.getAvailableBalls()) {
        if (isInPickupRange(robot.position, ball.position, 12)) {
          // Auto-start pickup action
          robot.startAction(
            { type: RobotActionType.PICKING_UP, targetBallId: ball.id },
            this.match.clock.tick
          );
          break;
        }
      }
    }
  }

  /**
   * End the match and return results
   */
  private endMatch(): MatchResult {
    this.running = false;
    if (this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.tickTimeout = null;
    }

    this.match.addEvent(GameEventType.MATCH_END);
    const result = this.match.getResult();
    this.recorder.stop(result);

    this.events.emit(SimulationEvents.MATCH_END, { result });
    return result;
  }

  /**
   * Stop the simulation
   */
  stop(): void {
    this.running = false;
    if (this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.tickTimeout = null;
    }
  }

  /**
   * Pause the simulation
   */
  pause(): void {
    this.match.pause();
  }

  /**
   * Resume the simulation
   */
  resume(): void {
    this.match.resume();
  }

  /**
   * Get current game state
   */
  getState(): GameState {
    return this.match.getState();
  }

  /**
   * Check if simulation is running
   */
  isRunning(): boolean {
    return this.running;
  }
}
