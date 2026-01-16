import {
  createDemoSetup,
  SimulationEngine,
  IdleStrategy,
  CollectorStrategy,
  ScorerStrategy,
  SimulationMode
} from '../src/index.js';

async function main() {
  console.log('Running FRC Robot Simulator Demo (Verbose)...\n');

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

  // Sample state every few seconds
  const snapshots: string[] = [];
  engine.events.on('tick', (data: any) => {
    const { tick, state } = data;
    if (tick % 300 === 0) { // Every 5 seconds at 60 ticks/s
      const time = (tick / 60).toFixed(0);
      const robotSummary = state.robots.map((r: any) =>
        `${r.alliance[0].toUpperCase()}${r.id.slice(-1)}: balls=${r.heldBalls.length}, action=${r.currentAction.type}`
      ).join(' | ');
      snapshots.push(`[${time}s] ${robotSummary}`);
    }
  });

  const result = await engine.start();

  console.log('=== MATCH RESULTS ===\n');
  console.log('Winner:', result.winner ?? 'TIE');
  console.log('Duration:', result.totalTime.toFixed(1), 'seconds');

  console.log('\n--- SCORES ---');
  console.log('Red:', result.score.red.total, '| Blue:', result.score.blue.total);

  console.log('\n--- ACTIVITY ---');
  console.log('Ball Pickups:', ballPickups);
  console.log('Ball Shots:', ballShots);
  console.log('Balls Scored:', ballScores);

  console.log('\n--- TIMELINE SNAPSHOTS ---');
  for (const snap of snapshots.slice(0, 15)) {
    console.log(snap);
  }

  console.log('\n--- ALL EVENTS ---');
  for (const event of result.events) {
    const time = (event.tick / 60).toFixed(1);
    console.log(`[${time}s] ${event.type}${event.robotId ? ` robot=${event.robotId}` : ''}${event.points ? ` +${event.points}pts` : ''}`);
  }
}

main().catch(console.error);
