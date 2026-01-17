/**
 * WorldServer - Central game server for distributed robot simulation
 *
 * The WorldServer orchestrates the distributed simulation by:
 * - Accepting connections from robot clients (MessagePack) and visualization clients (JSON)
 * - Managing the game clock, physics, and scoring
 * - Broadcasting world state to all robots each tick
 * - Waiting for robot commands with timeout handling
 * - Executing physics and updating state
 */

import { WebSocket, WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import type {
  GameState,
  MatchResult,
  MatchSetup,
  RobotCommand,
} from '../types/index.js';
import {
  RobotActionType,
  DEFAULT_SIMULATION_CONFIG,
} from '../types/index.js';
import type {
  DistributedConfig,
  WireRobotCommand,
  WireMessage,
  ClientHelloPayload,
} from '../types/distributed.js';
import {
  DistributedMessageType,
  DEFAULT_DISTRIBUTED_CONFIG,
  PROTOCOL_VERSION,
  wireToRobotAction,
} from '../types/distributed.js';
import { Match } from '../game/Match.js';
import { Robot } from '../robot/Robot.js';
import { Ball } from '../ball/Ball.js';
import { AStar } from '../pathfinding/AStar.js';
import { updateRobotMovement, areRobotsColliding, separateRobots } from '../robot/Movement.js';
import { updateBallPhysics, isInPickupRange, calculateShotVelocity } from '../ball/BallPhysics.js';
import { EventBus, SimulationEvents } from '../simulation/EventBus.js';
import { TickBarrier, type BarrierResult } from './TickBarrier.js';
import { MessagePacker, ErrorCodes } from './MessagePacker.js';
import { BallState, GameEventType } from '../types/index.js';

/**
 * Connected robot client information
 */
interface RobotClient {
  ws: WebSocket;
  robotId: string;
  clientName?: string;
  protocolVersion: number;
  connectedAt: number;
  lastMessageAt: number;
}

/**
 * Connected visualization client information
 */
interface VisualizationClient {
  ws: WebSocket;
  connectedAt: number;
}

/**
 * WorldServer events
 */
export const WorldServerEvents = {
  ROBOT_CONNECTED: 'robot_connected',
  ROBOT_DISCONNECTED: 'robot_disconnected',
  TICK_COMPLETE: 'tick_complete',
  MATCH_READY: 'match_ready',
  MATCH_STARTED: 'match_started',
  MATCH_ENDED: 'match_ended',
} as const;

/**
 * WorldServer - Central game server for distributed simulation
 */
export class WorldServer {
  private match: Match;
  private config: DistributedConfig;
  private fieldId: string;

  private robotServer: WebSocketServer | null = null;
  private visualizationServer: WebSocketServer | null = null;

  private robotClients: Map<string, RobotClient> = new Map();
  private visualizationClients: Set<VisualizationClient> = new Set();

  private pathfinders: Map<string, AStar> = new Map();
  private tickBarrier: TickBarrier;

  readonly events: EventBus;

  private running: boolean = false;
  private tickTimeout: ReturnType<typeof setTimeout> | null = null;
  private tickRate: number;

  constructor(
    setup: MatchSetup,
    distributedConfig: Partial<DistributedConfig> = {}
  ) {
    this.config = { ...DEFAULT_DISTRIBUTED_CONFIG, ...distributedConfig };
    this.fieldId = nanoid(8);

    const simConfig = { ...DEFAULT_SIMULATION_CONFIG, ...setup.simulation };
    this.tickRate = simConfig.tickRate;

    this.match = new Match(setup.field, simConfig);
    this.events = new EventBus();

    // Initialize field balls first, then robots
    this.match.initializeBalls();
    this.initializeRobots(setup);
    this.initializePathfinders();

    // Create tick barrier with expected robot IDs
    const robotIds = this.match.getRobots().map(r => r.id);
    this.tickBarrier = new TickBarrier(robotIds, {
      timeoutMs: this.config.commandTimeoutMs,
      unresponsiveThreshold: this.config.unresponsiveTicks,
    });
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

      // Give robot starting balls
      const numStartingBalls = Math.min(
        robotSetup.startingBalls ?? 0,
        robot.config.ballCapacity
      );
      for (let i = 0; i < numStartingBalls; i++) {
        const ballId = `starting-ball-${startingBallId++}`;
        const ball = new Ball({
          id: ballId,
          state: BallState.HELD,
          position: { ...position },
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
    }

    this.match.initializeRobots(robots);
  }

  /**
   * Initialize pathfinders for each robot size
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
   * Start the server and begin accepting connections
   */
  async start(robotPort: number = 8081, visualizationPort: number = 8080): Promise<void> {
    // Start robot server
    await this.startRobotServer(robotPort);

    // Start visualization server
    await this.startVisualizationServer(visualizationPort);

    console.log(`WorldServer started:`);
    console.log(`  Robot clients: ws://localhost:${robotPort}`);
    console.log(`  Visualization: ws://localhost:${visualizationPort}`);
  }

  /**
   * Start the robot WebSocket server (MessagePack binary protocol)
   */
  private startRobotServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.robotServer = new WebSocketServer({ port });

        this.robotServer.on('connection', (ws) => this.handleRobotConnection(ws));
        this.robotServer.on('error', (error) => {
          console.error('Robot server error:', error);
        });

        this.robotServer.on('listening', () => {
          console.log(`Robot server listening on port ${port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Start the visualization WebSocket server (JSON protocol)
   */
  private startVisualizationServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.visualizationServer = new WebSocketServer({ port });

        this.visualizationServer.on('connection', (ws) =>
          this.handleVisualizationConnection(ws)
        );
        this.visualizationServer.on('error', (error) => {
          console.error('Visualization server error:', error);
        });

        this.visualizationServer.on('listening', () => {
          console.log(`Visualization server listening on port ${port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle new robot client connection
   */
  private handleRobotConnection(ws: WebSocket): void {
    console.log('Robot client connecting...');

    // Set binary type
    ws.binaryType = 'arraybuffer';

    ws.on('message', (data: Buffer | ArrayBuffer) => {
      try {
        const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        const message = MessagePacker.unpack(buffer);
        this.handleRobotMessage(ws, message);
      } catch (error) {
        console.error('Error processing robot message:', error);
        this.sendErrorToRobot(ws, ErrorCodes.INVALID_MESSAGE, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.handleRobotDisconnect(ws);
    });

    ws.on('error', (error) => {
      console.error('Robot WebSocket error:', error);
      this.handleRobotDisconnect(ws);
    });
  }

  /**
   * Handle message from robot client
   */
  private handleRobotMessage(ws: WebSocket, message: WireMessage): void {
    switch (message.type) {
      case DistributedMessageType.CLIENT_HELLO:
        this.handleClientHello(ws, message.payload as ClientHelloPayload);
        break;

      case DistributedMessageType.ROBOT_COMMAND:
        this.handleRobotCommand(ws, message);
        break;

      case DistributedMessageType.PING:
        ws.send(MessagePacker.createPong((message.payload as { timestamp: number }).timestamp));
        break;

      default:
        console.warn(`Unknown message type from robot: ${message.type}`);
    }
  }

  /**
   * Handle CLIENT_HELLO from robot
   */
  private handleClientHello(ws: WebSocket, payload: ClientHelloPayload): void {
    const { robotId, protocolVersion, clientName } = payload;

    // Check protocol version
    if (protocolVersion !== PROTOCOL_VERSION) {
      console.error(`Protocol mismatch: client ${protocolVersion}, server ${PROTOCOL_VERSION}`);
      this.sendErrorToRobot(
        ws,
        ErrorCodes.PROTOCOL_MISMATCH,
        `Protocol version mismatch. Expected ${PROTOCOL_VERSION}, got ${protocolVersion}`
      );
      ws.close();
      return;
    }

    // Check if robot exists in match
    const robot = this.match.getRobot(robotId);
    if (!robot) {
      console.error(`Unknown robot ID: ${robotId}`);
      this.sendErrorToRobot(ws, ErrorCodes.ROBOT_NOT_FOUND, `Robot ${robotId} not found in match`);
      ws.close();
      return;
    }

    // Check for duplicate connection
    if (this.robotClients.has(robotId)) {
      console.warn(`Duplicate connection for robot ${robotId}, closing old connection`);
      const oldClient = this.robotClients.get(robotId);
      oldClient?.ws.close();
    }

    // Register the client
    const client: RobotClient = {
      ws,
      robotId,
      clientName,
      protocolVersion,
      connectedAt: Date.now(),
      lastMessageAt: Date.now(),
    };
    this.robotClients.set(robotId, client);

    // Reset barrier status for this robot
    this.tickBarrier.resetRobotStatus(robotId);

    console.log(`Robot ${robotId} connected${clientName ? ` (${clientName})` : ''}`);

    // Send field configuration
    ws.send(MessagePacker.createFieldConfig(
      this.fieldId,
      this.match.field.config,
      this.tickRate,
      this.config.commandTimeoutMs
    ));

    // Emit event
    this.events.emit(WorldServerEvents.ROBOT_CONNECTED, { robotId, clientName });

    // Check if all robots connected
    this.checkMatchReady();
  }

  /**
   * Handle ROBOT_COMMAND from robot
   */
  private handleRobotCommand(ws: WebSocket, message: WireMessage): void {
    const command = MessagePacker.parseRobotCommand(message);

    // Find the client
    const client = Array.from(this.robotClients.values()).find(c => c.ws === ws);
    if (!client) {
      console.warn('Received command from unknown client');
      return;
    }

    client.lastMessageAt = Date.now();

    // Verify robot ID matches
    if (command.robotId !== client.robotId) {
      console.warn(`Robot ${client.robotId} sent command for ${command.robotId}`);
      return;
    }

    // Submit to tick barrier
    this.tickBarrier.receiveCommand(command.robotId, command);
  }

  /**
   * Handle robot client disconnect
   */
  private handleRobotDisconnect(ws: WebSocket): void {
    const client = Array.from(this.robotClients.entries()).find(([, c]) => c.ws === ws);
    if (client) {
      const [robotId] = client;
      this.robotClients.delete(robotId);
      console.log(`Robot ${robotId} disconnected`);
      this.events.emit(WorldServerEvents.ROBOT_DISCONNECTED, { robotId });
    }
  }

  /**
   * Send error message to robot client
   */
  private sendErrorToRobot(ws: WebSocket, code: number, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(MessagePacker.createError(code, message));
    }
  }

  /**
   * Handle new visualization client connection
   */
  private handleVisualizationConnection(ws: WebSocket): void {
    const client: VisualizationClient = {
      ws,
      connectedAt: Date.now(),
    };
    this.visualizationClients.add(client);
    console.log(`Visualization client connected. Total: ${this.visualizationClients.size}`);

    // Send current config
    const configMsg = JSON.stringify({
      type: 'config',
      data: {
        field: this.match.field.config,
        robots: this.match.getRobots().map(r => r.config),
      },
    });
    ws.send(configMsg);

    // Send current state
    const state = this.match.getState();
    ws.send(JSON.stringify({ type: 'state', tick: state.tick, data: state }));

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleVisualizationMessage(ws, message);
      } catch {
        console.error('Invalid visualization message');
      }
    });

    ws.on('close', () => {
      this.visualizationClients.delete(client);
      console.log(`Visualization client disconnected. Total: ${this.visualizationClients.size}`);
    });

    ws.on('error', (error) => {
      console.error('Visualization client error:', error);
      this.visualizationClients.delete(client);
    });
  }

  /**
   * Handle message from visualization client
   */
  private handleVisualizationMessage(ws: WebSocket, message: { type: string }): void {
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      case 'play':
        this.resume();
        break;
      case 'pause':
        this.pause();
        break;
      default:
        // Ignore unknown messages
        break;
    }
  }

  /**
   * Broadcast state to all visualization clients
   */
  private broadcastToVisualization(state: GameState): void {
    const message = JSON.stringify({ type: 'state', tick: state.tick, data: state });
    for (const client of this.visualizationClients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  /**
   * Check if all expected robots are connected
   */
  private checkMatchReady(): void {
    const expectedRobots = this.tickBarrier.getExpectedRobots();
    const connectedRobots = Array.from(this.robotClients.keys());

    const allConnected = expectedRobots.every(id => connectedRobots.includes(id));

    if (allConnected) {
      console.log('All robots connected, match ready to start');
      this.events.emit(WorldServerEvents.MATCH_READY, {
        connectedRobots,
      });
    } else {
      const missing = expectedRobots.filter(id => !connectedRobots.includes(id));
      console.log(`Waiting for robots: ${missing.join(', ')}`);
    }
  }

  /**
   * Start the match simulation
   */
  async startMatch(): Promise<MatchResult> {
    this.running = true;
    this.match.start();

    console.log('Match started');
    this.events.emit(WorldServerEvents.MATCH_STARTED, {});
    this.events.emit(SimulationEvents.MATCH_START, { tick: 0 });

    return this.runDistributedLoop();
  }

  /**
   * Run the distributed tick loop
   */
  private async runDistributedLoop(): Promise<MatchResult> {
    const tickInterval = 1000 / this.tickRate;

    while (this.running && !this.match.isFinished()) {
      const tickStart = Date.now();

      if (!this.match.isPaused()) {
        await this.tick();
      }

      // Wait for next tick
      const elapsed = Date.now() - tickStart;
      const sleepTime = Math.max(0, tickInterval - elapsed);
      if (sleepTime > 0) {
        await new Promise(resolve => setTimeout(resolve, sleepTime));
      }
    }

    return this.endMatch();
  }

  /**
   * Perform a single simulation tick
   */
  private async tick(): Promise<void> {
    const deltaTime = 1 / this.tickRate;
    const currentTick = this.match.clock.tick;

    // Advance game clock
    const newPhase = this.match.clock.tick_forward();
    if (newPhase) {
      this.match.handlePhaseChange(newPhase);
      this.events.emit(SimulationEvents.PHASE_CHANGE, { phase: newPhase });
    }

    // Begin tick and send world state to all robots
    this.tickBarrier.beginTick(currentTick);
    const deadline = Date.now() + this.config.commandTimeoutMs;

    await this.broadcastTickUpdate(deadline);

    // Wait for all robot commands
    const barrierResult = await this.tickBarrier.waitForAll();

    // Execute commands
    this.executeCommands(barrierResult);

    // Update robot movement
    this.updateRobots(deltaTime);

    // Handle collisions
    this.handleCollisions();
    this.handleRobotBallCollisions();
    this.handleBallBallCollisions();

    // Update ball physics
    this.updateBalls(deltaTime);

    // Process ball respawns
    this.match.processBallRespawns();

    // Process pickups
    this.processPickups();

    // Broadcast state to visualization
    const state = this.match.getState();
    this.broadcastToVisualization(state);
    this.events.emit(SimulationEvents.STATE_UPDATE, state);
    this.events.emit(WorldServerEvents.TICK_COMPLETE, { tick: currentTick });
  }

  /**
   * Broadcast tick update to all connected robots
   */
  private async broadcastTickUpdate(deadlineMs: number): Promise<void> {
    const state = this.match.getState();

    for (const [robotId, client] of this.robotClients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          const tickUpdate = MessagePacker.createTickUpdate(
            state,
            robotId,
            deadlineMs,
            this.fieldId
          );
          client.ws.send(tickUpdate);
        } catch (error) {
          console.error(`Failed to send tick update to robot ${robotId}:`, error);
        }
      }
    }
  }

  /**
   * Execute commands from barrier result
   */
  private executeCommands(barrierResult: BarrierResult): void {
    for (const [robotId, wireCommand] of barrierResult.commands) {
      const robot = this.match.getRobot(robotId);
      if (!robot || robot.isDisabled) continue;

      // Convert wire command to RobotCommand
      const command = wireCommand ? this.wireToCommand(wireCommand) : {
        type: RobotActionType.IDLE,
      };

      this.executeCommand(robot, command);
    }

    // Disable unresponsive robots
    for (const robotId of this.tickBarrier.getUnresponsiveRobots()) {
      const robot = this.match.getRobot(robotId);
      if (robot && !robot.isDisabled) {
        console.warn(`Robot ${robotId} marked as disabled due to unresponsiveness`);
        robot.disable();
      }
    }
  }

  /**
   * Convert wire command to RobotCommand
   */
  private wireToCommand(wire: WireRobotCommand): RobotCommand {
    return {
      type: wireToRobotAction(wire.action),
      targetPosition: wire.targetX !== null && wire.targetY !== null
        ? { x: wire.targetX, y: wire.targetY }
        : undefined,
      targetBallId: wire.targetBallId ?? undefined,
      targetScoringZoneId: wire.targetZoneId ?? undefined,
      targetClimbLevel: wire.climbLevel ?? undefined,
      isAutoClimb: wire.isAutoClimb,
    };
  }

  /**
   * Execute a robot command
   */
  private executeCommand(robot: Robot, command: RobotCommand): void {
    // Skip if robot is busy with non-interruptible action
    if (!robot.isIdle() && !robot.isMoving()) {
      return;
    }

    switch (command.type) {
      case RobotActionType.MOVING:
        if (command.targetPosition) {
          const pathfinder = this.getPathfinder(robot);
          const allOtherRobots = this.match.getRobots()
            .filter(r => r.id !== robot.id && !r.hasClimbed);
          const friendlyPositions = allOtherRobots
            .filter(r => r.alliance === robot.alliance)
            .map(r => r.position);
          const opponentPositions = allOtherRobots
            .filter(r => r.alliance !== robot.alliance)
            .map(r => r.position);
          pathfinder.setDynamicObstaclesWithAlliances(
            friendlyPositions,
            opponentPositions,
            robot.config.width * 1.5,
            robot.config.width
          );
          const result = pathfinder.findPath(robot.position, command.targetPosition);
          pathfinder.clearDynamicObstacles();

          if (result.found) {
            robot.setPath(result.path);
            robot.startAction(command, this.match.clock.tick);
          }
        }
        break;

      case RobotActionType.SHOOTING:
        if (robot.hasBalls() && command.targetScoringZoneId) {
          if (robot.isMoving()) {
            robot.completeAction();
          }
          robot.startAction(command, this.match.clock.tick);
        }
        break;

      case RobotActionType.PICKING_UP:
        if (robot.canPickUpBall() && command.targetBallId) {
          if (robot.isMoving()) {
            robot.completeAction();
          }
          const ball = this.match.getBall(command.targetBallId);
          if (ball) {
            ball.claim(robot.id, this.match.clock.tick);
          }
          robot.startAction(command, this.match.clock.tick);
        }
        break;

      case RobotActionType.CLIMBING:
        if (this.match.field.isNearClimbingZone(robot.position, robot.alliance)) {
          if (command.isAutoClimb) {
            if (robot.config.autoClimb &&
                this.match.clock.isAuto() &&
                this.match.scoring.canAutoClimb(robot.alliance)) {
              robot.startAction(command, this.match.clock.tick);
            }
          } else {
            if (robot.config.canClimb &&
                this.match.clock.isEndgame() &&
                this.match.scoring.canEndgameClimb(robot.alliance)) {
              robot.startAction(command, this.match.clock.tick);
            }
          }
        }
        break;

      case RobotActionType.IDLE:
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
    const result = updateRobotMovement(robot, target, this.match.field, deltaTime);

    robot.setPosition(result.position);
    robot.setHeading(result.heading);
    robot.setVelocity(result.velocity);

    if (result.reachedTarget) {
      const nextTarget = robot.advancePath();
      if (!nextTarget) {
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
        const target = this.match.field.config.scoringTargets.find(t => t.id === targetId);

        if (ball && target) {
          const velocity = calculateShotVelocity(
            robot.position,
            target.position,
            target.minHeight ?? 100
          );
          ball.shoot(robot.id, robot.position, target.position, velocity, this.match.clock.tick);

          const hits = Math.random() < robot.config.shootingAccuracy;
          if (!hits) {
            ball.setVelocity({
              vx: velocity.vx * (0.8 + Math.random() * 0.4),
              vy: velocity.vy * (0.8 + Math.random() * 0.4),
              vz: velocity.vz * (0.8 + Math.random() * 0.2),
            });
          }
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
        if (ball && ball.isAvailable() && isInPickupRange(robot.position, ball.position, 24)) {
          ball.pickup(robot.id, this.match.clock.tick);
          robot.pickUpBall(ballId);
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

    // Check if climb is still valid
    if (isAutoClimb) {
      if (!this.match.clock.isAuto() || !this.match.scoring.canAutoClimb(robot.alliance)) {
        robot.completeAction();
        return;
      }
    } else {
      if (!this.match.clock.isEndgame() || !this.match.scoring.canEndgameClimb(robot.alliance)) {
        robot.completeAction();
        return;
      }
    }

    const climbTime = robot.config.climbUpTime;
    const progress = robot.currentAction.progress + deltaTime / climbTime;
    robot.updateProgress(progress);

    if (progress >= 1) {
      if (isAutoClimb) {
        robot.autoClimb();
        this.match.recordAutoClimb(robot.id);
      } else {
        const level = robot.currentAction.targetClimbLevel ?? robot.config.climbLevel;
        robot.endgameClimb(level);
        this.match.recordEndgameClimb(robot.id, level);
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
        }
      }
    }
  }

  /**
   * Handle robot-ball collisions
   */
  private handleRobotBallCollisions(): void {
    const robots = this.match.getRobots();
    const balls = this.match.getBalls();
    const ballRadius = DEFAULT_SIMULATION_CONFIG.ballPhysics.radius;

    for (const robot of robots) {
      if (robot.isDisabled || robot.hasClimbed) continue;

      const pickupRange = 12;
      const maxCollisionRadius = pickupRange - ballRadius - 1;
      const robotRadius = Math.min(robot.config.length / 2 - 4, maxCollisionRadius);

      for (const ball of balls) {
        if (!ball.isAvailable()) continue;

        const dx = ball.position.x - robot.position.x;
        const dy = ball.position.y - robot.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const collisionDistance = robotRadius + ballRadius;

        if (distance < collisionDistance && distance > 0) {
          const pushDirX = dx / distance;
          const pushDirY = dy / distance;
          const overlap = collisionDistance - distance;
          const pushSpeed = Math.max(50, robot.velocity * 0.5);

          const newBallPos = {
            x: ball.position.x + pushDirX * (overlap + 5),
            y: ball.position.y + pushDirY * (overlap + 5),
          };

          newBallPos.x = Math.max(ballRadius + 1, Math.min(this.match.field.config.width - ballRadius - 1, newBallPos.x));
          newBallPos.y = Math.max(ballRadius + 1, Math.min(this.match.field.config.height - ballRadius - 1, newBallPos.y));

          ball.setPosition(newBallPos);
          ball.setVelocity({ vx: pushDirX * pushSpeed, vy: pushDirY * pushSpeed, vz: 0 });
        }
      }
    }
  }

  /**
   * Handle ball-ball collisions
   */
  private handleBallBallCollisions(): void {
    const balls = this.match.getBalls();
    const ballRadius = DEFAULT_SIMULATION_CONFIG.ballPhysics.radius;
    const minDistance = ballRadius * 2;
    const fieldWidth = this.match.field.config.width;
    const fieldHeight = this.match.field.config.height;

    for (let i = 0; i < balls.length; i++) {
      const ballA = balls[i];
      if (!ballA.isAvailable()) continue;

      for (let j = i + 1; j < balls.length; j++) {
        const ballB = balls[j];
        if (!ballB.isAvailable()) continue;

        const dx = ballB.position.x - ballA.position.x;
        const dy = ballB.position.y - ballA.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minDistance && distance > 0) {
          const nx = dx / distance;
          const ny = dy / distance;
          const separationAmount = (minDistance - distance) / 2 + 0.5;

          const newPosA = {
            x: Math.max(ballRadius + 1, Math.min(fieldWidth - ballRadius - 1, ballA.position.x - nx * separationAmount)),
            y: Math.max(ballRadius + 1, Math.min(fieldHeight - ballRadius - 1, ballA.position.y - ny * separationAmount)),
          };
          const newPosB = {
            x: Math.max(ballRadius + 1, Math.min(fieldWidth - ballRadius - 1, ballB.position.x + nx * separationAmount)),
            y: Math.max(ballRadius + 1, Math.min(fieldHeight - ballRadius - 1, ballB.position.y + ny * separationAmount)),
          };

          ballA.setPosition(newPosA);
          ballB.setPosition(newPosB);
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
        DEFAULT_SIMULATION_CONFIG.ballPhysics
      );

      if (result.scored && result.scoringTargetId && ball.data.shotByRobotId) {
        this.match.recordScore(ball.data.shotByRobotId, ball.id, result.scoringTargetId);
      }
    }
  }

  /**
   * Process automatic ball pickups
   */
  private processPickups(): void {
    for (const robot of this.match.getRobots()) {
      if (!robot.canPickUpBall()) continue;

      if (robot.isIdle()) {
        for (const ball of this.match.getAvailableBalls()) {
          if (isInPickupRange(robot.position, ball.position, 12)) {
            ball.claim(robot.id, this.match.clock.tick);
            robot.startAction({
              type: RobotActionType.PICKING_UP,
              targetBallId: ball.id,
            }, this.match.clock.tick);
            break;
          }
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

    // Notify all robot clients
    const endMessage = MessagePacker.createMatchEnd(
      result.score.red.total,
      result.score.blue.total,
      result.totalTicks
    );
    for (const client of this.robotClients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(endMessage);
      }
    }

    // Notify visualization clients
    const vizMessage = JSON.stringify({
      type: 'match_end',
      data: result,
    });
    for (const client of this.visualizationClients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(vizMessage);
      }
    }

    console.log('Match ended');
    console.log(`Final score: Red ${result.score.red.total} - Blue ${result.score.blue.total}`);
    this.events.emit(WorldServerEvents.MATCH_ENDED, { result });
    this.events.emit(SimulationEvents.MATCH_END, { result });

    return result;
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    this.running = false;

    // Cancel any pending barrier wait
    this.tickBarrier.cancel();

    // Close all robot connections
    for (const client of this.robotClients.values()) {
      client.ws.close();
    }
    this.robotClients.clear();

    // Close all visualization connections
    for (const client of this.visualizationClients) {
      client.ws.close();
    }
    this.visualizationClients.clear();

    // Stop servers
    await Promise.all([
      new Promise<void>(resolve => {
        if (this.robotServer) {
          this.robotServer.close(() => {
            this.robotServer = null;
            resolve();
          });
        } else {
          resolve();
        }
      }),
      new Promise<void>(resolve => {
        if (this.visualizationServer) {
          this.visualizationServer.close(() => {
            this.visualizationServer = null;
            resolve();
          });
        } else {
          resolve();
        }
      }),
    ]);

    console.log('WorldServer stopped');
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
   * Get match instance
   */
  getMatch(): Match {
    return this.match;
  }

  /**
   * Get current game state
   */
  getState(): GameState {
    return this.match.getState();
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get number of connected robot clients
   */
  getRobotClientCount(): number {
    return this.robotClients.size;
  }

  /**
   * Get connected robot IDs
   */
  getConnectedRobotIds(): string[] {
    return Array.from(this.robotClients.keys());
  }

  /**
   * Get number of visualization clients
   */
  getVisualizationClientCount(): number {
    return this.visualizationClients.size;
  }
}
