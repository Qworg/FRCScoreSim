/**
 * Distributed Robot Architecture Protocol Types
 *
 * This file defines the protocol messages for communication between
 * the World Server and Robot Clients in the distributed simulation.
 */

import type { MatchPhase, ShiftParity } from './game.js';
import type { RobotActionType } from './robot.js';
import type { FieldConfig } from './field.js';

// ============================================================================
// Execution Mode
// ============================================================================

/**
 * Execution mode for distributed simulation
 */
export enum ExecutionMode {
  /** Local execution - all robots run in the same process (default) */
  LOCAL = 'LOCAL',
  /** Distributed execution - robots connect as separate clients */
  DISTRIBUTED = 'DISTRIBUTED',
}

// ============================================================================
// Protocol Enums (numeric for wire format efficiency)
// ============================================================================

/**
 * Message types for the distributed protocol
 */
export enum DistributedMessageType {
  // Server -> Robot
  FIELD_CONFIG = 0x01,      // Initial field configuration
  TICK_UPDATE = 0x02,       // Per-tick world state update
  MATCH_END = 0x03,         // Match has ended

  // Robot -> Server
  CLIENT_HELLO = 0x10,      // Robot connection announcement
  ROBOT_COMMAND = 0x11,     // Robot action for this tick

  // Bidirectional
  PING = 0x20,
  PONG = 0x21,
  ERROR = 0xFF,
}

/**
 * Numeric encoding of MatchPhase for wire format
 */
export enum WireMatchPhase {
  PRE_MATCH = 0,
  AUTO = 1,
  TRANSITION = 2,
  SHIFT_1 = 3,
  SHIFT_2 = 4,
  SHIFT_3 = 5,
  SHIFT_4 = 6,
  ENDGAME = 7,
  POST_MATCH = 8,
}

/**
 * Numeric encoding of RobotActionType for wire format
 */
export enum WireRobotActionType {
  IDLE = 0,
  MOVING = 1,
  PICKING_UP = 2,
  SHOOTING = 3,
  PASSING = 4,
  CLIMBING = 5,
  DEFENDING = 6,
}

/**
 * Numeric encoding of BallState for wire format
 */
export enum WireBallStateEnum {
  ON_FIELD = 0,
  HELD = 1,
  IN_FLIGHT = 2,
  SCORED = 3,
  OUT_OF_BOUNDS = 4,
}

/**
 * Numeric encoding of Alliance for wire format
 */
export enum WireAlliance {
  RED = 0,
  BLUE = 1,
}

/**
 * Numeric encoding of ShiftParity for wire format
 */
export enum WireShiftParity {
  EVEN = 0,
  ODD = 1,
  NULL = 255,
}

// ============================================================================
// Wire Format Types (compact representation for MessagePack)
// ============================================================================

/**
 * Robot state in wire format
 */
export interface WireRobotState {
  /** Robot ID */
  id: string;
  /** Alliance (0=red, 1=blue) */
  alliance: WireAlliance;
  /** X position in inches */
  x: number;
  /** Y position in inches */
  y: number;
  /** Heading in degrees */
  heading: number;
  /** Velocity in inches/second */
  velocity: number;
  /** Current action type */
  action: WireRobotActionType;
  /** Number of balls held */
  heldBalls: number;
  /** IDs of balls held */
  heldBallIds: string[];
  /** Whether robot has auto-climbed */
  hasAutoClimbed: boolean;
  /** Whether robot has endgame-climbed */
  hasClimbed: boolean;
  /** Current climb level (null if not climbed) */
  climbLevel: number | null;
  /** Whether robot is disabled */
  isDisabled: boolean;
}

/**
 * Ball state in wire format
 */
export interface WireBallState {
  /** Ball ID */
  id: string;
  /** X position in inches */
  x: number;
  /** Y position in inches */
  y: number;
  /** Height above ground in inches */
  height: number;
  /** Ball state (0=ON_FIELD, 1=HELD, etc.) */
  state: WireBallStateEnum;
  /** Robot ID holding this ball (null if not held) */
  heldBy: string | null;
}

/**
 * Full world state sent from server to robots each tick
 */
