/**
 * RobotClient - Reference TypeScript implementation for robot clients
 *
 * This client connects to the WorldServer, receives world state each tick,
 * runs a strategy, and sends back commands. It serves as a reference
 * implementation for clients in other languages.
 */

import WebSocket from 'ws';
import type {
  WireWorldState,
  WireRobotCommand,
  WireMessage,
  MatchEndPayload,
} from '../types/distributed.js';
import {
  DistributedMessageType,
  PROTOCOL_VERSION,
  WireRobotActionType,
  robotActionToWire,
} from '../types/distributed.js';
import type { FieldConfig, Position, ScoringTarget } from '../types/field.js';
import type { Strategy, StrategyContext, StrategyDecision } from '../types/strategy.js';
import type { RobotState } from '../types/robot.js';
import type { Ball } from '../types/ball.js';
import type { GameState, MatchPhase, ShiftParity } from '../types/game.js';
import { MessagePacker } from './MessagePacker.js';
import { RobotActionType, MatchPhase as MatchPhaseEnum } from '../types/index.js';
import { Field } from '../field/Field.js';

/**
 * Client state
 */
enum ClientState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RUNNING = 'RUNNING',
  FINISHED = 'FINISHED',
}

/**
 * Configuration for RobotClient
 */
export interface RobotClientConfig {
  /** Server URL */
  serverUrl: string;
  /** Robot ID this client controls */
  robotId: string;
  /** Strategy to use */
  strategy: Strategy;
  /** Client name (for logging) */
  clientName?: string;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect delay in ms */
  reconnectDelayMs?: number;
  /** Max reconnect attempts */
  maxReconnectAttempts?: number;
}

/**
 * Event handlers for RobotClient
 */
export interface RobotClientEventHandlers {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onFieldConfig?: (config: FieldConfig) => void;
  onTick?: (worldState: WireWorldState) => void;
  onMatchEnd?: (result: MatchEndPayload) => void;
  onError?: (error: Error) => void;
}

/**
 * RobotClient - connects to WorldServer and runs a strategy
 */
export class RobotClient {
  private config: RobotClientConfig;
  private handlers: RobotClientEventHandlers;

  private ws: WebSocket | null = null;
  private state: ClientState = ClientState.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  private fieldConfig: FieldConfig | null = null;
  private field: Field | null = null;
  private tickRate: number = 60;

  private lastWorldState: WireWorldState | null = null;

  constructor(
    config: RobotClientConfig,
    handlers: RobotClientEventHandlers = {}
  ) {
    this.config = {
      autoReconnect: true,
      reconnectDelayMs: 1000,
      maxReconnectAttempts: 10,
      ...config,
    };
    this.handlers = handlers;
  }

  /**
   * Connect to the WorldServer
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state !== ClientState.DISCONNECTED) {
        reject(new Error(`Cannot connect: client is ${this.state}`));
        return;
      }

      this.state = ClientState.CONNECTING;

      try {
        this.ws = new WebSocket(this.config.serverUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.on('open', () => {
          console.log(`RobotClient ${this.config.robotId}: Connected to server`);
          this.state = ClientState.CONNECTED;
          this.reconnectAttempts = 0;

          // Send CLIENT_HELLO
          this.sendClientHello();

          this.handlers.onConnected?.();
          resolve();
        });

        this.ws.on('message', (data: Buffer | ArrayBuffer) => {
          this.handleMessage(data);
        });

        this.ws.on('close', () => {
          console.log(`RobotClient ${this.config.robotId}: Disconnected`);
          this.handleDisconnect();
        });

        this.ws.on('error', (error) => {
          console.error(`RobotClient ${this.config.robotId}: WebSocket error:`, error);
          this.handlers.onError?.(error);

          if (this.state === ClientState.CONNECTING) {
            reject(error);
          }
        });
      } catch (error) {
        this.state = ClientState.DISCONNECTED;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    // Cancel any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Disable auto-reconnect temporarily
    const originalAutoReconnect = this.config.autoReconnect;
    this.config.autoReconnect = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state = ClientState.DISCONNECTED;
    this.config.autoReconnect = originalAutoReconnect;
  }

  /**
   * Send CLIENT_HELLO message
   */
  private sendClientHello(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const hello = MessagePacker.createClientHello(
      this.config.robotId,
      PROTOCOL_VERSION,
      this.config.clientName
    );
    this.ws.send(hello);
  }

