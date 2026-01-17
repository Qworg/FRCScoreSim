/**
 * MessagePack serialization/deserialization for distributed protocol
 *
 * Provides efficient binary encoding for protocol messages using MessagePack.
 * This enables language-agnostic clients (Python, Rust, Go, etc.) to communicate
 * with the World Server.
 */

import { encode, decode } from '@msgpack/msgpack';
import type {
  WireMessage,
  WireWorldState,
  WireRobotState,
  WireBallState,
  WireRobotCommand,
  ClientHelloPayload,
  FieldConfigPayload,
  TickUpdatePayload,
  RobotCommandPayload,
  MatchEndPayload,
  ErrorPayload,
} from '../types/distributed.js';
import {
  DistributedMessageType,
  WireBallStateEnum,
  matchPhaseToWire,
  robotActionToWire,
  shiftParityToWire,
  allianceToWire,
  wireToMatchPhase,
  wireToRobotAction,
  wireToShiftParity,
  wireToAlliance,
} from '../types/distributed.js';
import type { RobotState, RobotActionType } from '../types/robot.js';
import type { Ball, BallState as BallStateEnum } from '../types/ball.js';
import type { GameState, MatchPhase, ShiftParity } from '../types/game.js';
import type { FieldConfig } from '../types/field.js';

/**
 * MessagePacker handles binary serialization/deserialization of protocol messages
 */
export class MessagePacker {
  /**
   * Pack a message into a binary buffer
   */
  static pack(message: WireMessage): Uint8Array {
    return encode(message);
  }

  /**
   * Unpack a binary buffer into a message
   */
  static unpack(data: Uint8Array | ArrayBuffer): WireMessage {
    const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    return decode(buffer) as WireMessage;
  }

  /**
   * Create a TICK_UPDATE message from game state
   */
  static createTickUpdate(
    gameState: GameState,
    robotId: string,
    deadlineMs: number,
    fieldId: string
  ): Uint8Array {
    const myRobotState = gameState.robots.find(r => r.id === robotId);
    if (!myRobotState) {
      throw new Error(`Robot ${robotId} not found in game state`);
    }

    const wireState: WireWorldState = {
      tick: gameState.tick,
      deadlineMs,
      phase: matchPhaseToWire(gameState.phase),
      phaseTimeRemaining: gameState.phaseTimeRemaining,
      currentShift: gameState.currentShift ?? 0,
      myRobot: this.robotStateToWire(myRobotState),
      robots: gameState.robots.map(r => this.robotStateToWire(r)),
      balls: gameState.balls.map(b => this.ballToWire(b)),
      fieldId,
      redScore: gameState.score.red.total,
      blueScore: gameState.score.blue.total,
      redParity: shiftParityToWire(gameState.redParity),
      blueParity: shiftParityToWire(gameState.blueParity),
    };

    const message: WireMessage = {
      type: DistributedMessageType.TICK_UPDATE,
      payload: { state: wireState } as TickUpdatePayload,
    };

    return this.pack(message);
  }

  /**
   * Create a FIELD_CONFIG message
   */
  static createFieldConfig(
    fieldId: string,
    config: FieldConfig,
    tickRate: number,
    commandTimeoutMs: number
  ): Uint8Array {
    const payload: FieldConfigPayload = {
      fieldId,
      config,
      tickRate,
      commandTimeoutMs,
    };

    const message: WireMessage = {
      type: DistributedMessageType.FIELD_CONFIG,
      payload,
    };

    return this.pack(message);
  }

  /**
   * Create a MATCH_END message
   */
  static createMatchEnd(
    redScore: number,
    blueScore: number,
    totalTicks: number
  ): Uint8Array {
    let winner: 'red' | 'blue' | 'tie';
    if (redScore > blueScore) {
      winner = 'red';
    } else if (blueScore > redScore) {
      winner = 'blue';
    } else {
      winner = 'tie';
    }

    const payload: MatchEndPayload = {
      redScore,
      blueScore,
      winner,
      totalTicks,
    };

    const message: WireMessage = {
      type: DistributedMessageType.MATCH_END,
      payload,
    };

    return this.pack(message);
  }

  /**
   * Create a CLIENT_HELLO message
   */
  static createClientHello(
    robotId: string,
    protocolVersion: number,
    clientName?: string
  ): Uint8Array {
    const payload: ClientHelloPayload = {
      robotId,
      protocolVersion,
      clientName,
    };

    const message: WireMessage = {
      type: DistributedMessageType.CLIENT_HELLO,
      payload,
    };

    return this.pack(message);
  }

