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
  console.log('=== ACTION TRACE ===\n');

  const setup = createDemoSetup();
  setup.simulation.mode = SimulationMode.HEADLESS;

  const engine = new SimulationEngine(setup);
  engine.registerStrategy(new IdleStrategy());
  engine.registerStrategy(new CollectorStrategy());
  engine.registerStrategy(new ScorerStrategy());

  const match = engine.getMatch();
  match.start();

  const robots = match.getRobots();
  const balls = match.getBalls();
  const robot = robots.find(r => r.id === 'red-1')!;
  const centerBall = balls.find(b => b.position.x === 200 && b.position.y === 162)!;

  console.log(`Tracking: ${robot.id} -> ${centerBall.id} at (${centerBall.position.x}, ${centerBall.position.y})\n`);

  // Listen for events
  engine.events.on('ball_picked_up', (data: any) => {
    console.log(`\n*** BALL_PICKED_UP: robot=${data.robotId} ball=${data.ballId} ***\n`);
  });

  for (let i = 0; i < 180; i++) {
    engine.tick();

    const dist = Vector2D.fromPosition(robot.position).distanceTo(centerBall.position);
    const action = robot.currentAction;
    const ballState = centerBall.state;

    // Log when within range or action changes
    if (dist < 25 || i % 30 === 0) {
      console.log(`Tick ${i}:`);
      console.log(`  pos: (${robot.position.x.toFixed(1)}, ${robot.position.y.toFixed(1)})`);
      console.log(`  dist: ${dist.toFixed(1)}`);
      console.log(`  action: ${action.type} progress=${action.progress.toFixed(2)} targetBallId=${action.targetBallId ?? 'none'}`);
      console.log(`  heldBalls: ${robot.heldBalls.length}`);
      console.log(`  ball state: ${ballState}`);
      console.log('');
    }

    if (robot.heldBalls.length > 0) {
      console.log('*** SUCCESS: Robot has picked up a ball ***');
      break;
    }
  }
}

main().catch(console.error);
