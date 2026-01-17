/**
 * World Server Entry Point
 *
 * Starts the distributed world server that accepts robot client connections
 * and visualization connections.
 *
 * Usage:
 *   npm run serve:world
 *   npm run serve:world -- --robot-port=8081 --viz-port=8080
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { createDemoSetup } from '../src/index.js';
import { WorldServer, WorldServerEvents } from '../src/distributed/WorldServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration from command line args
const args = process.argv.slice(2);
const robotPort = parseInt(args.find(a => a.startsWith('--robot-port='))?.split('=')[1] ?? '8081', 10);
const vizPort = parseInt(args.find(a => a.startsWith('--viz-port='))?.split('=')[1] ?? '8080', 10);
const httpPort = parseInt(args.find(a => a.startsWith('--http-port='))?.split('=')[1] ?? '3000', 10);
const autoStart = args.includes('--auto-start');

// MIME types for static file serving
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let server: WorldServer | null = null;
let matchStarted = false;

/**
 * Create the world server
 */
function createWorldServer(): WorldServer {
  const setup = createDemoSetup();

  const worldServer = new WorldServer(setup, {
    commandTimeoutMs: 100,
    unresponsiveTicks: 30,
    waitForAllRobots: true,
  });

  // Set up event handlers
  worldServer.events.on(WorldServerEvents.ROBOT_CONNECTED, (data) => {
    const { robotId, clientName } = data as { robotId: string; clientName?: string };
    console.log(`Robot connected: ${robotId}${clientName ? ` (${clientName})` : ''}`);
    console.log(`Connected robots: ${worldServer.getRobotClientCount()}/6`);
  });

  worldServer.events.on(WorldServerEvents.ROBOT_DISCONNECTED, (data) => {
    const { robotId } = data as { robotId: string };
    console.log(`Robot disconnected: ${robotId}`);
    console.log(`Connected robots: ${worldServer.getRobotClientCount()}/6`);
  });

  worldServer.events.on(WorldServerEvents.MATCH_READY, () => {
    console.log('\n=== All robots connected, match ready ===');
    if (autoStart && !matchStarted) {
      console.log('Auto-starting match...');
      startMatch();
    } else {
      console.log('Type "start" to begin the match');
    }
  });

  worldServer.events.on(WorldServerEvents.MATCH_ENDED, (data) => {
    const { result } = data as { result: { score: { red: { total: number }; blue: { total: number } }; winner: string | null } };
    console.log('\n=== Match Ended ===');
    console.log(`Final Score: Red ${result.score.red.total} - Blue ${result.score.blue.total}`);
    console.log(`Winner: ${result.winner ?? 'Tie'}`);
    matchStarted = false;
  });

  return worldServer;
}

/**
 * Start the match
 */
async function startMatch() {
  if (!server || matchStarted) return;

  matchStarted = true;
  console.log('Starting match...');

  try {
    await server.startMatch();
  } catch (error) {
    console.error('Match error:', error);
    matchStarted = false;
  }
}

/**
 * Start HTTP server for static files
 */
function startHttpServer() {
  const publicDir = join(__dirname, '..', 'public');

  const httpServer = createServer((req, res) => {
    let filePath = join(publicDir, req.url === '/' ? 'index.html' : req.url || '');

    // Security: prevent directory traversal
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Check if file exists
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // Get MIME type
    const ext = extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
      const content = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content);
    } catch {
      res.writeHead(500);
      res.end('Server Error');
    }
  });

  httpServer.listen(httpPort, () => {
    console.log(`HTTP server running at http://localhost:${httpPort}`);
  });

  return httpServer;
}

/**
 * Main function
 */
async function main() {
  console.log('=== FRC Score Simulator - Distributed World Server ===\n');

  // Create world server
  server = createWorldServer();

  // Start the world server
  await server.start(robotPort, vizPort);

  // Start HTTP server for visualization
  startHttpServer();

  console.log(`\nServer Configuration:`);
  console.log(`  Robot connections:     ws://localhost:${robotPort}`);
  console.log(`  Visualization:         ws://localhost:${vizPort}`);
  console.log(`  Browser UI:            http://localhost:${httpPort}`);

  console.log(`\nExpected Robots (6):`);
  const match = server.getMatch();
  for (const robot of match.getRobots()) {
    console.log(`  - ${robot.id} (${robot.alliance})`);
  }

  console.log('\nWaiting for robot connections...');
  console.log('Connect robots using: npm run robot -- --id=<robot-id> --server=ws://localhost:8081');

  // Handle stdin for commands
  if (process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (input) => {
      const cmd = input.toString().trim().toLowerCase();
      switch (cmd) {
        case 'start':
          startMatch();
          break;
        case 'status':
          console.log(`Connected robots: ${server?.getRobotClientCount()}/6`);
          console.log(`Match running: ${matchStarted}`);
          break;
        case 'quit':
        case 'exit':
          shutdown();
          break;
        default:
          console.log('Commands: start, status, quit');
      }
    });
  }
}

/**
 * Shutdown handler
 */
async function shutdown() {
  console.log('\nShutting down...');
  if (server) {
    await server.stop();
  }
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(console.error);
