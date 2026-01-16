import {
  createDemoSetup,
  SimulationEngine,
  IdleStrategy,
  CollectorStrategy,
  ScorerStrategy,
  SimulationMode,
  Vector2D
} from '../src/index.js';

async function main() {
  console.log('=== Movement Debug Demo ===\n');

  const setup = createDemoSetup();
  setup.simulation.mode = SimulationMode.HEADLESS;

  const engine = new SimulationEngine(setup);
  engine.registerStrategy(new IdleStrategy());
  engine.registerStrategy(new CollectorStrategy());
  engine.registerStrategy(new ScorerStrategy());

  // Run manually for detailed tracking
  const match = engine.getMatch();
  match.start();

  console.log('Ball positions:');
  for (const ball of match.getBalls()) {
    console.log(`  ${ball.id}: (${ball.position.x}, ${ball.position.y})`);
  }

  console.log('\n--- TICK BY TICK (first 20 ticks) ---');

  for (let i = 0; i < 20; i++) {
    engine.tick();

    const state = engine.getState();
    const robot = state.robots[0]; // Just track red-1

    const nearestBall = match.getAvailableBalls()[0];
    const distToBall = nearestBall ? Vector2D.fromPosition(robot.position).distanceTo(nearestBall.position) : -1;

    console.log(`Tick ${i}: pos=(${robot.position.x.toFixed(1)}, ${robot.position.y.toFixed(1)}) vel=${robot.velocity.toFixed(1)} heading=${robot.heading.toFixed(1)}° action=${robot.currentAction.type} path=${robot.currentPath.length} pathIdx=${robot.pathIndex} distToBall=${distToBall.toFixed(1)}`);
  }

  console.log('\n--- Continue to tick 600 (10 seconds) ---');

  for (let i = 20; i < 600; i++) {
    engine.tick();

    if (i % 60 === 0) {
      const state = engine.getState();
      const robot = state.robots[0];
      const nearestBall = match.getAvailableBalls()[0];
      const distToBall = nearestBall ? Vector2D.fromPosition(robot.position).distanceTo(nearestBall.position) : -1;

      console.log(`Tick ${i} (${(i/60).toFixed(1)}s): pos=(${robot.position.x.toFixed(1)}, ${robot.position.y.toFixed(1)}) vel=${robot.velocity.toFixed(1)} action=${robot.currentAction.type} balls=${robot.heldBalls.length} distToBall=${distToBall.toFixed(1)}`);
    }
  }
}

main().catch(console.error);