  /**
   * Handle incoming message from server
   */
  private handleMessage(data: Buffer | ArrayBuffer): void {
    try {
      const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      const message = MessagePacker.unpack(buffer);

      switch (message.type) {
        case DistributedMessageType.FIELD_CONFIG:
          this.handleFieldConfig(message);
          break;

        case DistributedMessageType.TICK_UPDATE:
          this.handleTickUpdate(message);
          break;

        case DistributedMessageType.MATCH_END:
          this.handleMatchEnd(message);
          break;

        case DistributedMessageType.PONG:
          // Ping response, can measure latency
          break;

        case DistributedMessageType.ERROR:
          this.handleError(message);
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  /**
   * Handle FIELD_CONFIG message
   */
  private handleFieldConfig(message: WireMessage): void {
    const payload = MessagePacker.parseFieldConfig(message);

    this.fieldConfig = payload.config;
    this.tickRate = payload.tickRate;

    // Initialize field
    this.field = new Field(this.fieldConfig);

    this.state = ClientState.RUNNING;
    console.log(`RobotClient ${this.config.robotId}: Received field config, ready to run`);

    // Initialize strategy
    const context = this.buildInitialContext();
    if (context) {
      this.config.strategy.initialize(context);
    }

    this.handlers.onFieldConfig?.(this.fieldConfig);
  }

  /**
   * Handle TICK_UPDATE message
   */
  private handleTickUpdate(message: WireMessage): void {
    const worldState = MessagePacker.parseTickUpdate(message);
    this.lastWorldState = worldState;

    this.handlers.onTick?.(worldState);

    // Build strategy context and make decision
    const context = this.buildStrategyContext(worldState);
    if (!context) {
      // Send IDLE if we can't build context
      this.sendCommand({
        tick: worldState.tick,
        robotId: this.config.robotId,
        action: WireRobotActionType.IDLE,
        targetX: null,
        targetY: null,
        targetBallId: null,
        targetZoneId: null,
        climbLevel: null,
        isAutoClimb: false,
      });
      return;
    }

    // Get decision from strategy
    const decision = this.config.strategy.decide(context);

    // Convert to wire command and send
    const wireCommand = this.decisionToWireCommand(worldState.tick, decision);
    this.sendCommand(wireCommand);
  }

  /**
   * Handle MATCH_END message
   */
  private handleMatchEnd(message: WireMessage): void {
    const payload = MessagePacker.parseMatchEnd(message);

    this.state = ClientState.FINISHED;
    console.log(`RobotClient ${this.config.robotId}: Match ended`);
    console.log(`  Final score: Red ${payload.redScore} - Blue ${payload.blueScore}`);
    console.log(`  Winner: ${payload.winner}`);

    // Reset strategy
    this.config.strategy.reset();

    this.handlers.onMatchEnd?.(payload);
  }

  /**
   * Handle ERROR message
   */
  private handleError(message: WireMessage): void {
    const payload = message.payload as { code: number; message: string };
    console.error(`RobotClient ${this.config.robotId}: Server error [${payload.code}]: ${payload.message}`);

    this.handlers.onError?.(new Error(`Server error [${payload.code}]: ${payload.message}`));
  }

  /**
   * Handle disconnect
   */
  private handleDisconnect(): void {
    const wasRunning = this.state === ClientState.RUNNING;
    this.state = ClientState.DISCONNECTED;
    this.ws = null;

    this.handlers.onDisconnected?.();

    // Attempt reconnect if enabled and match wasn't finished
    if (
      this.config.autoReconnect &&
      wasRunning &&
      this.reconnectAttempts < (this.config.maxReconnectAttempts ?? 10)
    ) {
      this.reconnectAttempts++;
      console.log(
        `RobotClient ${this.config.robotId}: Reconnecting in ${this.config.reconnectDelayMs}ms ` +
        `(attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`
      );

      this.reconnectTimeout = setTimeout(() => {
        this.connect().catch(err => {
          console.error(`Reconnect failed:`, err);
        });
      }, this.config.reconnectDelayMs);
    }
  }

  /**
   * Send command to server
   */
  private sendCommand(command: WireRobotCommand): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`Cannot send command: WebSocket not open`);
      return;
    }

    const message = MessagePacker.createRobotCommand(command);
    this.ws.send(message);
  }

