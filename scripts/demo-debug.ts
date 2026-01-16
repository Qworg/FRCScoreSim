import {
  createDemoSetup,
  SimulationEngine,
  IdleStrategy,
  CollectorStrategy,
  ScorerStrategy,
  SimulationMode,
  AStar,
  Field,
  Vector2D
} from '../src/index.js';

async function main() {
  console.log('=== DEBUG: FRC Robot Simulator ===\n');

  const setup = createDemoSetup();

  // Debug field and ball positions
  console.log('--- FIELD CONFIG ---');
  console.log('Field size:', setup.field.width, 'x', setup.field.height);
  console.log('Ball spawn points:');
  for (const sp of setup.field.ballSpawnPoints) {
    console.log(`  ${sp.id}: (${sp.position.x}, ${sp.position.y})`);
  }
  console.log('Robot starting positions:');
  console.log('  Red:', setup.field.startingPositions.red);
  console.log('  Blue:', setup.field.startingPositions.blue);
  console.log('Scoring targets:');
  for (const t of setup.field.scoringTargets) {
    console.log(`  ${t.id}: (${t.position.x}, ${t.position.y}) r=${t.radius}`);
  }

  // Create field and test pathfinding
  const field = new Field(setup.field);
  const pathfinder = new AStar(field, { robotHeight: 45 });

  console.log('\n--- PATHFINDING TEST ---');
  const redStart = setup.field.startingPositions.red[0];
  const ball1 = setup.field.ballSpawnPoints[0].position;

  console.log(`Path from red start (${redStart.x}, ${redStart.y}) to ball1 (${ball1.x}, ${ball1.y}):`);
  const pathResult = pathfinder.findPath(redStart, ball1);
  console.log('  Found:', pathResult.found);
  console.log('  Iterations:', pathResult.iterations);
  console.log('  Path length:', pathResult.path.length);
  if (pathResult.path.length > 0) {
    console.log('  First waypoint:', pathResult.path[0]);
    console.log('  Last waypoint:', pathResult.path[pathResult.path.length - 1]);
  }

  // Test cell accessibility
  console.log('\n--- CELL ACCESSIBILITY ---');
  const testPositions = [redStart, ball1, {x: 200, y: 162}, {x: 324, y: 162}];
  for (const pos of testPositions) {
    const gridPos = field.positionToGrid(pos);
    const canTraverse = field.canRobotTraverse(gridPos, 45);
    const cell = field.getCell(gridPos);
    console.log(`  (${pos.x}, ${pos.y}) -> grid(${gridPos.col}, ${gridPos.row}): traverse=${canTraverse}, zone=${cell?.zone}`);
  }

  // Run a short simulation with manual strategy tracking
  console.log('\n--- SIMULATION (first 60 ticks) ---');
  setup.simulation.mode = SimulationMode.HEADLESS;

  const engine = new SimulationEngine(setup);
  engine.registerStrategy(new IdleStrategy());
  engine.registerStrategy(new CollectorStrategy());
  engine.registerStrategy(new ScorerStrategy());

  // Run just a few ticks manually
  const match = engine.getMatch();
  match.start();

  for (let i = 0; i < 60; i++) {
    engine.tick();

    if (i % 10 === 0) {
      const state = engine.getState();
      console.log(`\nTick ${i}:`);
      for (const robot of state.robots) {
        console.log(`  ${robot.alliance} ${robot.id}: pos=(${robot.position.x.toFixed(0)}, ${robot.position.y.toFixed(0)}) action=${robot.currentAction.type} balls=${robot.heldBalls.length}`);
      }
      console.log(`  Available balls: ${state.balls.filter(b => b.state === 'ON_FIELD').length}`);
    }
  }
}

main().catch(console.error);