  /**
   * Create a ROBOT_COMMAND message
   */
  static createRobotCommand(command: WireRobotCommand): Uint8Array {
    const payload: RobotCommandPayload = { command };

    const message: WireMessage = {
      type: DistributedMessageType.ROBOT_COMMAND,
      payload,
    };

    return this.pack(message);
  }

  /**
   * Create an ERROR message
   */
  static createError(code: number, errorMessage: string): Uint8Array {
    const payload: ErrorPayload = {
      code,
      message: errorMessage,
    };

    const message: WireMessage = {
      type: DistributedMessageType.ERROR,
      payload,
    };

    return this.pack(message);
  }

  /**
   * Create a PING message
   */
  static createPing(): Uint8Array {
    const message: WireMessage = {
      type: DistributedMessageType.PING,
      payload: { timestamp: Date.now() },
    };
    return this.pack(message);
  }

  /**
   * Create a PONG message
   */
  static createPong(pingTimestamp: number): Uint8Array {
    const message: WireMessage = {
      type: DistributedMessageType.PONG,
      payload: { timestamp: Date.now(), pingTimestamp },
    };
    return this.pack(message);
  }

  /**
   * Parse a received message and extract typed payload
   */
  static parseMessage(data: Uint8Array | ArrayBuffer): {
    type: DistributedMessageType;
    payload: unknown;
  } {
    const message = this.unpack(data);
    return {
      type: message.type,
      payload: message.payload,
    };
  }

  /**
   * Extract CLIENT_HELLO payload
   */
  static parseClientHello(message: WireMessage): ClientHelloPayload {
    if (message.type !== DistributedMessageType.CLIENT_HELLO) {
      throw new Error(`Expected CLIENT_HELLO, got ${message.type}`);
    }
    return message.payload as ClientHelloPayload;
  }

  /**
   * Extract ROBOT_COMMAND payload
   */
  static parseRobotCommand(message: WireMessage): WireRobotCommand {
    if (message.type !== DistributedMessageType.ROBOT_COMMAND) {
      throw new Error(`Expected ROBOT_COMMAND, got ${message.type}`);
    }
    const payload = message.payload as RobotCommandPayload;
    return payload.command;
  }

  /**
   * Extract FIELD_CONFIG payload
   */
  static parseFieldConfig(message: WireMessage): FieldConfigPayload {
    if (message.type !== DistributedMessageType.FIELD_CONFIG) {
      throw new Error(`Expected FIELD_CONFIG, got ${message.type}`);
    }
    return message.payload as FieldConfigPayload;
  }

  /**
   * Extract TICK_UPDATE payload
   */
  static parseTickUpdate(message: WireMessage): WireWorldState {
    if (message.type !== DistributedMessageType.TICK_UPDATE) {
      throw new Error(`Expected TICK_UPDATE, got ${message.type}`);
    }
    const payload = message.payload as TickUpdatePayload;
    return payload.state;
  }

  /**
   * Extract MATCH_END payload
   */
  static parseMatchEnd(message: WireMessage): MatchEndPayload {
    if (message.type !== DistributedMessageType.MATCH_END) {
      throw new Error(`Expected MATCH_END, got ${message.type}`);
    }
    return message.payload as MatchEndPayload;
  }

  // ========================================================================
  // Internal conversion helpers
  // ========================================================================

  /**
   * Convert RobotState to wire format
   */
  private static robotStateToWire(state: RobotState): WireRobotState {
    return {
      id: state.id,
      alliance: allianceToWire(state.alliance),
      x: state.position.x,
      y: state.position.y,
      heading: state.heading,
      velocity: state.velocity,
      action: robotActionToWire(state.currentAction.type),
      heldBalls: state.heldBalls.length,
      heldBallIds: state.heldBalls,
      hasAutoClimbed: state.hasAutoClimbed,
      hasClimbed: state.hasClimbed,
      climbLevel: state.currentClimbLevel,
      isDisabled: state.disabled,
    };
  }

  /**
   * Convert Ball to wire format
   */
  private static ballToWire(ball: Ball): WireBallState {
    const stateMapping: Record<string, WireBallStateEnum> = {
      'ON_FIELD': WireBallStateEnum.ON_FIELD,
      'HELD': WireBallStateEnum.HELD,
      'IN_FLIGHT': WireBallStateEnum.IN_FLIGHT,
      'SCORED': WireBallStateEnum.SCORED,
      'OUT_OF_BOUNDS': WireBallStateEnum.OUT_OF_BOUNDS,
    };

    return {
      id: ball.id,
      x: ball.position.x,
      y: ball.position.y,
      height: ball.height,
      state: stateMapping[ball.state] ?? WireBallStateEnum.ON_FIELD,
      heldBy: ball.heldByRobotId,
    };
  }

