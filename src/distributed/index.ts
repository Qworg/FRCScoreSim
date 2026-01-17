/**
 * Distributed Robot Architecture Module
 *
 * This module provides components for running the FRC simulator in a distributed
 * mode where individual robots run as separate processes/machines.
 */

export { WorldServer, WorldServerEvents } from './WorldServer.js';
export { RobotClient, type RobotClientConfig, type RobotClientEventHandlers } from './RobotClient.js';
export { TickBarrier, type BarrierResult, type TickBarrierConfig } from './TickBarrier.js';
export { MessagePacker, ErrorCodes } from './MessagePacker.js';
