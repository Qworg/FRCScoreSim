import {
  createDemoSetup,
  SimulationEngine,
  IdleStrategy,
  CollectorStrategy,
  ScorerStrategy,
  SimulationMode,
  Vector2D,
  RobotActionType
} from '../src/index.js';

async function main() {
  console.log('=== COLLISION TRACE ===\n');

  const setup = createDemoSetup();
  setup.simulation.mode = SimulationMode.HEADLESS;

  const engine = new SimulationEngine(setup);
  engine.registerStrategy(new IdleStrategy());
  engine.registerStrategy(new CollectorStrategy());
  engine.registerStrategy(new ScorerStrategy());

  const match = engine.getMatch();
  match.start();

  // Get all robots
  const robots = match.getRobots();
  const balls = match.getBalls();

  console.log('Robots:');
  for (const robot of robots) {
    console.log(`  ${robot.id}: ${robot.alliance} at (${robot.position.x}, ${robot.position.y})`);
  }

  console.log('\nBalls:');
  for (const ball of balls) {
    console.log(`  ${ball.id}: (${ball.position.x}, ${ball.position.y})`);
  }

  const centerBall = balls.find(b => b.position.x === 200 && b.position.y === 162);
  console.log(`\nCenter ball: ${centerBall?.id}`);

  console.log('\n--- TICK TRACE (all robots) ---\n');

  // Listen for collision events
  engine.events.on('robot_collision', (data: any) => {
    console.log(`  !! COLLISION: ${data.robot1Id} <-> ${data.robot2Id}`);
  });

  for (let i = 0; i < 150; i++) {
    engine.tick();

    // Log all robot positions at key intervals
    if (i % 20 === 0 || (i > 80 && i < 130)) {
      console.log(`Tick ${i}:`);
      for (const robot of robots) {
        const distToCenter = centerBall ? Vector2D.fromPosition(robot.position).distanceTo(centerBall.position) : -1;
        console.log(`  ${robot.id} (${robot.alliance}): pos=(${robot.position.x.toFixed(1)}, ${robot.position.y.toFixed(1)}) vel=${robot.velocity.toFixed(1)} distToCenter=${distToCenter.toFixed(1)}`);
      }
      console.log('');
    }

    // Check if any robot picked up
    const heldBalls = robots.reduce((sum, r) => sum + r.heldBalls.length, 0);
    if (heldBalls > 0) {
      console.log(`\n*** BALL PICKED UP at tick ${i} ***`);
      for (const robot of robots) {
        if (robot.heldBalls.length > 0) {
          console.log(`  ${robot.id} has ${robot.heldBalls.length} balls`);
        }
      }
      break;
    }
  }

  console.log('\n--- FINAL STATE ---');
  for (const robot of robots) {
    console.log(`${robot.id}: pos=(${robot.position.x.toFixed(1)}, ${robot.position.y.toFixed(1)}) balls=${robot.heldBalls.length}`);
  }
}

main().catch(console.error);
