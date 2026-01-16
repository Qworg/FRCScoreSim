import type {
  AllianceScore,
  GameRules,
  RankingPoints,
  Score,
  ShiftParity,
  ScoringTarget,
} from '../types/index.js';
import { MatchPhase, DEFAULT_SIMULATION_CONFIG } from '../types/index.js';

/**
 * Result of attempting a climb
 */
export interface ClimbResult {
  success: boolean;
  points: number;
  reason?: string;
}

/**
 * Default game rules
 */
export const DEFAULT_GAME_RULES: GameRules = DEFAULT_SIMULATION_CONFIG.gameRules;

/**
 * Create an empty alliance score
 */
export function createAllianceScore(): AllianceScore {
  return {
    auto: 0,
    teleop: 0,
    endgame: 0,
    penalties: 0,
    total: 0,
    breakdown: {},
    autoBallCount: 0,
    totalBallCount: 0,
    autoClimbCount: 0,
    endgameClimbCount: 0,
    endgameClimbLevelTotal: 0,
  };
}

/**
 * Create empty ranking points
 */
export function createRankingPoints(): RankingPoints {
  return {
    total: 0,
    winRP: 0,
    tieRP: 0,
    balls100RP: 0,
    balls360RP: 0,
    climbRP: 0,
  };
}

/**
 * Create initial score state
 */
export function createScore(): Score {
  return {
    red: createAllianceScore(),
    blue: createAllianceScore(),
  };
}

/**
 * Scoring system for managing match scores
 */
export class ScoringSystem {
  private score: Score;
  private rules: GameRules;
  private redParity: ShiftParity | null = null;
  private blueParity: ShiftParity | null = null;
  private parityDetermined: boolean = false;

  constructor(rules: GameRules = DEFAULT_GAME_RULES) {
    this.rules = rules;
    this.score = createScore();
  }

  /**
   * Get current scores
   */
  getScore(): Score {
    return this.score;
  }

  /**
   * Get score for an alliance
   */
  getAllianceScore(alliance: 'red' | 'blue'): AllianceScore {
    return this.score[alliance];
  }

  /**
   * Get shift parity for an alliance (null if not yet determined)
   */
  getShiftParity(alliance: 'red' | 'blue'): ShiftParity | null {
    return alliance === 'red' ? this.redParity : this.blueParity;
  }

  /**
   * Determine shift parity based on auto ball counts
   * Should be called when transitioning out of AUTO phase
   */
  determineShiftParity(): void {
    if (this.parityDetermined) return;

    const redBalls = this.score.red.autoBallCount;
    const blueBalls = this.score.blue.autoBallCount;

    // Alliance that scores MOST balls during auto is EVEN (scores in Shift 2 and 4)
    // If tied, red is EVEN (arbitrary tiebreaker)
    if (redBalls >= blueBalls) {
      this.redParity = 'EVEN';
      this.blueParity = 'ODD';
    } else {
      this.redParity = 'ODD';
      this.blueParity = 'EVEN';
    }

    this.parityDetermined = true;
  }

  /**
   * Check if an alliance can score during the current phase
   */
  canAllianceScore(alliance: 'red' | 'blue', phase: MatchPhase): boolean {
    // Everyone can score during AUTO, TRANSITION, and ENDGAME
    if (
      phase === MatchPhase.AUTO ||
      phase === MatchPhase.TRANSITION ||
      phase === MatchPhase.ENDGAME
    ) {
      return true;
    }

    // During shifts, only the designated alliance can score
    const parity = this.getShiftParity(alliance);
    if (!parity) return true; // If parity not determined, allow scoring

    switch (phase) {
      case MatchPhase.SHIFT_1:
      case MatchPhase.SHIFT_3:
        // ODD alliance scores during shifts 1 and 3
        return parity === 'ODD';
      case MatchPhase.SHIFT_2:
      case MatchPhase.SHIFT_4:
        // EVEN alliance scores during shifts 2 and 4
        return parity === 'EVEN';
      default:
        return true;
    }
  }

  /**
   * Record a scored ball
   */
  recordScore(
    alliance: 'red' | 'blue',
    target: ScoringTarget,
    phase: MatchPhase
  ): number {
    const isAuto = phase === MatchPhase.AUTO;
    const points = isAuto ? target.points.auto : target.points.teleop;

    const allianceScore = this.score[alliance];

    if (isAuto) {
      allianceScore.auto += points;
      allianceScore.autoBallCount++; // Track ball count for parity determination
    } else {
      allianceScore.teleop += points;
    }

    // Track total balls scored for RP calculation
    allianceScore.totalBallCount++;

    // Update breakdown
    const targetKey = target.id;
    allianceScore.breakdown[targetKey] =
      (allianceScore.breakdown[targetKey] || 0) + points;

    this.updateTotal(alliance);
    return points;
  }

  /**
   * Check if an alliance can have another auto climber
   */
  canAutoClimb(alliance: 'red' | 'blue'): boolean {
    return this.score[alliance].autoClimbCount < this.rules.maxAutoClimbers;
  }

  /**
   * Check if an alliance can have another endgame climber
   */
  canEndgameClimb(alliance: 'red' | 'blue'): boolean {
    return this.score[alliance].endgameClimbCount < this.rules.maxEndgameClimbers;
  }

