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
    radius: 2.5, // 5" diameter ball
    groundFriction: 0.95,
    airResistance: 0.99,
    gravity: 386, // ~32 ft/s^2 in inches
    minVelocity: 1,
    respawnDelay: 180, // 3 seconds at 60 ticks/s
  },
  gameRules: {
    timing: {
      auto: 20,        // 20 seconds autonomous
      transition: 10,  // 10 seconds transition (all can score)
      shift1: 25,      // 25 seconds - ODD alliance scores
      shift2: 25,      // 25 seconds - EVEN alliance scores
      shift3: 25,      // 25 seconds - ODD alliance scores
      shift4: 25,      // 25 seconds - EVEN alliance scores
      endgame: 30,     // 30 seconds endgame (all can score)
    },
    autoClimbPoints: 15,           // 15 points per robot in auto
    endgameClimbPointsPerLevel: 10, // 10 points per level (10/20/30 for L1/L2/L3)
    maxAutoClimbers: 2,            // Max 2 robots can climb in auto
    maxEndgameClimbers: 3,         // Max 3 robots can climb in endgame
    penaltyPoints: 3,
    maxBallsOnField: 11,
  },
  recordEvents: true,
  wsPort: 0,
};
