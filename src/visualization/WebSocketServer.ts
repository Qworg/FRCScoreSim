import { WebSocket, WebSocketServer as WSServer } from 'ws';
import type {
  FieldConfig,
  GameEvent,
  GameState,
  RobotConfig,
} from '../types/index.js';
import { SimulationEngine } from '../simulation/SimulationEngine.js';
import { SimulationEvents } from '../simulation/EventBus.js';

/**
 * WebSocket message types
 */
export type WSMessageType = 'state' | 'event' | 'config' | 'ping' | 'pong';

/**
 * WebSocket message structure
 */
export interface WSMessage {
  type: WSMessageType;
  tick?: number;
  data: unknown;
}

/**
 * Configuration message data
 */
export interface ConfigMessage {
  field: FieldConfig;
  robots: RobotConfig[];
}

/**
 * WebSocket server for broadcasting simulation state
 */
export class VisualizationServer {
  private server: WSServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private engine: SimulationEngine | null = null;
  private port: number;
  private unsubscribers: (() => void)[] = [];

  constructor(port: number = 8080) {
    this.port = port;
  }

  /**
   * Start the WebSocket server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = new WSServer({ port: this.port });

        this.server.on('connection', (ws) => this.handleConnection(ws));
        this.server.on('error', (error) => {
          console.error('WebSocket server error:', error);
        });

        this.server.on('listening', () => {
          console.log(`WebSocket server listening on port ${this.port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Unsubscribe from engine events
      for (const unsub of this.unsubscribers) {
        unsub();
      }
      this.unsubscribers = [];

      // Close all client connections
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();

      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Attach to a simulation engine
   */
  attachEngine(engine: SimulationEngine): void {
    this.engine = engine;

    // Subscribe to state updates
    const unsubState = engine.events.on(SimulationEvents.STATE_UPDATE, (state) => {
      this.broadcastState(state as GameState);
    });
    this.unsubscribers.push(unsubState);

    // Subscribe to match start to send config
    const unsubStart = engine.events.on(SimulationEvents.MATCH_START, () => {
      this.broadcastConfig();
    });
    this.unsubscribers.push(unsubStart);
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(`Client connected. Total clients: ${this.clients.size}`);

    // Send current config if engine is attached
    if (this.engine) {
      this.sendConfig(ws);
      // Send current state
      const state = this.engine.getState();
      this.sendState(ws, state);
    }

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        this.handleMessage(ws, message);
      } catch {
        console.error('Invalid message received');
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`Client disconnected. Total clients: ${this.clients.size}`);
    });

    ws.on('error', (error) => {
      console.error('WebSocket client error:', error);
      this.clients.delete(ws);
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(ws: WebSocket, message: WSMessage): void {
    switch (message.type) {
      case 'ping':
        this.send(ws, { type: 'pong', data: null });
        break;
      default:
        // Ignore unknown messages
        break;
    }
  }

  /**
   * Send message to a client
   */
  private send(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * Broadcast game state to all clients
   */
  broadcastState(state: GameState): void {
    this.broadcast({
      type: 'state',
      tick: state.tick,
      data: state,
    });
  }

  /**
   * Broadcast game event to all clients
   */
  broadcastEvent(event: GameEvent): void {
    this.broadcast({
      type: 'event',
      tick: event.tick,
      data: event,
    });
  }

  /**
   * Broadcast configuration to all clients
   */
  broadcastConfig(): void {
    if (!this.engine) return;

    const match = this.engine.getMatch();
    const config: ConfigMessage = {
      field: match.field.config,
      robots: match.getRobots().map((r) => r.config),
    };

    this.broadcast({
      type: 'config',
      data: config,
    });
  }

  /**
   * Send state to a specific client
   */
  private sendState(ws: WebSocket, state: GameState): void {
    this.send(ws, {
      type: 'state',
      tick: state.tick,
      data: state,
    });
  }

  /**
   * Send config to a specific client
   */
  private sendConfig(ws: WebSocket): void {
    if (!this.engine) return;

    const match = this.engine.getMatch();
    const config: ConfigMessage = {
      field: match.field.config,
      robots: match.getRobots().map((r) => r.config),
    };

    this.send(ws, {
      type: 'config',
      data: config,
    });
  }

  /**
   * Get the current port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Get the number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }
}