  /**
   * Build initial strategy context (before first tick)
   */
  private buildInitialContext(): StrategyContext | null {
    if (!this.fieldConfig) return null;

    // Create a minimal initial context
    return {
      gameState: {
        tick: 0,
        elapsedTime: 0,
        phase: 'PRE_MATCH' as MatchPhase,
        phaseTimeRemaining: 0,
        currentShift: null,
        redParity: null,
        blueParity: null,
        robots: [],
        balls: [],
        score: {
          red: { auto: 0, teleop: 0, endgame: 0, penalties: 0, total: 0, breakdown: {}, autoBallCount: 0, totalBallCount: 0, autoClimbCount: 0, endgameClimbCount: 0, endgameClimbLevelTotal: 0 },
          blue: { auto: 0, teleop: 0, endgame: 0, penalties: 0, total: 0, breakdown: {}, autoBallCount: 0, totalBallCount: 0, autoClimbCount: 0, endgameClimbCount: 0, endgameClimbLevelTotal: 0 },
        },
        events: [],
        paused: false,
      },
      robot: {
        id: this.config.robotId,
        config: {
          id: this.config.robotId,
          teamNumber: 0,
          teamName: '',
          width: 30,
          length: 30,
          height: 30,
          topSpeed: 100,
          acceleration: 200,
          turnRate: 180,
          shootingRange: 200,
          shootingAccuracy: 0.8,
          ballCapacity: 5,
          pickupTime: 0.5,
          shootTime: 1,
          canClimb: true,
          autoClimb: false,
          climbLevel: 1,
          climbUpTime: 2,
          climbDownTime: 1,
          canPass: false,
          defaultStrategy: 'idle',
        },
        alliance: 'red',
        position: { x: 0, y: 0 },
        heading: 0,
        velocity: 0,
        heldBalls: [],
        currentAction: { type: RobotActionType.IDLE, progress: 0, startedAt: 0 },
        secondaryAction: null,
        disabled: false,
        hasAutoClimbed: false,
        hasClimbed: false,
        currentClimbLevel: null,
        currentPath: [],
        pathIndex: 0,
      },
      field: this.fieldConfig,
      teammates: [],
      opponents: [],
      availableBalls: [],
      unclaimedBalls: [],
      teammateBalls: [],
      scoringTargets: [],
      nearestBallDistance: null,
      nearestBall: null,
      nearestUnclaimedBallDistance: null,
      nearestUnclaimedBall: null,
      nearestScoringTargetDistance: null,
      nearestScoringTarget: null,
      inShootingRange: false,
      phase: 'PRE_MATCH' as MatchPhase,
      phaseTimeRemaining: 0,
      currentShift: null,
      allianceParity: null,
      canScore: false,
      canAutoClimb: false,
      allianceCanAutoClimb: false,
      allianceCanEndgameClimb: false,
      allianceAutoClimbCount: 0,
      allianceEndgameClimbCount: 0,
      isNearClimbingZone: false,
      climbingZonePosition: null,
      hasClearShotPath: false,
      isGoodShootingPosition: false,
      isOnOwnSide: false,
      isInNoScoreZone: false,
    };
  }

