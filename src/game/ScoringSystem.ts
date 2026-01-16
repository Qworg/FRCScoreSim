import type {
  AllianceScore,
  GameRules,
  Score,
  ShiftParity,
  ScoringTarget,
} from '../types/index.js';
import { MatchPhase, DEFAULT_SIMULATION_CONFIG } from '../types/index.js';

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

    // Update breakdown
    const targetKey = target.id;
    allianceScore.breakdown[targetKey] =
      (allianceScore.breakdown[targetKey] || 0) + points;

    this.updateTotal(alliance);
    return points;
  }

  /**
   * Record a climb
   */
  recordClimb(alliance: 'red' | 'blue'): number {
    const points = this.rules.climbPoints;
    this.score[alliance].endgame += points;
    this.score[alliance].breakdown['climb'] =
      (this.score[alliance].breakdown['climb'] || 0) + points;
    this.updateTotal(alliance);
    return points;
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
