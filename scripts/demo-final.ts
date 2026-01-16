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
  console.log('=== FRC Robot Simulator Demo ===\n');

  const setup = createDemoSetup();
  setup.simulation.mode = SimulationMode.HEADLESS;

  const engine = new SimulationEngine(setup);
  engine.registerStrategy(new IdleStrategy());
  engine.registerStrategy(new CollectorStrategy());
  engine.registerStrategy(new ScorerStrategy());

  // Track events
  let ballPickups = 0;
  let ballShots = 0;
  let ballScores = 0;

  engine.events.on('ball_picked_up', () => ballPickups++);
  engine.events.on('ball_shot', () => ballShots++);
  engine.events.on('ball_scored', () => ballScores++);

  // Track detailed state every 5 seconds
  engine.events.on('tick', (data: any) => {
    const { tick, state } = data;
    if (tick % 300 === 0 && tick > 0 && tick <= 1800) {
      const time = (tick / 60).toFixed(0);
      console.log(`\n[${time}s] Phase: ${state.phase}`);

      // Show robot positions and distances to nearest balls
      const availableBalls = state.balls.filter((b: any) => b.state === 'ON_FIELD');

      for (const robot of state.robots) {
        const pos = Vector2D.fromPosition(robot.position);
        let nearestDist = Infinity;
        let nearestBallId = '';

        for (const ball of availableBalls) {
          const dist = pos.distanceTo(ball.position);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestBallId = ball.id;
          }
        }

        console.log(`  ${robot.alliance}-${robot.id.slice(-1)}: pos=(${robot.position.x.toFixed(0)}, ${robot.position.y.toFixed(0)}) action=${robot.currentAction.type} balls=${robot.heldBalls.length} nearestBall=${nearestDist.toFixed(0)}in`);
      }

      console.log(`  Available balls: ${availableBalls.length}`);
    }
  });

  const result = await engine.start();

  console.log('\n\n=== FINAL RESULTS ===\n');
  console.log('Winner:', result.winner ?? 'TIE');
  console.log('Duration:', result.totalTime.toFixed(1), 'seconds');
  console.log('Total Ticks:', result.totalTicks);

  console.log('\n--- SCORES ---');
  console.log('Red:', result.score.red.total);
  console.log('  Auto:', result.score.red.auto);
  console.log('  Teleop:', result.score.red.teleop);
  console.log('  Endgame:', result.score.red.endgame);

  console.log('Blue:', result.score.blue.total);
  console.log('  Auto:', result.score.blue.auto);
  console.log('  Teleop:', result.score.blue.teleop);
  console.log('  Endgame:', result.score.blue.endgame);

  console.log('\n--- ACTIVITY ---');
  console.log('Ball Pickups:', ballPickups);
  console.log('Ball Shots:', ballShots);
  console.log('Balls Scored:', ballScores);

  console.log('\n--- KEY EVENTS ---');
  const keyEvents = result.events.filter((e: any) =>
    ['BALL_PICKED_UP', 'BALL_SHOT', 'BALL_SCORED', 'ROBOT_CLIMB_SUCCESS'].includes(e.type)
  );
  if (keyEvents.length === 0) {
    console.log('  (No scoring events occurred)');
  } else {
    for (const event of keyEvents.slice(0, 20)) {
      const time = (event.tick / 60).toFixed(1);
      console.log(`  [${time}s] ${event.type}${event.robotId ? ` robot=${event.robotId}` : ''}${event.points ? ` +${event.points}pts` : ''}`);
    }
  }
}

main().catch(console.error);
