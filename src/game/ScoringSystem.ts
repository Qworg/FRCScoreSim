import type {
  AllianceScore,
  GameRules,
  Score,
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
