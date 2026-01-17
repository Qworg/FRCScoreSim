/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (data: T) => void;

/**
 * Event subscription
 */
interface Subscription {
  id: number;
  handler: EventHandler;
}

/**
 * Simple pub/sub event bus
 */
export class EventBus {
  private subscriptions: Map<string, Subscription[]> = new Map();
  private nextId: number = 0;

  /**
   * Subscribe to an event
   * @returns Unsubscribe function
   */
  on<T>(event: string, handler: EventHandler<T>): () => void {
    const id = this.nextId++;
    const subscription: Subscription = {
      id,
      handler: handler as EventHandler,
    };

    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, []);
    }
    this.subscriptions.get(event)!.push(subscription);

    return () => this.off(event, id);
  }

  /**
   * Subscribe to an event once
   */
  once<T>(event: string, handler: EventHandler<T>): () => void {
    const unsubscribe = this.on<T>(event, (data) => {
      unsubscribe();
      handler(data);
    });
    return unsubscribe;
  }

  /**
   * Emit an event
   */
  emit<T>(event: string, data: T): void {
    const subs = this.subscriptions.get(event);
    if (!subs) return;

    for (const sub of subs) {
      try {
        sub.handler(data);
      } catch (error) {
        console.error(`Error in event handler for '${event}':`, error);
      }
    }
  }

  /**
   * Remove a subscription by ID
   */
  private off(event: string, id: number): void {
    const subs = this.subscriptions.get(event);
    if (!subs) return;

    const index = subs.findIndex((s) => s.id === id);
    if (index !== -1) {
      subs.splice(index, 1);
    }
  }

  /**
   * Remove all subscriptions for an event
   */
  removeAllListeners(event: string): void {
    this.subscriptions.delete(event);
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subscriptions.clear();
  }

  /**
   * Get number of listeners for an event
   */
  listenerCount(event: string): number {
    return this.subscriptions.get(event)?.length ?? 0;
  }
}

/**
 * Simulation event types
 */
export const SimulationEvents = {
  TICK: 'tick',
  PHASE_CHANGE: 'phase_change',
  BALL_SCORED: 'ball_scored',
  BALL_PICKED_UP: 'ball_picked_up',
  BALL_SHOT: 'ball_shot',
  ROBOT_ARRIVED: 'robot_arrived',
  ROBOT_COLLISION: 'robot_collision',
  ROBOT_CLIMB_SUCCESS: 'robot_climb_success',
  ROBOT_STUCK: 'robot_stuck',
  ROBOT_ESCAPE: 'robot_escape',
  DECISION_LOGGED: 'decision_logged',
  DECISION_REJECTED: 'decision_rejected',
  MATCH_START: 'match_start',
  MATCH_END: 'match_end',
  STATE_UPDATE: 'state_update',
} as const;

export type SimulationEventType =
  (typeof SimulationEvents)[keyof typeof SimulationEvents];
