import type {
  GameState,
  MatchResult,
  MatchSetup,
  Position,
  SimulationConfig,
  StrategyContext,
  RobotCommand,
} from '../types/index.js';
import {
  BallState,
  GameEventType,
  RobotActionType,
  SimulationMode,
  DEFAULT_SIMULATION_CONFIG,
  DecisionRejectionReason,
  EscapeStrategy,
  StrategyPriority,
} from '../types/index.js';
import { Ball } from '../ball/Ball.js';
import { updateBallPhysics, isInPickupRange, calculateShotVelocity } from '../ball/BallPhysics.js';
import { Match } from '../game/Match.js';
import { AStar } from '../pathfinding/AStar.js';
import { Robot } from '../robot/Robot.js';
import { updateRobotMovement, areRobotsColliding, separateRobots } from '../robot/Movement.js';
import type { Strategy, StrategyDecision } from '../types/strategy.js';
import type { EvaluatedAction } from '../types/valuation.js';
import { EventBus, SimulationEvents } from './EventBus.js';
import { MatchRecorder } from './MatchRecorder.js';
import { DecisionLogger, type ExecutionResult } from './DecisionLogger.js';
import { StuckHandler } from './StuckHandler.js';
import { ActionValuator } from '../strategy/ActionValuator.js';

/**
 * Fallback state for a robot's decision-making
 */
