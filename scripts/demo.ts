import { runDemo } from '../src/index.js';

async function main() {
  console.log('Running FRC Robot Simulator Demo...\n');

  const result = await runDemo();

  console.log('=== MATCH RESULTS ===\n');
  console.log('Winner:', result.winner ?? 'TIE');
  console.log('Match Duration:', result.totalTime.toFixed(1), 'seconds');
  console.log('Total Ticks:', result.totalTicks);

  console.log('\n--- RED ALLIANCE ---');
  console.log('  Auto:', result.score.red.auto);
  console.log('  Teleop:', result.score.red.teleop);
  console.log('  Endgame:', result.score.red.endgame);
  console.log('  Penalties:', result.score.red.penalties);
  console.log('  TOTAL:', result.score.red.total);

  console.log('\n--- BLUE ALLIANCE ---');
  console.log('  Auto:', result.score.blue.auto);
  console.log('  Teleop:', result.score.blue.teleop);
  console.log('  Endgame:', result.score.blue.endgame);
  console.log('  Penalties:', result.score.blue.penalties);
  console.log('  TOTAL:', result.score.blue.total);

  console.log('\n--- EVENT SUMMARY ---');
  const eventCounts: Record<string, number> = {};
  for (const event of result.events) {
    eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(eventCounts)) {
    console.log(' ', type + ':', count);
  }

  console.log('\n--- SCORE BREAKDOWN ---');
  console.log('Red:', JSON.stringify(result.score.red.breakdown, null, 2));
  console.log('Blue:', JSON.stringify(result.score.blue.breakdown, null, 2));
}

main().catch(console.error);
