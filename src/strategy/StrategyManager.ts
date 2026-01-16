import type {
  Strategy,
  StrategyFactory,
  StrategyRegistryEntry,
} from '../types/index.js';

/**
 * Manager for strategy registration and retrieval
 */
export class StrategyManager {
  private registry: Map<string, StrategyRegistryEntry> = new Map();

  /**
   * Register a strategy
   */
  register(
    id: string,
    name: string,
    description: string,
    factory: StrategyFactory
  ): void {
    this.registry.set(id, { id, name, description, factory });
  }

  /**
   * Register a strategy from an instance (creates a factory that clones)
   */
  registerStrategy(strategy: Strategy): void {
    this.register(
      strategy.id,
      strategy.name,
      strategy.description,
      () => strategy
    );
  }

  /**
   * Get a strategy instance by ID
   */
  get(id: string): Strategy | null {
    const entry = this.registry.get(id);
    if (!entry) return null;
    return entry.factory();
  }

  /**
   * Check if a strategy is registered
   */
  has(id: string): boolean {
    return this.registry.has(id);
  }

  /**
   * Get all registered strategy IDs
   */
  getIds(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Get all registry entries
   */
  getAll(): StrategyRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Unregister a strategy
   */
  unregister(id: string): boolean {
    return this.registry.delete(id);
  }

  /**
   * Clear all registered strategies
   */
  clear(): void {
    this.registry.clear();
  }
}

/**
 * Global strategy manager instance
 */
export const globalStrategyManager = new StrategyManager();
