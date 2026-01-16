import type { StrategyContext, StrategyDecision } from '../../types/index.js';
import { BaseStrategy } from '../BaseStrategy.js';

/**
 * Idle strategy - robot does nothing
 */
export class IdleStrategy extends BaseStrategy {
  readonly id = 'idle';
  readonly name = 'Idle';
  readonly description = 'Robot does nothing and stays in place';

  decide(_context: StrategyContext): StrategyDecision {
    return this.idle('Idle strategy - doing nothing');
  }
}
