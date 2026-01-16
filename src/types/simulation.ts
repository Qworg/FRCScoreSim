import type { BallPhysicsConfig } from './ball.js';
import type { FieldConfig } from './field.js';
import type { GameRules } from './game.js';
import type { RobotConfig } from './robot.js';

/**
 * Simulation execution mode
 */
export enum SimulationMode {
  /** Fast execution, no delays, for batch simulations */
  HEADLESS = 'HEADLESS',
  /** Real-time execution at 1x speed */
  REALTIME = 'REALTIME',
  /** Manual tick advancement for debugging */
  STEP = 'STEP',
}

/**
 * Simulation configuration
 */
export interface SimulationConfig {
  /** Ticks per second (default: 60) */
  tickRate: number;
  /** Simulation mode */
  mode: SimulationMode;
  /** Random seed for reproducibility (null = random) */
  seed: number | null;
  /** Ball physics configuration */
  ballPhysics: BallPhysicsConfig;
  /** Game rules */
  gameRules: GameRules;
  /** Whether to record match events */
  recordEvents: boolean;
  /** WebSocket server port (0 to disable) */
  wsPort: number;
}

/**
 * Robot setup for a match
 */
export interface RobotSetup {
  config: RobotConfig;
  alliance: 'red' | 'blue';
  /** Strategy identifier to use */
  strategy: string;
}

/**
 * Match setup configuration
 */
export interface MatchSetup {
  /** Field configuration */
  field: FieldConfig;
  /** Robots participating */
  robots: RobotSetup[];
  /** Simulation configuration */
  simulation: SimulationConfig;
}

/**
 * Default simulation configuration
 */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  tickRate: 60,
  mode: SimulationMode.HEADLESS,
  seed: null,
  ballPhysics: {
    radius: 3.5, // 7" diameter ball
    groundFriction: 0.95,
    airResistance: 0.99,
    gravity: 386, // ~32 ft/s^2 in inches
    minVelocity: 1,
    respawnDelay: 180, // 3 seconds at 60 ticks/s
  },
  gameRules: {
    timing: {
      auto: 15,
      transition: 3,
      teleop: 135,
      endgameStart: 30,
    },
    climbPoints: 25,
    penaltyPoints: 3,
    maxBallsOnField: 11,
  },
  recordEvents: true,
  wsPort: 0,
};