export interface WireWorldState {
  /** Current tick number */
  tick: number;
  /** Deadline for command response (Unix timestamp ms) */
  deadlineMs: number;
  /** Current match phase */
  phase: WireMatchPhase;
  /** Time remaining in current phase (seconds) */
  phaseTimeRemaining: number;
  /** Current shift number (1-4) or 0 if not in shift */
  currentShift: number;
  /** This robot's state */
  myRobot: WireRobotState;
  /** All robots (including this one) */
  robots: WireRobotState[];
  /** All balls */
  balls: WireBallState[];
  /** Field config ID (sent once on connect) */
  fieldId: string;
  /** Red alliance score */
  redScore: number;
  /** Blue alliance score */
  blueScore: number;
  /** Red alliance parity (0=EVEN, 1=ODD, 255=null) */
  redParity: WireShiftParity;
  /** Blue alliance parity (0=EVEN, 1=ODD, 255=null) */
  blueParity: WireShiftParity;
}

/**
 * Robot command in wire format
 */
export interface WireRobotCommand {
  /** Tick this command responds to */
  tick: number;
  /** Robot ID sending the command */
  robotId: string;
  /** Action type */
  action: WireRobotActionType;
  /** Target X position (for MOVING) */
  targetX: number | null;
  /** Target Y position (for MOVING) */
  targetY: number | null;
  /** Target ball ID (for PICKING_UP) */
  targetBallId: string | null;
  /** Target scoring zone ID (for SHOOTING) */
  targetZoneId: string | null;
  /** Climb level (for CLIMBING, 1-3) */
  climbLevel: number | null;
  /** Whether this is an auto climb (vs endgame) */
  isAutoClimb: boolean;
}

// ============================================================================
// Protocol Messages
// ============================================================================

/**
 * Base message structure
 */
export interface WireMessage {
  /** Message type */
  type: DistributedMessageType;
  /** Message payload (type depends on message type) */
  payload: unknown;
}

/**
 * Client hello message (Robot -> Server)
 */
export interface ClientHelloPayload {
  /** Robot ID this client controls */
  robotId: string;
  /** Protocol version */
  protocolVersion: number;
  /** Client name/description (optional) */
  clientName?: string;
}

/**
 * Field config message (Server -> Robot)
 * Sent once when robot connects
 */
export interface FieldConfigPayload {
  /** Unique field ID */
  fieldId: string;
  /** Full field configuration */
  config: FieldConfig;
  /** Tick rate (ticks per second) */
  tickRate: number;
  /** Command timeout in milliseconds */
  commandTimeoutMs: number;
}

/**
 * Tick update message (Server -> Robot)
 * Sent every tick
 */
export interface TickUpdatePayload {
  /** Full world state */
  state: WireWorldState;
}

/**
 * Robot command message (Robot -> Server)
 */
export interface RobotCommandPayload {
  /** Robot command */
  command: WireRobotCommand;
}

/**
 * Match end message (Server -> Robot)
 */
export interface MatchEndPayload {
  /** Final red score */
  redScore: number;
  /** Final blue score */
  blueScore: number;
  /** Winner ('red', 'blue', or 'tie') */
  winner: 'red' | 'blue' | 'tie';
  /** Total match ticks */
  totalTicks: number;
}

/**
 * Error message
 */
