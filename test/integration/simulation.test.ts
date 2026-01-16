import { describe, expect, it } from 'vitest';
import {
  createDemoSetup,
  SimulationEngine,
  IdleStrategy,
  CollectorStrategy,
  ScorerStrategy,
  SimulationMode,
} from '../../src/index.js';

describe('Simulation Integration', () => {
  it('should run a complete headless match', async () => {
    const setup = createDemoSetup();
    setup.simulation.mode = SimulationMode.HEADLESS;

    const engine = new SimulationEngine(setup);
    engine.registerStrategy(new IdleStrategy());
    engine.registerStrategy(new CollectorStrategy());
    engine.registerStrategy(new ScorerStrategy());

    const result = await engine.start();

    expect(result).toBeDefined();
    expect(result.totalTicks).toBeGreaterThan(0);
    expect(result.score).toBeDefined();
    expect(result.score.red).toBeDefined();
    expect(result.score.blue).toBeDefined();
  });

  it('should track events during match', async () => {
    const setup = createDemoSetup();
    setup.simulation.mode = SimulationMode.HEADLESS;
    setup.simulation.recordEvents = true;

    const engine = new SimulationEngine(setup);
    engine.registerStrategy(new IdleStrategy());
    engine.registerStrategy(new CollectorStrategy());
    engine.registerStrategy(new ScorerStrategy());

    const result = await engine.start();

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events[0].type).toBe('MATCH_START');
    expect(result.events[result.events.length - 1].type).toBe('MATCH_END');
  });

  it('should correctly time match phases', async () => {
    const setup = createDemoSetup();
    setup.simulation.mode = SimulationMode.HEADLESS;
    setup.simulation.tickRate = 60;

    // Custom shorter match for faster test (shift-based timing)
    setup.simulation.gameRules = {
      ...setup.simulation.gameRules,
      timing: {
        auto: 5,
        transition: 1,
        shift1: 3,
        shift2: 3,
        shift3: 3,
        shift4: 3,
        endgame: 5,
      },
    };

    const engine = new SimulationEngine(setup);
    engine.registerStrategy(new IdleStrategy());
    engine.registerStrategy(new CollectorStrategy());
    engine.registerStrategy(new ScorerStrategy());

    const result = await engine.start();

    // Total time should be approximately auto + transition + shifts + endgame
    const expectedTime = 5 + 1 + 3 + 3 + 3 + 3 + 5;
    expect(result.totalTime).toBeCloseTo(expectedTime, 0);
  });

  it('should handle robots with different strategies', async () => {
    const setup = createDemoSetup();
    setup.simulation.mode = SimulationMode.HEADLESS;

    // Mix of strategies
    setup.robots[0].strategy = 'scorer';
    setup.robots[1].strategy = 'collector';
    setup.robots[2].strategy = 'idle';
    setup.robots[3].strategy = 'scorer';

    const engine = new SimulationEngine(setup);
    engine.registerStrategy(new IdleStrategy());
    engine.registerStrategy(new CollectorStrategy());
    engine.registerStrategy(new ScorerStrategy());

    const result = await engine.start();

    expect(result).toBeDefined();
    expect(result.winner).toBeDefined(); // Should have a winner or tie
  });

  it('should record match data', async () => {
    const setup = createDemoSetup();
    setup.simulation.mode = SimulationMode.HEADLESS;

    const engine = new SimulationEngine(setup);
    engine.registerStrategy(new IdleStrategy());
    engine.registerStrategy(new CollectorStrategy());
    engine.registerStrategy(new ScorerStrategy());

    await engine.start();

    const recording = engine.recorder.getRecording();
    expect(recording.frames.length).toBeGreaterThan(0);
    expect(recording.result).toBeDefined();
  });

  it('should emit events during simulation', async () => {
    const setup = createDemoSetup();
    setup.simulation.mode = SimulationMode.HEADLESS;

    const engine = new SimulationEngine(setup);
    engine.registerStrategy(new IdleStrategy());
    engine.registerStrategy(new CollectorStrategy());
    engine.registerStrategy(new ScorerStrategy());

    let tickCount = 0;
    let matchStarted = false;
    let matchEnded = false;

    engine.events.on('tick', () => {
      tickCount++;
    });
    engine.events.on('match_start', () => {
      matchStarted = true;
    });
    engine.events.on('match_end', () => {
      matchEnded = true;
    });

    await engine.start();

    expect(matchStarted).toBe(true);
    expect(matchEnded).toBe(true);
    expect(tickCount).toBeGreaterThan(0);
  });
});