  /**
   * Build strategy context from world state
   */
  private buildStrategyContext(worldState: WireWorldState): StrategyContext | null {
    if (!this.fieldConfig || !this.field) return null;

    // Convert wire format to StrategyContext
    const clientState = MessagePacker.wireWorldStateToClientFormat(worldState);
    const myRobot = clientState.myRobot;

    // Convert to RobotState format
    const robotState: RobotState = {
      id: myRobot.id,
      config: {
        id: myRobot.id,
        teamNumber: 0,
        teamName: '',
        width: 30,
        length: 30,
        height: 30,
        topSpeed: 100,
        acceleration: 200,
        turnRate: 180,
        shootingRange: 200,
        shootingAccuracy: 0.8,
        ballCapacity: 60,
        pickupTime: 0.5,
        shootTime: 1,
        canClimb: true,
        autoClimb: false,
        climbLevel: 1,
        climbUpTime: 2,
        climbDownTime: 1,
        canPass: false,
        defaultStrategy: 'idle',
      },
      alliance: myRobot.alliance,
      position: myRobot.position,
      heading: myRobot.heading,
      velocity: myRobot.velocity,
      heldBalls: myRobot.heldBalls,
      currentAction: {
        type: myRobot.actionType,
        progress: 0,
        startedAt: 0,
      },
      secondaryAction: null,
      disabled: myRobot.isDisabled,
      hasAutoClimbed: myRobot.hasAutoClimbed,
      hasClimbed: myRobot.hasClimbed,
      currentClimbLevel: myRobot.climbLevel,
      currentPath: [],
      pathIndex: 0,
    };

    // Convert balls
    const balls: Ball[] = clientState.balls.map(b => ({
      id: b.id,
      state: b.state,
      position: b.position,
      height: b.height,
      velocity: { vx: 0, vy: 0, vz: 0 },
      heldByRobotId: b.heldBy,
      shotByRobotId: null,
      shotFromPosition: null,
      targetPosition: null,
      spawnPointId: '',
      alliance: null,
      lastUpdateTick: 0,
      claimedByRobotId: null,
      claimedAtTick: null,
    }));

    const availableBalls = balls.filter(b => b.state === 'ON_FIELD');

    // Convert teammates and opponents
    const alliance = myRobot.alliance;
    const teammates = clientState.robots
      .filter(r => r.alliance === alliance && r.id !== myRobot.id)
      .map(r => this.wireRobotToState(r));
    const opponents = clientState.robots
      .filter(r => r.alliance !== alliance)
      .map(r => this.wireRobotToState(r));

    // Get scoring targets for this alliance
    const scoringTargets = this.fieldConfig.scoringTargets.filter(
      t => t.alliance === alliance
    );

    // Calculate nearest ball
    let nearestBall: Ball | null = null;
    let nearestBallDistance: number | null = null;
    for (const ball of availableBalls) {
      const dist = this.distance(myRobot.position, ball.position);
      if (nearestBallDistance === null || dist < nearestBallDistance) {
        nearestBallDistance = dist;
        nearestBall = ball;
      }
    }

    // Calculate nearest scoring target
    let nearestScoringTarget: ScoringTarget | null = null;
    let nearestScoringTargetDistance: number | null = null;
    for (const target of scoringTargets) {
      const dist = this.distance(myRobot.position, target.position);
      if (nearestScoringTargetDistance === null || dist < nearestScoringTargetDistance) {
        nearestScoringTargetDistance = dist;
        nearestScoringTarget = target;
      }
    }

    const inShootingRange = nearestScoringTargetDistance !== null &&
      nearestScoringTargetDistance <= robotState.config.shootingRange;

    // Determine if alliance can score in current phase
    const canScore = this.canAllianceScore(
      alliance,
      clientState.phase,
      clientState.currentShift,
      alliance === 'red' ? clientState.redParity : clientState.blueParity
    );

    // Check climbing zone proximity
    const isNearClimbingZone = this.field.isNearClimbingZone(myRobot.position, alliance);

    // Find climbing zone position
    let climbingZonePosition: Position | null = null;
    const fieldCenterX = this.fieldConfig.width / 2;
    for (const zone of this.fieldConfig.zones) {
      if (zone.type !== 'CLIMBING') continue;
      const isRedZone = (zone.bounds.minX + zone.bounds.maxX) / 2 < fieldCenterX;
      if ((alliance === 'red' && isRedZone) || (alliance === 'blue' && !isRedZone)) {
        climbingZonePosition = {
          x: (zone.bounds.minX + zone.bounds.maxX) / 2,
          y: (zone.bounds.minY + zone.bounds.maxY) / 2,
        };
        break;
      }
    }

    // Check shooting position quality
    const hasClearShotPath = nearestScoringTarget
      ? this.field.hasClearShotPath(myRobot.position, nearestScoringTarget.position)
      : false;
    const isGoodShootingPosition = this.field.isGoodShootingPosition(myRobot.position);
    const isOnOwnSide = this.field.isOnAllianceSide(myRobot.position, alliance);
    const isInNoScoreZone = this.field.isInNoScoreZone(myRobot.position);

    // Count alliance climbs
    const allianceRobots = clientState.robots.filter(r => r.alliance === alliance);
    const allianceAutoClimbCount = allianceRobots.filter(r => r.hasAutoClimbed).length;
    const allianceEndgameClimbCount = allianceRobots.filter(r => r.hasClimbed).length;

    // Build game state
    const gameState: GameState = {
      tick: clientState.tick,
      elapsedTime: clientState.tick / this.tickRate,
      phase: clientState.phase,
      phaseTimeRemaining: clientState.phaseTimeRemaining,
      currentShift: clientState.currentShift,
      redParity: clientState.redParity,
      blueParity: clientState.blueParity,
      robots: clientState.robots.map(r => this.wireRobotToState(r)),
      balls,
      score: {
        red: { auto: 0, teleop: 0, endgame: 0, penalties: 0, total: clientState.redScore, breakdown: {}, autoBallCount: 0, totalBallCount: 0, autoClimbCount: 0, endgameClimbCount: 0, endgameClimbLevelTotal: 0 },
        blue: { auto: 0, teleop: 0, endgame: 0, penalties: 0, total: clientState.blueScore, breakdown: {}, autoBallCount: 0, totalBallCount: 0, autoClimbCount: 0, endgameClimbCount: 0, endgameClimbLevelTotal: 0 },
      },
      events: [],
      paused: false,
    };

    return {
      gameState,
      robot: robotState,
      field: this.fieldConfig,
      teammates,
      opponents,
      availableBalls,
      unclaimedBalls: availableBalls, // In distributed mode, no claim coordination
      teammateBalls: balls.filter(b =>
        b.heldByRobotId && teammates.some(t => t.id === b.heldByRobotId)
      ),
      scoringTargets,
      nearestBallDistance,
      nearestBall,
      nearestUnclaimedBallDistance: nearestBallDistance,
      nearestUnclaimedBall: nearestBall,
      nearestScoringTargetDistance,
      nearestScoringTarget,
      inShootingRange,
      phase: clientState.phase,
      phaseTimeRemaining: clientState.phaseTimeRemaining,
      currentShift: clientState.currentShift,
      allianceParity: alliance === 'red' ? clientState.redParity : clientState.blueParity,
      canScore,
      canAutoClimb: robotState.config.autoClimb && !robotState.hasAutoClimbed && clientState.phase === MatchPhaseEnum.AUTO,
      allianceCanAutoClimb: allianceAutoClimbCount < 2,
      allianceCanEndgameClimb: allianceEndgameClimbCount < 3,
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
   * Convert wire robot to RobotState
   */
  private wireRobotToState(wire: ReturnType<typeof MessagePacker.wireToRobotStatePartial>): RobotState {
    return {
      id: wire.id,
      config: {
        id: wire.id,
        teamNumber: 0,
        teamName: '',
        width: 30,
        length: 30,
        height: 30,
        topSpeed: 100,
        acceleration: 200,
        turnRate: 180,
        shootingRange: 200,
        shootingAccuracy: 0.8,
        ballCapacity: 5,
        pickupTime: 0.5,
        shootTime: 1,
        canClimb: true,
        autoClimb: false,
        climbLevel: 1,
        climbUpTime: 2,
        climbDownTime: 1,
        canPass: false,
        defaultStrategy: 'idle',
      },
      alliance: wire.alliance,
      position: wire.position,
      heading: wire.heading,
      velocity: wire.velocity,
      heldBalls: wire.heldBalls,
      currentAction: {
        type: wire.actionType,
        progress: 0,
        startedAt: 0,
      },
      secondaryAction: null,
      disabled: wire.isDisabled,
      hasAutoClimbed: wire.hasAutoClimbed,
      hasClimbed: wire.hasClimbed,
      currentClimbLevel: wire.climbLevel,
      currentPath: [],
      pathIndex: 0,
    };
  }

  /**
   * Convert strategy decision to wire command
   */
  private decisionToWireCommand(tick: number, decision: StrategyDecision): WireRobotCommand {
    const cmd = decision.command;

    return {
      tick,
      robotId: this.config.robotId,
      action: robotActionToWire(cmd.type),
      targetX: cmd.targetPosition?.x ?? null,
      targetY: cmd.targetPosition?.y ?? null,
      targetBallId: cmd.targetBallId ?? null,
      targetZoneId: cmd.targetScoringZoneId ?? null,
      climbLevel: cmd.targetClimbLevel ?? null,
      isAutoClimb: cmd.isAutoClimb ?? false,
    };
  }

  /**
   * Check if alliance can score in current phase
   */
  private canAllianceScore(
    _alliance: 'red' | 'blue',
    phase: MatchPhase,
    _currentShift: number | null,
    parity: ShiftParity | null
  ): boolean {
    switch (phase) {
      case MatchPhaseEnum.AUTO:
      case MatchPhaseEnum.TRANSITION:
      case MatchPhaseEnum.ENDGAME:
        return true;

      case MatchPhaseEnum.SHIFT_1:
      case MatchPhaseEnum.SHIFT_3:
        return parity === 'ODD';

      case MatchPhaseEnum.SHIFT_2:
      case MatchPhaseEnum.SHIFT_4:
        return parity === 'EVEN';

      default:
        return false;
    }
  }

  /**
   * Calculate distance between two positions
   */
  private distance(a: Position, b: Position): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get client state
   */
  getState(): ClientState {
    return this.state;
  }

  /**
   * Get robot ID
   */
  getRobotId(): string {
    return this.config.robotId;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === ClientState.CONNECTED || this.state === ClientState.RUNNING;
  }

  /**
   * Check if match is running
   */
  isRunning(): boolean {
    return this.state === ClientState.RUNNING;
  }

  /**
   * Get last received world state
   */
  getLastWorldState(): WireWorldState | null {
    return this.lastWorldState;
  }
}