interface FallbackState {
  /** Ranked list of fallback actions */
  actions: EvaluatedAction[];
  /** Index of the next action to try */
  nextIndex: number;
  /** Tick when fallbacks were generated */
  generatedAtTick: number;
  /** IDs of targets that have been tried and failed */
  failedTargets: Set<string>;
}

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
  readonly decisionLogger: DecisionLogger;
  readonly stuckHandler: StuckHandler;
  readonly actionValuator: ActionValuator;

  private running: boolean = false;
  private tickTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Fallback decisions for each robot when primary decision is blocked */
  private fallbackStates: Map<string, FallbackState> = new Map();
  /** How long fallbacks remain valid (in ticks) */
  private readonly FALLBACK_VALIDITY_TICKS = 60; // 1 second

  constructor(setup: MatchSetup) {
    this.config = { ...DEFAULT_SIMULATION_CONFIG, ...setup.simulation };
    this.match = new Match(setup.field, this.config);
    this.events = new EventBus();
    this.recorder = new MatchRecorder();
    this.decisionLogger = new DecisionLogger({ enabled: this.config.recordEvents });
    this.stuckHandler = new StuckHandler();
    this.actionValuator = new ActionValuator();

    // Initialize field balls first, then robots (which add starting balls)
    this.match.initializeBalls();
    this.initializeRobots(setup);
    this.initializePathfinders();
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
    let startingBallId = 1;

    for (const robotSetup of setup.robots) {
      const alliance = robotSetup.alliance;
      const positions = alliance === 'red' ? redPositions : bluePositions;
      const index = alliance === 'red' ? redIndex++ : blueIndex++;
      const position = positions[index % positions.length];
      const heading = alliance === 'red' ? 0 : 180;

      const robot = new Robot(robotSetup.config, alliance, position, heading);

      // Give robot starting balls - create actual Ball objects
      const numStartingBalls = Math.min(
        robotSetup.startingBalls ?? 0,
        robot.config.ballCapacity
      );
      for (let i = 0; i < numStartingBalls; i++) {
        const ballId = `starting-ball-${startingBallId++}`;
        // Create a real Ball object for the starting ball
        const ball = new Ball({
          id: ballId,
          state: BallState.HELD,
          position: { ...position }, // Start at robot position
          height: 0,
          velocity: { vx: 0, vy: 0, vz: 0 },
          heldByRobotId: robot.id,
          shotByRobotId: null,
          shotFromPosition: null,
          targetPosition: null,
          spawnPointId: `robot-start-${robot.id}`,
          alliance: null,
          lastUpdateTick: 0,
          claimedByRobotId: null,
          claimedAtTick: null,
        });
        this.match.addBall(ball);
        robot.pickUpBall(ballId);
      }

      robots.push(robot);
      this.robotStrategies.set(robot.id, robotSetup.strategy);
    }

    this.match.initializeRobots(robots);
  }

  /**
   * Initialize pathfinders for each robot size (height + width combination)
   */
  private initializePathfinders(): void {
    const robotSizes = new Set<string>();
    for (const robot of this.match.getRobots()) {
      robotSizes.add(`${robot.config.height}-${robot.config.width}`);
    }

    for (const sizeKey of robotSizes) {
      const [height, width] = sizeKey.split('-').map(Number);
      this.pathfinders.set(
        sizeKey,
        new AStar(this.match.field, { robotHeight: height, robotWidth: width })
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
    const key = `${robot.config.height}-${robot.config.width}`;
    return this.pathfinders.get(key) ?? new AStar(this.match.field, {
      robotHeight: robot.config.height,
      robotWidth: robot.config.width,
    });
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
    this.decisionLogger.initializeLogFile(); // Wipe and initialize log file
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

    // Handle robot-ball collisions (push balls out of the way)
    this.handleRobotBallCollisions();

    // Handle ball-ball collisions (prevent overlapping)
    this.handleBallBallCollisions();

    // Update ball physics
    this.updateBalls(deltaTime);

    // Process ball respawns
    this.match.processBallRespawns();

    // Expire old ball claims
    this.expireBallClaims();

    // Process pickups
    this.processPickups();

    // Process secondary pickups (pickup while shooting)
    this.processSecondaryPickups(deltaTime);

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

  // Track when robots last replanned to avoid constant replanning
  private lastReplanTick: Map<string, number> = new Map();
  private lastPhase: string = '';
  private minReplanInterval: number = 30; // Minimum ticks between replans (0.5 seconds)

  /**
   * Check if a robot needs to replan
   */
  private needsReplan(robot: Robot): boolean {
    // Climbed robots (endgame) don't need to replan - they're done
    if (robot.hasClimbed) {
      return false;
    }

    // Always replan if idle
    if (robot.isIdle()) return true;

    // Check if phase changed (scoring opportunities may have changed)
    const currentPhase = this.match.clock.phase;
    if (currentPhase !== this.lastPhase) {
      return true;
    }

    // Check if stuck (but not for climbing robots - they're doing a mission)
    if (robot.currentAction.type !== RobotActionType.CLIMBING &&
        this.stuckHandler.isStuck(robot.id)) {
      return true;
    }

    // Check if target ball is still available (for pickup-related movement)
    if (this.isTargetBallInvalid(robot)) {
      return true;
    }

    // Check minimum interval since last replan
    const lastReplan = this.lastReplanTick.get(robot.id) ?? 0;
    const ticksSinceReplan = this.match.clock.tick - lastReplan;
    if (ticksSinceReplan < this.minReplanInterval) {
      return false;
    }

    // For moving robots, check if their target is still valid
    if (robot.isMoving()) {
      // Don't interrupt movement unless there's a good reason
      // The path is already computed and being followed
      return false;
    }

    // For robots in the middle of an action (shooting, picking up, climbing), don't interrupt
    if (robot.currentAction.type !== RobotActionType.IDLE &&
        robot.currentAction.type !== RobotActionType.MOVING) {
      return false;
    }

    return false;
  }

  /**
   * Check if the robot's target ball is no longer available
   */
  private isTargetBallInvalid(robot: Robot): boolean {
    const action = robot.currentAction;

    // Check if robot was going to pick up a ball
    if (action.targetBallId || action.targetBallIds) {
      const ballIds = action.targetBallIds ?? (action.targetBallId ? [action.targetBallId] : []);

      for (const ballId of ballIds) {
        const ball = this.match.getBall(ballId);
        // Ball is invalid if it doesn't exist, is held by someone else, or is scored
        if (!ball || !ball.isAvailable()) {
          // Check if it's held by THIS robot (that's fine)
          if (ball && ball.isHeld() && ball.data.heldByRobotId === robot.id) {
            continue;
          }
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Update all robot strategies
   */
  private updateStrategies(): void {
    // Track phase changes
    const currentPhase = this.match.clock.phase;
    const phaseChanged = currentPhase !== this.lastPhase;
    this.lastPhase = currentPhase;

    for (const robot of this.match.getRobots()) {
      if (robot.isDisabled) continue;

      // Skip climbed robots entirely - they're done for the match
      if (robot.hasClimbed) {
        this.stuckHandler.clearState(robot.id); // Clear any stuck tracking
        continue;
      }

      // Skip strategy update if robot doesn't need replanning
      if (!this.needsReplan(robot) && !phaseChanged) {
        continue;
      }

      const strategyId = this.robotStrategies.get(robot.id);
      if (!strategyId) continue;

      const strategy = this.strategies.get(strategyId);
      if (!strategy) continue;

      const context = this.buildStrategyContext(robot);
      const decision = strategy.decide(context);

      // Record replan time
      this.lastReplanTick.set(robot.id, this.match.clock.tick);

      // Execute command and track result
      let result = this.executeCommandWithTracking(robot, decision.command);

      // Log the primary decision
      this.decisionLogger.logDecision(
        this.match.clock.tick,
        robot.cloneState(),
        strategyId,
        decision,
        result
      );

      // If primary decision failed with a blockable reason, try fallbacks
      if (!result.executed && this.isBlockableRejection(result.reason)) {
        const fallbackResult = this.tryFallbackDecisions(robot, context, strategyId, decision);
        if (fallbackResult) {
          result = fallbackResult;
        }
      }

      // Clear fallbacks on successful execution
      if (result.executed) {
        this.clearFallbackState(robot.id);
      }

      // Emit events for rejected decisions
      if (!result.executed && result.reason) {
        this.events.emit(SimulationEvents.DECISION_REJECTED, {
          robotId: robot.id,
          reason: result.reason,
          decision: {
            commandType: decision.command.type,
            reason: decision.reason,
          },
        });
      }
    }
  }

  /**
   * Check if a rejection reason means we should try fallbacks
   */
  private isBlockableRejection(reason?: DecisionRejectionReason): boolean {
    if (!reason) return false;
    return [
      DecisionRejectionReason.NO_PATH_FOUND,
      DecisionRejectionReason.BALL_NOT_AVAILABLE,
      DecisionRejectionReason.NOT_IN_CLIMB_ZONE,
    ].includes(reason);
  }

  /**
   * Try fallback decisions when primary decision is blocked
   */
  private tryFallbackDecisions(
    robot: Robot,
    context: StrategyContext,
    strategyId: string,
    primaryDecision: StrategyDecision
  ): ExecutionResult | null {
    const currentTick = this.match.clock.tick;
    let fallbackState = this.fallbackStates.get(robot.id);

    // Generate new fallbacks if needed
    if (!fallbackState ||
        currentTick - fallbackState.generatedAtTick > this.FALLBACK_VALIDITY_TICKS) {
      fallbackState = this.generateFallbacks(robot, context);
      this.fallbackStates.set(robot.id, fallbackState);
    }

    // Mark the primary decision's target as failed
    const primaryTargetId = this.getTargetId(primaryDecision);
    if (primaryTargetId) {
      fallbackState.failedTargets.add(primaryTargetId);
    }

    // Try each fallback action
    while (fallbackState.nextIndex < fallbackState.actions.length) {
      const action = fallbackState.actions[fallbackState.nextIndex];
      fallbackState.nextIndex++;

      // Skip if this target already failed
      if (action.targetId && fallbackState.failedTargets.has(action.targetId)) {
        continue;
      }

      // Skip IDLE actions (not useful as fallbacks)
      if (action.actionType === RobotActionType.IDLE) {
        continue;
      }

      // Convert to decision and try to execute
      const fallbackDecision = this.evaluatedActionToDecision(action);
      const result = this.executeCommandWithTracking(robot, fallbackDecision.command);

      // Log the fallback attempt
      this.decisionLogger.logDecision(
        currentTick,
        robot.cloneState(),
        `${strategyId}-fallback`,
        fallbackDecision,
        result
      );

      if (result.executed) {
        return result;
      }

      // Mark this target as failed too
      if (action.targetId) {
        fallbackState.failedTargets.add(action.targetId);
      }
    }

    return null;
  }

  /**
   * Generate fallback actions for a robot
   */
  private generateFallbacks(_robot: Robot, context: StrategyContext): FallbackState {
    const actions = this.actionValuator.evaluateAllActions(context);

    return {
      actions,
      nextIndex: 0,
      generatedAtTick: this.match.clock.tick,
      failedTargets: new Set(),
    };
  }

  /**
   * Get target ID from a decision for deduplication
   */
  private getTargetId(decision: StrategyDecision): string | null {
    const cmd = decision.command;
    if (cmd.targetBallId) return `ball:${cmd.targetBallId}`;
    if (cmd.targetScoringZoneId) return `score:${cmd.targetScoringZoneId}`;
    if (cmd.targetPosition) return `pos:${Math.round(cmd.targetPosition.x)},${Math.round(cmd.targetPosition.y)}`;
    return null;
  }

  /**
   * Convert an evaluated action to a strategy decision
   */
  private evaluatedActionToDecision(action: EvaluatedAction): StrategyDecision {
    const command: RobotCommand = {
      type: action.actionType,
    };

    if (action.targetPosition) {
      command.targetPosition = action.targetPosition;
    }

    if (action.targetId) {
      switch (action.actionType) {
        case RobotActionType.PICKING_UP:
          command.targetBallId = action.targetId;
          break;
        case RobotActionType.SHOOTING:
          command.targetScoringZoneId = action.targetId;
          break;
        case RobotActionType.CLIMBING:
          if (action.targetId.startsWith('climb-level-')) {
            command.targetClimbLevel = parseInt(action.targetId.replace('climb-level-', ''));
            command.isAutoClimb = false;
          } else {
            command.isAutoClimb = true;
          }
          break;
      }
    }

    return {
      command,
      priority: StrategyPriority.MEDIUM,
      reason: `Fallback: ${action.explanation}`,
    };
  }

  /**
   * Clear fallback state for a robot
   */
  private clearFallbackState(robotId: string): void {
    this.fallbackStates.delete(robotId);
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
    const currentTick = this.match.clock.tick;

    // Get available balls and filter unclaimed ones for alliance coordination
    const availableBallObjects = this.match.getAvailableBalls();
    const availableBalls = availableBallObjects.map((b) => b.cloneData());

    // Get teammate IDs for claim checking
    const teammateIds = new Set(teammates.map(t => t.id));

    // Unclaimed balls: available and not claimed by a teammate (or claim expired)
    // A ball claimed by this robot counts as unclaimed for this robot
    const unclaimedBallObjects = availableBallObjects.filter((b) => {
      const claimingRobotId = b.getClaimingRobotId();
      if (claimingRobotId === null) return true; // Not claimed
      if (claimingRobotId === robot.id) return true; // Claimed by this robot
      if (!teammateIds.has(claimingRobotId)) return true; // Claimed by opponent (doesn't matter)
      if (b.isClaimExpired(currentTick)) return true; // Claim expired
      return false; // Claimed by a teammate
    });
    const unclaimedBalls = unclaimedBallObjects.map((b) => b.cloneData());

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

    // Find nearest unclaimed ball (for coordination)
    let nearestUnclaimedBall = null;
    let nearestUnclaimedBallDistance: number | null = null;
    for (const ball of unclaimedBalls) {
      const dist = robot.distanceTo(ball.position);
      if (nearestUnclaimedBallDistance === null || dist < nearestUnclaimedBallDistance) {
        nearestUnclaimedBallDistance = dist;
        nearestUnclaimedBall = ball;
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

    const allianceParity = robot.alliance === 'red' ? state.redParity : state.blueParity;
    const canScore = this.match.canAllianceScore(robot.alliance);

    // Count alliance climbs
    const allAllianceRobots = this.match.getRobotsByAlliance(robot.alliance);
    const allianceAutoClimbCount = allAllianceRobots.filter(r => r.hasAutoClimbed).length;
    const allianceEndgameClimbCount = allAllianceRobots.filter(r => r.hasClimbed).length;

    // Check if robot can auto-climb
    const canAutoClimb =
      robot.config.autoClimb &&
      !robot.hasAutoClimbed &&
      this.match.clock.isAuto() &&
      allianceAutoClimbCount < this.config.gameRules.maxAutoClimbers;

    // Check if alliance has climb slots available
    const allianceCanAutoClimb = allianceAutoClimbCount < this.config.gameRules.maxAutoClimbers;
    const allianceCanEndgameClimb = allianceEndgameClimbCount < this.config.gameRules.maxEndgameClimbers;

    // Check climbing zone proximity
    const isNearClimbingZone = this.match.field.isNearClimbingZone(robot.position, robot.alliance);

    // Find climbing zone center position for this alliance
    let climbingZonePosition = null;
    for (const zone of this.match.field.config.zones) {
      if (zone.type !== 'CLIMBING') continue;
      const isRedZone = zone.bounds.minX < this.match.field.config.width / 2;
      if ((robot.alliance === 'red' && isRedZone) || (robot.alliance === 'blue' && !isRedZone)) {
        climbingZonePosition = {
          x: (zone.bounds.minX + zone.bounds.maxX) / 2,
          y: (zone.bounds.minY + zone.bounds.maxY) / 2,
        };
        break;
      }
    }

    // Check shooting position quality
    const hasClearShotPath = nearestScoringTarget
      ? this.match.field.hasClearShotPath(robot.position, nearestScoringTarget.position)
      : false;
    const isGoodShootingPosition = this.match.field.isGoodShootingPosition(robot.position);
    const isOnOwnSide = this.match.field.isOnAllianceSide(robot.position, robot.alliance);
    const isInNoScoreZone = this.match.field.isInNoScoreZone(robot.position);

    return {
      gameState: state,
      robot: robot.cloneState(),
      field: this.match.field.config,
      teammates,
      opponents,
      availableBalls,
      unclaimedBalls,
      teammateBalls,
      scoringTargets,
      nearestBallDistance,
      nearestBall,
      nearestUnclaimedBallDistance,
      nearestUnclaimedBall,
      nearestScoringTargetDistance,
      nearestScoringTarget,
      inShootingRange,
      phase: this.match.clock.phase,
      phaseTimeRemaining: this.match.clock.phaseTimeRemaining,
      currentShift: this.match.clock.currentShift,
      allianceParity,
      canScore,
      canAutoClimb,
      allianceCanAutoClimb,
      allianceCanEndgameClimb,
      allianceAutoClimbCount,
      allianceEndgameClimbCount,
      isNearClimbingZone,
      climbingZonePosition,
      hasClearShotPath,
      isGoodShootingPosition,
      isOnOwnSide,
      isInNoScoreZone,
    };
  }

  /**
   * Execute a robot command and return tracking result
   */
  private executeCommandWithTracking(
    robot: Robot,
    command: RobotCommand
  ): ExecutionResult {
    if (robot.isDisabled) {
      return { executed: false, reason: DecisionRejectionReason.ROBOT_DISABLED };
    }

    // Check if robot is busy
    if (!robot.isIdle()) {
      // Allow certain action transitions
      if (robot.isMoving()) {
        if (command.type === RobotActionType.PICKING_UP || command.type === RobotActionType.SHOOTING) {
          // Continue with execution below
        } else {
          return { executed: false, reason: DecisionRejectionReason.ROBOT_BUSY };
        }
      } else {
        return { executed: false, reason: DecisionRejectionReason.ROBOT_BUSY };
      }
    }

    switch (command.type) {
      case RobotActionType.MOVING:
        if (!command.targetPosition) {
          return { executed: false, reason: DecisionRejectionReason.NO_TARGET_POSITION };
        }
        if (!robot.isIdle()) {
          return { executed: false, reason: DecisionRejectionReason.ROBOT_BUSY };
        }
        {
          const pathfinder = this.getPathfinder(robot);
          // Separate friendly and opponent robots for different obstacle radii
          const allOtherRobots = this.match
            .getRobots()
            .filter((r) => r.id !== robot.id && !r.hasClimbed);
          const friendlyPositions = allOtherRobots
            .filter((r) => r.alliance === robot.alliance)
            .map((r) => r.position);
          const opponentPositions = allOtherRobots
            .filter((r) => r.alliance !== robot.alliance)
            .map((r) => r.position);
          // Use larger bubble for friendly robots to prevent getting stuck on them
          pathfinder.setDynamicObstaclesWithAlliances(
            friendlyPositions,
            opponentPositions,
            robot.config.width * 1.5, // Friendly: 1.5x robot width
            robot.config.width        // Opponent: standard width
          );
          const result = pathfinder.findPath(robot.position, command.targetPosition);
          pathfinder.clearDynamicObstacles();

          if (!result.found) {
            return { executed: false, reason: DecisionRejectionReason.NO_PATH_FOUND };
          }
          robot.setPath(result.path);
          robot.startAction(command, this.match.clock.tick);
          return { executed: true };
        }

      case RobotActionType.SHOOTING:
        if (!robot.hasBalls()) {
          return { executed: false, reason: DecisionRejectionReason.NO_BALLS_TO_SHOOT };
        }
        if (!command.targetScoringZoneId) {
          return { executed: false, reason: DecisionRejectionReason.NO_TARGET_SCORING_ZONE };
        }
        if (!robot.isIdle() && !robot.isMoving()) {
          return { executed: false, reason: DecisionRejectionReason.ROBOT_BUSY };
        }
        // Interrupt movement if moving
        if (robot.isMoving()) {
          robot.completeAction();
        }
        robot.startAction(command, this.match.clock.tick);
        return { executed: true };

      case RobotActionType.PICKING_UP:
        if (!robot.canPickUpBall()) {
          return { executed: false, reason: DecisionRejectionReason.BALL_CAPACITY_FULL };
        }
        if (!command.targetBallId && !command.targetBallIds) {
          return { executed: false, reason: DecisionRejectionReason.NO_TARGET_BALL };
        }
        if (!robot.isIdle() && !robot.isMoving()) {
          return { executed: false, reason: DecisionRejectionReason.ROBOT_BUSY };
        }
        // Interrupt movement if moving
        if (robot.isMoving()) {
          robot.completeAction();
        }
        {
          const ballIds = command.targetBallIds ?? (command.targetBallId ? [command.targetBallId] : []);
          for (const ballId of ballIds) {
            const ballToClaim = this.match.getBall(ballId);
            if (ballToClaim) {
              ballToClaim.claim(robot.id, this.match.clock.tick);
            }
          }
          robot.startAction(command, this.match.clock.tick);
          return { executed: true };
        }

      case RobotActionType.CLIMBING:
        if (!this.match.field.isNearClimbingZone(robot.position, robot.alliance)) {
          return { executed: false, reason: DecisionRejectionReason.NOT_IN_CLIMB_ZONE };
        }
        if (command.isAutoClimb) {
          if (!robot.config.autoClimb) {
            return { executed: false, reason: DecisionRejectionReason.NO_AUTO_CLIMB_CAPABILITY };
          }
          if (!this.match.clock.isAuto()) {
            return { executed: false, reason: DecisionRejectionReason.WRONG_PHASE };
          }
          if (!this.match.scoring.canAutoClimb(robot.alliance)) {
            return { executed: false, reason: DecisionRejectionReason.CLIMB_SLOTS_FULL };
          }
          if (!robot.isIdle()) {
            return { executed: false, reason: DecisionRejectionReason.ROBOT_BUSY };
          }
          robot.startAction(command, this.match.clock.tick);
          return { executed: true };
        } else {
          if (!robot.config.canClimb) {
            return { executed: false, reason: DecisionRejectionReason.NO_CLIMB_CAPABILITY };
          }
          if (!this.match.clock.isEndgame()) {
            return { executed: false, reason: DecisionRejectionReason.WRONG_PHASE };
          }
          if (!this.match.scoring.canEndgameClimb(robot.alliance)) {
            return { executed: false, reason: DecisionRejectionReason.CLIMB_SLOTS_FULL };
          }
          if (!robot.isIdle()) {
            return { executed: false, reason: DecisionRejectionReason.ROBOT_BUSY };
          }
          robot.startAction(command, this.match.clock.tick);
          return { executed: true };
        }

      case RobotActionType.IDLE:
        if (robot.currentAction.type !== RobotActionType.IDLE) {
          robot.completeAction();
        }
        return { executed: true };

      default:
        return { executed: false, reason: DecisionRejectionReason.ROBOT_BUSY };
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

  // Legacy stuck tracking (now handled by StuckHandler)
  private lastPositions: Map<string, Position> = new Map();

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

    // Track last position for reference
    this.lastPositions.set(robot.id, { ...robot.position });

    // Use StuckHandler for stuck detection and escape
    const otherRobots = this.match.getRobots()
      .filter((r) => r.id !== robot.id)
      .map((r) => r.cloneState());

    const escapeAction = this.stuckHandler.update(
      robot.cloneState(),
      this.match.clock.tick,
      result.blocked,
      this.match.field,
      otherRobots
    );

    if (escapeAction) {
      // Emit stuck event
      if (this.stuckHandler.isStuck(robot.id)) {
        const stuckState = this.stuckHandler.getState(robot.id);
        this.events.emit(SimulationEvents.ROBOT_STUCK, {
          robotId: robot.id,
          stuckTicks: stuckState?.stuckTicks ?? 0,
          strategy: escapeAction.strategy,
        });
      }

      // Handle escape action
      this.handleEscapeAction(robot, escapeAction);
    }

    if (result.reachedTarget) {
      const nextTarget = robot.advancePath();
      if (!nextTarget) {
        robot.completeAction();
        this.stuckHandler.clearState(robot.id);
        this.events.emit(SimulationEvents.ROBOT_ARRIVED, { robotId: robot.id });
      }
    }
  }

  /**
   * Handle an escape action from the StuckHandler
   */
  private handleEscapeAction(
    robot: Robot,
    escapeAction: { strategy: EscapeStrategy; targetPosition?: Position; abandonCurrentAction: boolean }
  ): void {
    this.events.emit(SimulationEvents.ROBOT_ESCAPE, {
      robotId: robot.id,
      strategy: escapeAction.strategy,
    });

    if (escapeAction.abandonCurrentAction) {
      // Give up on current target entirely
      robot.completeAction();
      this.stuckHandler.clearState(robot.id);
      return;
    }

    switch (escapeAction.strategy) {
      case EscapeStrategy.REPATH:
        this.rePathRobot(robot);
        break;

      case EscapeStrategy.PERPENDICULAR_LEFT:
      case EscapeStrategy.PERPENDICULAR_RIGHT:
      case EscapeStrategy.BACKWARD:
      case EscapeStrategy.RANDOM_DIRECTION:
        if (escapeAction.targetPosition) {
          this.escapeToPosition(robot, escapeAction.targetPosition);
        }
        break;

      case EscapeStrategy.ABANDON_TARGET:
        robot.completeAction();
        this.stuckHandler.clearState(robot.id);
        break;
    }
  }

  /**
   * Escape to a specific position, then continue to original target
   */
  private escapeToPosition(robot: Robot, escapePosition: Position): void {
    const currentAction = robot.currentAction;
    if (currentAction.type !== RobotActionType.MOVING || !currentAction.targetPosition) {
      return;
    }

    const pathfinder = this.getPathfinder(robot);
    const originalTarget = currentAction.targetPosition;

    // Try to find path: current -> escape -> original target
    const toEscape = pathfinder.findPath(robot.position, escapePosition);
    if (toEscape.found && toEscape.path.length > 0) {
      const fromEscape = pathfinder.findPath(escapePosition, originalTarget);
      if (fromEscape.found && fromEscape.path.length > 0) {
        // Combine paths
        const combinedPath = [...toEscape.path, ...fromEscape.path.slice(1)];
        robot.setPath(combinedPath);
        return;
      }
    }

    // If escape path failed, mark strategy as failed and try repath
    this.stuckHandler.markStrategyFailed(
      robot.id,
      EscapeStrategy.PERPENDICULAR_LEFT // Mark as generic perpendicular failure
    );
    this.rePathRobot(robot);
  }

  /**
   * Attempt to re-path a stuck robot
   */
  private rePathRobot(robot: Robot): void {
    const currentAction = robot.currentAction;
    if (currentAction.type !== RobotActionType.MOVING || !currentAction.targetPosition) {
      robot.completeAction();
      return;
    }

    const pathfinder = this.getPathfinder(robot);

    // Separate friendly and opponent robots for different obstacle radii
    const allOtherRobots = this.match
      .getRobots()
      .filter((r) => r.id !== robot.id && !r.hasClimbed);
    const friendlyPositions = allOtherRobots
      .filter((r) => r.alliance === robot.alliance)
      .map((r) => r.position);
    const opponentPositions = allOtherRobots
      .filter((r) => r.alliance !== robot.alliance)
      .map((r) => r.position);
    // Use larger bubble for friendly robots
    pathfinder.setDynamicObstaclesWithAlliances(
      friendlyPositions,
      opponentPositions,
      robot.config.width * 1.5,
      robot.config.width
    );

    const result = pathfinder.findPath(robot.position, currentAction.targetPosition);
    pathfinder.clearDynamicObstacles();

    if (result.found && result.path.length > 0) {
      robot.setPath(result.path);
    } else {
      // Try again without dynamic obstacles (maybe can push through)
      const fallbackResult = pathfinder.findPath(robot.position, currentAction.targetPosition);
      if (fallbackResult.found && fallbackResult.path.length > 0) {
        robot.setPath(fallbackResult.path);
      } else {
        // Can't find a path - give up on this movement
        robot.completeAction();
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
      // Support multi-ball pickup
      const ballIds = robot.currentAction.targetBallIds ??
        (robot.currentAction.targetBallId ? [robot.currentAction.targetBallId] : []);

      for (const ballId of ballIds) {
        // Check if robot still has capacity
        if (!robot.canPickUpBall()) break;

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
    const isAutoClimb = robot.currentAction.isAutoClimb === true;

    // Check if climb is still valid - give up if conditions no longer met
    if (isAutoClimb) {
      // Auto climb requires: AUTO phase and available slots
      if (!this.match.clock.isAuto() || !this.match.scoring.canAutoClimb(robot.alliance)) {
        // Phase changed or slots filled - give up
        robot.completeAction();
        return;
      }
    } else {
      // Endgame climb requires: ENDGAME phase and available slots
      if (!this.match.clock.isEndgame() || !this.match.scoring.canEndgameClimb(robot.alliance)) {
        // Phase changed or slots filled - give up
        robot.completeAction();
        return;
      }
    }

    const climbTime = robot.config.climbUpTime;
    const progress = robot.currentAction.progress + deltaTime / climbTime;
    robot.updateProgress(progress);

    if (progress >= 1) {
      if (isAutoClimb) {
        // Auto climb: mark as auto climbed and record score
        robot.autoClimb();
        const result = this.match.recordAutoClimb(robot.id);
        if (result.success) {
          this.events.emit(SimulationEvents.ROBOT_CLIMB_SUCCESS, {
            robotId: robot.id,
            type: 'auto',
            points: result.points,
          });
        }
        // After auto climb, robot descends and continues playing
        // (hasAutoClimbed is set but hasClimbed is not, so robot can still move)
      } else {
        // Endgame climb: mark as climbed with level and record score
        const level = robot.currentAction.targetClimbLevel ?? robot.config.climbLevel;
        robot.endgameClimb(level);
        const result = this.match.recordEndgameClimb(robot.id, level);
        if (result.success) {
          this.events.emit(SimulationEvents.ROBOT_CLIMB_SUCCESS, {
            robotId: robot.id,
            type: 'endgame',
            level,
            points: result.points,
          });
        }
      }
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
          const { pos1, pos2 } = separateRobots(robots[i], robots[j], this.match.field);
          robots[i].setPosition(pos1);
          robots[j].setPosition(pos2);

          // StuckHandler will detect stuck status via position history tracking
          // Collisions that prevent movement will naturally show up as stuck

          this.events.emit(SimulationEvents.ROBOT_COLLISION, {
            robot1Id: robots[i].id,
            robot2Id: robots[j].id,
          });
        }
      }
    }
  }

  /**
   * Handle robot-ball collisions - push balls out of the way when robots drive into them
   */
  private handleRobotBallCollisions(): void {
    const robots = this.match.getRobots();
    const balls = this.match.getBalls();
    const ballRadius = this.config.ballPhysics.radius;

    for (const robot of robots) {
      if (robot.isDisabled || robot.hasClimbed) continue;

      // Calculate robot collision radius - must be smaller than pickup range (12") minus ball radius
      // so balls can get close enough to be collected before being pushed away
      // Use half the robot's length minus a buffer, capped to ensure it's smaller than pickup range
      const pickupRange = 12; // matches the pickup detection range
      const maxCollisionRadius = pickupRange - ballRadius - 1; // Must be smaller than pickup range
      const robotRadius = Math.min(robot.config.length / 2 - 4, maxCollisionRadius);

      for (const ball of balls) {
        // Only affect balls on the field (not held, in flight, or scored)
        if (!ball.isAvailable()) continue;

        const dx = ball.position.x - robot.position.x;
        const dy = ball.position.y - robot.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const collisionDistance = robotRadius + ballRadius;

        // Check if ball is within collision range
        if (distance < collisionDistance && distance > 0) {
          // Calculate push direction (away from robot)
          const pushDirX = dx / distance;
          const pushDirY = dy / distance;

          // Calculate overlap amount
          const overlap = collisionDistance - distance;

          // Push ball out of the way
          const pushSpeed = Math.max(50, robot.velocity * 0.5); // At least 50 in/s or half robot speed
          const newBallPos = {
            x: ball.position.x + pushDirX * (overlap + 5), // Push out plus buffer
            y: ball.position.y + pushDirY * (overlap + 5),
          };

          // Clamp to field bounds (ball radius away from walls)
          newBallPos.x = Math.max(ballRadius + 1, Math.min(this.match.field.config.width - ballRadius - 1, newBallPos.x));
          newBallPos.y = Math.max(ballRadius + 1, Math.min(this.match.field.config.height - ballRadius - 1, newBallPos.y));

          ball.setPosition(newBallPos);

          // Give ball some velocity in the push direction
          ball.setVelocity({
            vx: pushDirX * pushSpeed,
            vy: pushDirY * pushSpeed,
            vz: 0,
          });
        }
      }
    }
  }

  /**
   * Handle ball-ball collisions - push overlapping balls apart
   */
  private handleBallBallCollisions(): void {
    const balls = this.match.getBalls();
    const ballRadius = this.config.ballPhysics.radius;
    const minDistance = ballRadius * 2; // Minimum distance between ball centers
    const fieldWidth = this.match.field.config.width;
    const fieldHeight = this.match.field.config.height;

    // Check all pairs of available balls
    for (let i = 0; i < balls.length; i++) {
      const ballA = balls[i];
      if (!ballA.isAvailable()) continue;

      for (let j = i + 1; j < balls.length; j++) {
        const ballB = balls[j];
        if (!ballB.isAvailable()) continue;

        const dx = ballB.position.x - ballA.position.x;
        const dy = ballB.position.y - ballA.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If balls are overlapping (closer than minDistance)
        if (distance < minDistance && distance > 0) {
          // Calculate separation direction
          const nx = dx / distance;
          const ny = dy / distance;

          // Calculate how much to separate (half overlap each)
          const overlap = minDistance - distance;
          const separationAmount = (overlap / 2) + 0.5; // Small buffer

          // Move each ball away from the other
          const newPosA = {
            x: ballA.position.x - nx * separationAmount,
            y: ballA.position.y - ny * separationAmount,
          };
          const newPosB = {
            x: ballB.position.x + nx * separationAmount,
            y: ballB.position.y + ny * separationAmount,
          };

          // Clamp to field bounds
          newPosA.x = Math.max(ballRadius + 1, Math.min(fieldWidth - ballRadius - 1, newPosA.x));
          newPosA.y = Math.max(ballRadius + 1, Math.min(fieldHeight - ballRadius - 1, newPosA.y));
          newPosB.x = Math.max(ballRadius + 1, Math.min(fieldWidth - ballRadius - 1, newPosB.x));
          newPosB.y = Math.max(ballRadius + 1, Math.min(fieldHeight - ballRadius - 1, newPosB.y));

          ballA.setPosition(newPosA);
          ballB.setPosition(newPosB);

          // Transfer velocity between balls (simple elastic collision approximation)
          const velA = ballA.velocity;
          const velB = ballB.velocity;

          // Calculate relative velocity along normal
          const dvx = velA.vx - velB.vx;
          const dvy = velA.vy - velB.vy;
          const dvn = dvx * nx + dvy * ny;

          // Only separate if balls are approaching
          if (dvn > 0) {
            // Exchange velocity components along normal
            const impulseFactor = 0.8; // Coefficient of restitution
            const impulse = dvn * impulseFactor;

            ballA.setVelocity({
              vx: velA.vx - impulse * nx,
              vy: velA.vy - impulse * ny,
              vz: velA.vz,
            });
            ballB.setVelocity({
              vx: velB.vx + impulse * nx,
              vy: velB.vy + impulse * ny,
              vz: velB.vz,
            });
          }
        } else if (distance === 0) {
          // Balls are exactly at same position - push apart randomly
          const angle = Math.random() * Math.PI * 2;
          const offsetX = Math.cos(angle) * (minDistance / 2 + 1);
          const offsetY = Math.sin(angle) * (minDistance / 2 + 1);

          const newPosA = {
            x: Math.max(ballRadius + 1, Math.min(fieldWidth - ballRadius - 1, ballA.position.x - offsetX)),
            y: Math.max(ballRadius + 1, Math.min(fieldHeight - ballRadius - 1, ballA.position.y - offsetY)),
          };
          const newPosB = {
            x: Math.max(ballRadius + 1, Math.min(fieldWidth - ballRadius - 1, ballB.position.x + offsetX)),
            y: Math.max(ballRadius + 1, Math.min(fieldHeight - ballRadius - 1, ballB.position.y + offsetY)),
          };

          ballA.setPosition(newPosA);
          ballB.setPosition(newPosB);
        }
      }
    }
  }

  /**
   * Expire old ball claims (claims expire after 3 seconds)
   */
  private expireBallClaims(): void {
    const currentTick = this.match.clock.tick;
    const expirationTicks = 180; // 3 seconds at 60 ticks/sec

    for (const ball of this.match.getBalls()) {
      if (ball.isClaimed() && ball.isClaimExpired(currentTick, expirationTicks)) {
        ball.releaseClaim();
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
   * Calculate the maximum number of balls a robot can pick up at once
   * based on collection face size divided by ball size, minus 2
   */
  private getMaxBallsPerPickup(robot: Robot): number {
    const collectionFaceSize = robot.config.collectionFaceSize ?? robot.config.width;
    const ballDiameter = this.config.ballPhysics.radius * 2;
    const maxBalls = Math.floor(collectionFaceSize / ballDiameter) - 2;
    return Math.max(1, maxBalls); // At least 1 ball per pickup
  }

  /**
   * Process automatic ball pickups when robots are near available balls
   */
  private processPickups(): void {
    for (const robot of this.match.getRobots()) {
      if (!robot.canPickUpBall()) continue;

      // For idle robots, start a primary pickup action
      if (robot.isIdle()) {
        // Find all balls within pickup range
        const ballsInRange: string[] = [];
        for (const ball of this.match.getAvailableBalls()) {
          if (isInPickupRange(robot.position, ball.position, 12)) {
            ballsInRange.push(ball.id);
          }
        }

        if (ballsInRange.length > 0) {
          // Calculate how many balls can be picked up at once
          const maxPerPickup = this.getMaxBallsPerPickup(robot);
          const spaceAvailable = robot.config.ballCapacity - robot.heldBalls.length;
          const ballsToPickup = ballsInRange.slice(0, Math.min(maxPerPickup, spaceAvailable));

          if (ballsToPickup.length > 0) {
            // Claim all balls we're picking up
            for (const ballId of ballsToPickup) {
              const ball = this.match.getBall(ballId);
              if (ball) {
                ball.claim(robot.id, this.match.clock.tick);
              }
            }

            robot.startAction(
              {
                type: RobotActionType.PICKING_UP,
                targetBallId: ballsToPickup[0], // Primary target for compatibility
                targetBallIds: ballsToPickup,   // All balls being picked up
              },
              this.match.clock.tick
            );
          }
        }
      }
      // For moving or shooting robots, start a secondary pickup (pickup while doing other action)
      else if ((robot.isMoving() || robot.isShooting()) && !robot.hasSecondaryAction()) {
        for (const ball of this.match.getAvailableBalls()) {
          if (isInPickupRange(robot.position, ball.position, 12)) {
            robot.startSecondaryPickup(ball.id, this.match.clock.tick);
            break;
          }
        }
      }
    }
  }

  /**
   * Process secondary pickup actions (pickup while shooting)
   */
  private processSecondaryPickups(deltaTime: number): void {
    for (const robot of this.match.getRobots()) {
      if (!robot.hasSecondaryAction()) continue;

      const secondary = robot.secondaryAction;
      if (!secondary || secondary.type !== RobotActionType.PICKING_UP) continue;

      const progress = secondary.progress + deltaTime / robot.config.pickupTime;
      robot.updateSecondaryProgress(progress);

      if (progress >= 1) {
        const ballId = secondary.targetBallId;
        if (ballId) {
          const ball = this.match.getBall(ballId);
          // Use larger tolerance for completion check
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
        robot.completeSecondaryAction();
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

    // Write decision log stats
    this.decisionLogger.writeStatsFile();

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
