import {
  createDemoSetup,
  SimulationEngine,
  IdleStrategy,
  CollectorStrategy,
  ScorerStrategy,
  SimulationMode,
  Vector2D,
  Field,
  Robot,
  createRobotState
} from '../src/index.js';
import { updateRobotMovement } from '../src/robot/Movement.js';

async function main() {
  console.log('=== Movement Trace Debug ===\n');

  const setup = createDemoSetup();
  const field = new Field(setup.field);

  // Create a test robot
  const robotConfig = setup.robots[0].config;
  const robot = new Robot(robotConfig, 'red', { x: 187, y: 156 }, 31);
  robot.setVelocity(45);

  const target = { x: 200.5, y: 162.5 };
  const deltaTime = 1/60;

  console.log('Robot config:');
  console.log('  topSpeed:', robotConfig.topSpeed);
  console.log('  acceleration:', robotConfig.acceleration);

  console.log('\nInitial state:');
  console.log('  position:', robot.position);
  console.log('  heading:', robot.heading);
  console.log('  velocity:', robot.velocity);
  console.log('  target:', target);
  console.log('  distance to target:', Vector2D.fromPosition(robot.position).distanceTo(target).toFixed(2));

  // Simulate 60 ticks of movement
  for (let i = 0; i < 60; i++) {
    const result = updateRobotMovement(robot, target, field, deltaTime);

    if (i < 10 || i % 10 === 0) {
      const dist = Vector2D.fromPosition(result.position).distanceTo(target);
      console.log(`\nTick ${i}:`);
      console.log(`  newPos: (${result.position.x.toFixed(2)}, ${result.position.y.toFixed(2)})`);
      console.log(`  newVel: ${result.velocity.toFixed(2)}`);
      console.log(`  newHeading: ${result.heading.toFixed(2)}`);
      console.log(`  reachedTarget: ${result.reachedTarget}`);
      console.log(`  blocked: ${result.blocked}`);
      console.log(`  distToTarget: ${dist.toFixed(2)}`);
    }

    // Update robot state for next iteration
    robot.setPosition(result.position);
    robot.setHeading(result.heading);
    robot.setVelocity(result.velocity);

    if (result.reachedTarget || result.blocked) {
      console.log('\n*** Stopped:', result.reachedTarget ? 'reached target' : 'blocked');
      break;
    }
  }
}

main().catch(console.error);