export interface ErrorPayload {
  /** Error code */
  code: number;
  /** Error message */
  message: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for distributed simulation
 */
export interface DistributedConfig {
  /** Execution mode */
  mode: ExecutionMode;
  /** WebSocket server port for robot connections */
  robotPort: number;
  /** Command timeout in milliseconds (default: 100ms) */
  commandTimeoutMs: number;
  /** Ticks before disabling unresponsive robot (default: 30) */
  unresponsiveTicks: number;
  /** Whether to wait for all robots before starting (default: true) */
  waitForAllRobots: boolean;
  /** Expected robot IDs (required if waitForAllRobots is true) */
  expectedRobotIds?: string[];
}

/**
 * Default distributed configuration
 */
export const DEFAULT_DISTRIBUTED_CONFIG: DistributedConfig = {
  mode: ExecutionMode.LOCAL,
  robotPort: 8081,
  commandTimeoutMs: 100,
  unresponsiveTicks: 30,
  waitForAllRobots: true,
};

// ============================================================================
// Type Guards and Converters
// ============================================================================

/**
 * Convert MatchPhase to WireMatchPhase
 */
export function matchPhaseToWire(phase: MatchPhase): WireMatchPhase {
  const mapping: Record<MatchPhase, WireMatchPhase> = {
    'PRE_MATCH': WireMatchPhase.PRE_MATCH,
    'AUTO': WireMatchPhase.AUTO,
    'TRANSITION': WireMatchPhase.TRANSITION,
    'SHIFT_1': WireMatchPhase.SHIFT_1,
    'SHIFT_2': WireMatchPhase.SHIFT_2,
    'SHIFT_3': WireMatchPhase.SHIFT_3,
    'SHIFT_4': WireMatchPhase.SHIFT_4,
    'ENDGAME': WireMatchPhase.ENDGAME,
    'POST_MATCH': WireMatchPhase.POST_MATCH,
  };
  return mapping[phase];
}

/**
 * Convert WireMatchPhase to MatchPhase
 */
export function wireToMatchPhase(phase: WireMatchPhase): MatchPhase {
  const mapping: Record<WireMatchPhase, MatchPhase> = {
    [WireMatchPhase.PRE_MATCH]: 'PRE_MATCH' as MatchPhase,
    [WireMatchPhase.AUTO]: 'AUTO' as MatchPhase,
    [WireMatchPhase.TRANSITION]: 'TRANSITION' as MatchPhase,
    [WireMatchPhase.SHIFT_1]: 'SHIFT_1' as MatchPhase,
    [WireMatchPhase.SHIFT_2]: 'SHIFT_2' as MatchPhase,
    [WireMatchPhase.SHIFT_3]: 'SHIFT_3' as MatchPhase,
    [WireMatchPhase.SHIFT_4]: 'SHIFT_4' as MatchPhase,
    [WireMatchPhase.ENDGAME]: 'ENDGAME' as MatchPhase,
    [WireMatchPhase.POST_MATCH]: 'POST_MATCH' as MatchPhase,
  };
  return mapping[phase];
}

/**
 * Convert RobotActionType to WireRobotActionType
 */
export function robotActionToWire(action: RobotActionType): WireRobotActionType {
  const mapping: Record<RobotActionType, WireRobotActionType> = {
    'IDLE': WireRobotActionType.IDLE,
    'MOVING': WireRobotActionType.MOVING,
    'PICKING_UP': WireRobotActionType.PICKING_UP,
    'SHOOTING': WireRobotActionType.SHOOTING,
    'PASSING': WireRobotActionType.PASSING,
    'CLIMBING': WireRobotActionType.CLIMBING,
    'DEFENDING': WireRobotActionType.DEFENDING,
  };
  return mapping[action];
}

/**
 * Convert WireRobotActionType to RobotActionType
 */
export function wireToRobotAction(action: WireRobotActionType): RobotActionType {
  const mapping: Record<WireRobotActionType, RobotActionType> = {
    [WireRobotActionType.IDLE]: 'IDLE' as RobotActionType,
    [WireRobotActionType.MOVING]: 'MOVING' as RobotActionType,
    [WireRobotActionType.PICKING_UP]: 'PICKING_UP' as RobotActionType,
    [WireRobotActionType.SHOOTING]: 'SHOOTING' as RobotActionType,
    [WireRobotActionType.PASSING]: 'PASSING' as RobotActionType,
    [WireRobotActionType.CLIMBING]: 'CLIMBING' as RobotActionType,
    [WireRobotActionType.DEFENDING]: 'DEFENDING' as RobotActionType,
  };
  return mapping[action];
}

/**
 * Convert ShiftParity to WireShiftParity
 */
export function shiftParityToWire(parity: ShiftParity | null): WireShiftParity {
  if (parity === null) return WireShiftParity.NULL;
  return parity === 'EVEN' ? WireShiftParity.EVEN : WireShiftParity.ODD;
}

/**
 * Convert WireShiftParity to ShiftParity
 */
export function wireToShiftParity(parity: WireShiftParity): ShiftParity | null {
  if (parity === WireShiftParity.NULL) return null;
  return parity === WireShiftParity.EVEN ? 'EVEN' : 'ODD';
}

/**
 * Convert alliance string to WireAlliance
 */
export function allianceToWire(alliance: 'red' | 'blue'): WireAlliance {
  return alliance === 'red' ? WireAlliance.RED : WireAlliance.BLUE;
}

/**
 * Convert WireAlliance to alliance string
 */
export function wireToAlliance(alliance: WireAlliance): 'red' | 'blue' {
  return alliance === WireAlliance.RED ? 'red' : 'blue';
}

// ============================================================================
// Protocol Version
// ============================================================================

/**
 * Current protocol version
 * Increment when making breaking changes to the protocol
 */
export const PROTOCOL_VERSION = 1;
