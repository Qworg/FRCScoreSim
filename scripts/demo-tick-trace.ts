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
  console.log('=== TICK-BY-TICK TRACE ===\n');

  const setup = createDemoSetup();
  setup.simulation.mode = SimulationMode.HEADLESS;

  const engine = new SimulationEngine(setup);
  engine.registerStrategy(new IdleStrategy());
  engine.registerStrategy(new CollectorStrategy());
  engine.registerStrategy(new ScorerStrategy());

  const match = engine.getMatch();
  match.start();

  // Get initial state
  const balls = match.getBalls();
  const robots = match.getRobots();
  const robot = robots[0]; // Track red-1

  console.log('Initial ball positions:');
  for (const ball of balls) {
    console.log(`  ${ball.id}: (${ball.position.x}, ${ball.position.y}) state=${ball.state}`);
  }

  console.log('\nInitial robot state:');
  console.log(`  ${robot.id}: pos=(${robot.position.x}, ${robot.position.y})`);
  console.log(`  action: ${robot.currentAction.type}`);
  console.log(`  path length: ${robot.state.currentPath.length}`);

  // Find nearest ball
  const nearestBall = balls.reduce((nearest, ball) => {
    const dist = Vector2D.fromPosition(robot.position).distanceTo(ball.position);
    const nearestDist = nearest ? Vector2D.fromPosition(robot.position).distanceTo(nearest.position) : Infinity;
    return dist < nearestDist ? ball : nearest;
  }, balls[0]);

  console.log(`\nNearest ball: ${nearestBall.id} at (${nearestBall.position.x}, ${nearestBall.position.y})`);
  console.log(`Distance: ${Vector2D.fromPosition(robot.position).distanceTo(nearestBall.position).toFixed(2)}`);

  console.log('\n--- TICK TRACE ---\n');

  // Run ticks and trace state changes
  let lastAction = robot.currentAction.type;
  let lastPathLen = robot.state.currentPath.length;

  for (let i = 0; i < 120; i++) {
    // Get pre-tick state
    const preAction = robot.currentAction.type;
    const prePath = robot.state.currentPath.length;
    const prePos = { ...robot.position };
    const preVel = robot.velocity;
    const preBalls = robot.heldBalls.length;

    engine.tick();

    // Get post-tick state
    const postAction = robot.currentAction.type;
    const postPath = robot.state.currentPath.length;
    const postPos = robot.position;
    const postVel = robot.velocity;
    const postBalls = robot.heldBalls.length;

    const distToBall = Vector2D.fromPosition(postPos).distanceTo(nearestBall.position);
    const ballState = nearestBall.state;

    // Log if anything interesting changed or at key ticks
    const stateChanged = preAction !== postAction || prePath !== postPath || preBalls !== postBalls;
    const shouldLog = stateChanged || i < 5 || i % 20 === 0 || distToBall < 25;

    if (shouldLog) {
      console.log(`Tick ${i}:`);
      console.log(`  pos: (${postPos.x.toFixed(1)}, ${postPos.y.toFixed(1)}) vel=${postVel.toFixed(1)}`);
      console.log(`  action: ${postAction} (was: ${preAction})`);
      console.log(`  path: ${postPath} waypoints`);
      console.log(`  distToBall: ${distToBall.toFixed(1)} (ball state: ${ballState})`);
      console.log(`  heldBalls: ${postBalls}`);

      if (stateChanged) {
        console.log(`  ** STATE CHANGED **`);
      }
      console.log('');
    }

    // Stop if robot picks up a ball
    if (postBalls > 0) {
      console.log('*** Robot picked up a ball! ***');
      break;
    }

    // Stop if robot gets stuck
    if (i > 60 && postAction === RobotActionType.IDLE && postBalls === 0) {
      console.log('*** Robot is IDLE with no balls - might be stuck ***');
      break;
    }
  }

  console.log('\n--- FINAL STATE ---');
  console.log(`Robot: pos=(${robot.position.x.toFixed(1)}, ${robot.position.y.toFixed(1)})`);
  console.log(`  action: ${robot.currentAction.type}`);
  console.log(`  heldBalls: ${robot.heldBalls.length}`);
  console.log(`Ball: pos=(${nearestBall.position.x.toFixed(1)}, ${nearestBall.position.y.toFixed(1)}) state=${nearestBall.state}`);
}

main().catch(console.error);
