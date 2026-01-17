/**
 * Robot Client Entry Point
 *
 * Connects a single robot to the distributed world server and runs a strategy.
 *
 * Usage:
 *   npm run robot -- --id=red-1 --strategy=collector --server=ws://localhost:8081
 */

import {
  IdleStrategy,
  CollectorStrategy,
  ScorerStrategy,
  AutoClimbStrategy,
  EndgameClimberStrategy,
} from '../src/index.js';
import type { Strategy } from '../src/types/strategy.js';
import { RobotClient } from '../src/distributed/RobotClient.js';

// Parse command line arguments
const args = process.argv.slice(2);

function getArg(name: string, defaultValue?: string): string | undefined {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  if (arg) {
    return arg.split('=')[1];
  }
  return defaultValue;
}

const robotId = getArg('id');
const strategyName = getArg('strategy', 'collector');
const serverUrl = getArg('server', 'ws://localhost:8081');
const clientName = getArg('name');

if (!robotId) {
  console.error('Error: Robot ID required');
  console.error('Usage: npm run robot -- --id=<robot-id> [--strategy=<strategy>] [--server=<url>]');
  console.error('');
  console.error('Options:');
  console.error('  --id=<robot-id>       Robot ID (e.g., red-1, blue-2) [required]');
  console.error('  --strategy=<name>     Strategy to use (default: collector)');
  console.error('                        Available: idle, collector, scorer, auto-climb, endgame-climber');
  console.error('  --server=<url>        World server URL (default: ws://localhost:8081)');
  console.error('  --name=<name>         Client name for logging');
  console.error('');
  console.error('Examples:');
  console.error('  npm run robot -- --id=red-1 --strategy=scorer');
  console.error('  npm run robot -- --id=blue-2 --strategy=collector --server=ws://192.168.1.100:8081');
  process.exit(1);
}

/**
 * Create strategy by name
 */
function createStrategy(name: string): Strategy {
  switch (name.toLowerCase()) {
    case 'idle':
      return new IdleStrategy();
    case 'collector':
      return new CollectorStrategy();
    case 'scorer':
      return new ScorerStrategy();
    case 'auto-climb':
    case 'autoclimb':
      return new AutoClimbStrategy();
    case 'endgame-climber':
    case 'endgameclimber':
      return new EndgameClimberStrategy();
    default:
      console.warn(`Unknown strategy "${name}", using collector`);
      return new CollectorStrategy();
  }
}

/**
 * Main function
 */
async function main() {
  console.log('=== FRC Score Simulator - Robot Client ===\n');
  console.log(`Robot ID:  ${robotId}`);
  console.log(`Strategy:  ${strategyName}`);
  console.log(`Server:    ${serverUrl}`);
  if (clientName) {
    console.log(`Name:      ${clientName}`);
  }
  console.log('');

  // Create strategy
  const strategy = createStrategy(strategyName!);
  console.log(`Using strategy: ${strategy.name}`);

  // Create client
  const client = new RobotClient(
    {
      serverUrl: serverUrl!,
      robotId: robotId!,
      strategy,
      clientName: clientName ?? `${robotId}-client`,
      autoReconnect: true,
      reconnectDelayMs: 2000,
      maxReconnectAttempts: 10,
    },
    {
      onConnected: () => {
        console.log('Connected to server');
      },
      onDisconnected: () => {
        console.log('Disconnected from server');
      },
      onFieldConfig: (config) => {
        console.log(`Received field config: ${config.name} (${config.width}x${config.height})`);
      },
      onTick: (worldState) => {
        // Log periodically (every 60 ticks = 1 second)
        if (worldState.tick % 60 === 0) {
          const my = worldState.myRobot;
          console.log(
            `Tick ${worldState.tick}: ` +
            `pos=(${my.x.toFixed(0)}, ${my.y.toFixed(0)}) ` +
            `balls=${my.heldBalls} ` +
            `action=${my.action} ` +
            `score: R${worldState.redScore}-B${worldState.blueScore}`
          );
        }
      },
      onMatchEnd: (result) => {
        console.log('\n=== Match Ended ===');
        console.log(`Final Score: Red ${result.redScore} - Blue ${result.blueScore}`);
        console.log(`Winner: ${result.winner}`);
        console.log(`Total Ticks: ${result.totalTicks}`);
      },
      onError: (error) => {
        console.error('Error:', error.message);
      },
    }
  );

  // Connect to server
  console.log('\nConnecting to server...');
  try {
    await client.connect();
    console.log('Connection established, waiting for match to start...');
  } catch (error) {
    console.error('Failed to connect:', error);
    process.exit(1);
  }
}

/**
 * Shutdown handler
 */
function shutdown() {
  console.log('\nShutting down...');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(console.error);