  /**
   * Record an auto climb (15 points, max 2 per alliance)
   */
  recordAutoClimb(alliance: 'red' | 'blue'): ClimbResult {
    const allianceScore = this.score[alliance];

    if (allianceScore.autoClimbCount >= this.rules.maxAutoClimbers) {
      return {
        success: false,
        points: 0,
        reason: `Max auto climbers (${this.rules.maxAutoClimbers}) already reached`,
      };
    }

    const points = this.rules.autoClimbPoints;
    allianceScore.auto += points;
    allianceScore.autoClimbCount++;
    allianceScore.breakdown['autoClimb'] =
      (allianceScore.breakdown['autoClimb'] || 0) + points;
    this.updateTotal(alliance);

    return { success: true, points };
  }

  /**
   * Record an endgame climb (10 points per level, max 3 per alliance)
   */
  recordEndgameClimb(alliance: 'red' | 'blue', level: number): ClimbResult {
    const allianceScore = this.score[alliance];

    if (level < 1 || level > 3) {
      return {
        success: false,
        points: 0,
        reason: `Invalid climb level: ${level} (must be 1-3)`,
      };
    }

    if (allianceScore.endgameClimbCount >= this.rules.maxEndgameClimbers) {
      return {
        success: false,
        points: 0,
        reason: `Max endgame climbers (${this.rules.maxEndgameClimbers}) already reached`,
      };
    }

    const points = this.rules.endgameClimbPointsPerLevel * level;
    allianceScore.endgame += points;
    allianceScore.endgameClimbCount++;
    allianceScore.endgameClimbLevelTotal += level;
    const levelKey = `endgameClimbL${level}`;
    allianceScore.breakdown[levelKey] =
      (allianceScore.breakdown[levelKey] || 0) + points;
    this.updateTotal(alliance);

    return { success: true, points };
  }

  /**
   * @deprecated Use recordAutoClimb or recordEndgameClimb instead
   * Record a climb (legacy method for backwards compatibility)
   */
  recordClimb(alliance: 'red' | 'blue'): number {
    // Legacy behavior: record as endgame level 1 climb
    const result = this.recordEndgameClimb(alliance, 1);
    return result.points;
  }

  /**
   * Record a penalty against an alliance
   * Penalties are added to the OTHER alliance's score
   */
  recordPenalty(
    againstAlliance: 'red' | 'blue',
    reason: string = 'penalty'
  ): number {
    const points = this.rules.penaltyPoints;
    const benefitingAlliance = againstAlliance === 'red' ? 'blue' : 'red';

    this.score[benefitingAlliance].penalties += points;
    const key = `penalty_${reason}`;
    this.score[benefitingAlliance].breakdown[key] =
      (this.score[benefitingAlliance].breakdown[key] || 0) + points;
    this.updateTotal(benefitingAlliance);

    return points;
  }

  /**
   * Add arbitrary points (for custom scoring rules)
   */
  addPoints(
    alliance: 'red' | 'blue',
    points: number,
    category: 'auto' | 'teleop' | 'endgame',
    breakdownKey: string
  ): void {
    this.score[alliance][category] += points;
    this.score[alliance].breakdown[breakdownKey] =
      (this.score[alliance].breakdown[breakdownKey] || 0) + points;
    this.updateTotal(alliance);
  }

  /**
   * Update total score for an alliance
   */
  private updateTotal(alliance: 'red' | 'blue'): void {
    const s = this.score[alliance];
    s.total = s.auto + s.teleop + s.endgame + s.penalties;
  }

  /**
   * Get the winner
   */
  getWinner(): 'red' | 'blue' | null {
    if (this.score.red.total > this.score.blue.total) return 'red';
    if (this.score.blue.total > this.score.red.total) return 'blue';
    return null;
  }

  /**
   * Reset scores for a new match
   */
  reset(): void {
    this.score = createScore();
    this.redParity = null;
    this.blueParity = null;
    this.parityDetermined = false;
  }

  /**
   * Calculate ranking points for an alliance
   * RP conditions:
   * - 100+ balls scored: 1 RP
   * - 360+ balls scored: 1 RP
   * - 50+ climbing points: 1 RP
   * - Tied score: 1 RP
   * - Win: 3 RP
   */
  calculateRankingPoints(alliance: 'red' | 'blue'): RankingPoints {
    const rp = createRankingPoints();
    const allianceScore = this.score[alliance];
    const opponentScore = this.score[alliance === 'red' ? 'blue' : 'red'];

    // Win RP (3 points)
    if (allianceScore.total > opponentScore.total) {
      rp.winRP = 3;
    }

    // Tie RP (1 point)
    if (allianceScore.total === opponentScore.total) {
      rp.tieRP = 1;
    }

    // 100+ balls scored RP (1 point)
    if (allianceScore.totalBallCount >= 100) {
      rp.balls100RP = 1;
    }

    // 360+ balls scored RP (1 point)
    if (allianceScore.totalBallCount >= 360) {
      rp.balls360RP = 1;
    }

    // 50+ climbing points RP (1 point)
    if (allianceScore.endgame >= 50) {
      rp.climbRP = 1;
    }

    // Calculate total
    rp.total = rp.winRP + rp.tieRP + rp.balls100RP + rp.balls360RP + rp.climbRP;

    return rp;
  }

  /**
   * Clone the current score state
   */
  cloneScore(): Score {
    return {
      red: {
        ...this.score.red,
        breakdown: { ...this.score.red.breakdown },
      },
      blue: {
        ...this.score.blue,
        breakdown: { ...this.score.blue.breakdown },
      },
    };
  }
}