  /**
   * Convert WireRobotState back to partial RobotState
   * (for client-side reconstruction)
   */
  static wireToRobotStatePartial(wire: WireRobotState): {
    id: string;
    alliance: 'red' | 'blue';
    position: { x: number; y: number };
    heading: number;
    velocity: number;
    actionType: RobotActionType;
    heldBalls: string[];
    hasAutoClimbed: boolean;
    hasClimbed: boolean;
    climbLevel: number | null;
    isDisabled: boolean;
  } {
    return {
      id: wire.id,
      alliance: wireToAlliance(wire.alliance),
      position: { x: wire.x, y: wire.y },
      heading: wire.heading,
      velocity: wire.velocity,
      actionType: wireToRobotAction(wire.action),
      heldBalls: wire.heldBallIds,
      hasAutoClimbed: wire.hasAutoClimbed,
      hasClimbed: wire.hasClimbed,
      climbLevel: wire.climbLevel,
      isDisabled: wire.isDisabled,
    };
  }

  /**
   * Convert WireBallState back to partial Ball
   * (for client-side reconstruction)
   */
  static wireToBallPartial(wire: WireBallState): {
    id: string;
    position: { x: number; y: number };
    height: number;
    state: BallStateEnum;
    heldBy: string | null;
  } {
    const stateMapping: Record<WireBallStateEnum, BallStateEnum> = {
      [WireBallStateEnum.ON_FIELD]: 'ON_FIELD' as BallStateEnum,
      [WireBallStateEnum.HELD]: 'HELD' as BallStateEnum,
      [WireBallStateEnum.IN_FLIGHT]: 'IN_FLIGHT' as BallStateEnum,
      [WireBallStateEnum.SCORED]: 'SCORED' as BallStateEnum,
      [WireBallStateEnum.OUT_OF_BOUNDS]: 'OUT_OF_BOUNDS' as BallStateEnum,
    };

    return {
      id: wire.id,
      position: { x: wire.x, y: wire.y },
      height: wire.height,
      state: stateMapping[wire.state] ?? ('ON_FIELD' as BallStateEnum),
      heldBy: wire.heldBy,
    };
  }

  /**
   * Convert WireWorldState to a client-friendly format
   */
  static wireWorldStateToClientFormat(wire: WireWorldState): {
    tick: number;
    deadlineMs: number;
    phase: MatchPhase;
    phaseTimeRemaining: number;
    currentShift: number | null;
    myRobot: ReturnType<typeof MessagePacker.wireToRobotStatePartial>;
    robots: ReturnType<typeof MessagePacker.wireToRobotStatePartial>[];
    balls: ReturnType<typeof MessagePacker.wireToBallPartial>[];
    fieldId: string;
    redScore: number;
    blueScore: number;
    redParity: ShiftParity | null;
    blueParity: ShiftParity | null;
  } {
    return {
      tick: wire.tick,
      deadlineMs: wire.deadlineMs,
      phase: wireToMatchPhase(wire.phase),
      phaseTimeRemaining: wire.phaseTimeRemaining,
      currentShift: wire.currentShift === 0 ? null : wire.currentShift,
      myRobot: this.wireToRobotStatePartial(wire.myRobot),
      robots: wire.robots.map(r => this.wireToRobotStatePartial(r)),
      balls: wire.balls.map(b => this.wireToBallPartial(b)),
      fieldId: wire.fieldId,
      redScore: wire.redScore,
      blueScore: wire.blueScore,
      redParity: wireToShiftParity(wire.redParity),
      blueParity: wireToShiftParity(wire.blueParity),
    };
  }
}

/**
 * Error codes for distributed protocol
 */
export const ErrorCodes = {
  UNKNOWN: 0,
  INVALID_MESSAGE: 1,
  ROBOT_NOT_FOUND: 2,
  DUPLICATE_ROBOT: 3,
  PROTOCOL_MISMATCH: 4,
  TIMEOUT: 5,
  MATCH_NOT_STARTED: 6,
  MATCH_ENDED: 7,
  INVALID_COMMAND: 8,
} as const;
