import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import {
  createDemoSetup,
  SimulationEngine,
  VisualizationServer,
  SimulationMode,
  IdleStrategy,
  CollectorStrategy,
  ScorerStrategy,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const HTTP_PORT = 3000;
const WS_PORT = 8080;

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

// State
let engine: SimulationEngine | null = null;
let wsServer: VisualizationServer | null = null;
let isRunning = false;
let tickInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Create a new simulation engine
 */
function createEngine(): SimulationEngine {
  const setup = createDemoSetup();
  setup.simulation.mode = SimulationMode.STEP; // Use step mode for manual control

  const newEngine = new SimulationEngine(setup);
  newEngine.registerStrategy(new IdleStrategy());
  newEngine.registerStrategy(new CollectorStrategy());
  newEngine.registerStrategy(new ScorerStrategy());

  // Start the match (but don't run - we control via step)
  const match = newEngine.getMatch();
  match.start();

  return newEngine;
}

/**
 * Start the tick loop
 */
function startTickLoop() {
  if (tickInterval) return;

  isRunning = true;
  tickInterval = setInterval(() => {
    if (engine && isRunning) {
      engine.tick();

      // Check if match is finished
      const state = engine.getState();
      if (state.phase === 'POST_MATCH') {
        stopTickLoop();
        console.log('Match finished!');
      }
    }
  }, 1000 / 60); // 60 FPS
}

/**
 * Stop the tick loop
 */
function stopTickLoop() {
  isRunning = false;
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

/**
 * Handle control commands from WebSocket
 */
function handleControl(command: 'play' | 'pause' | 'step' | 'reset') {
  console.log(`Control command: ${command}`);

  switch (command) {
    case 'play':
      startTickLoop();
      break;

    case 'pause':
      stopTickLoop();
      break;

    case 'step':
      if (engine && !isRunning) {
        engine.tick();
      }
      break;

    case 'reset':
      stopTickLoop();
      // Create a new engine
      engine = createEngine();
      // Re-attach to WebSocket server
      if (wsServer && engine) {
        wsServer.attachEngine(engine);
        // Broadcast new config
        wsServer.broadcastConfig();
      }
      break;
  }
}

/**
 * Start HTTP server for static files
 */
function startHttpServer() {
  const publicDir = join(__dirname, '..', 'public');

  const server = createServer((req, res) => {
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
    } catch (err) {
      res.writeHead(500);
      res.end('Server Error');
    }
  });

  server.listen(HTTP_PORT, () => {
    console.log(`HTTP server running at http://localhost:${HTTP_PORT}`);
  });

  return server;
}

/**
 * Main function
 */
async function main() {
  console.log('=== FRC Score Simulator - Visualization Server ===\n');

  // Create simulation engine
  engine = createEngine();
  console.log('Simulation engine created');

  // Start WebSocket server
  wsServer = new VisualizationServer(WS_PORT);
  wsServer.onControl(handleControl);
  await wsServer.start();

  // Attach engine to WebSocket server
  wsServer.attachEngine(engine);

  // Start HTTP server
  startHttpServer();

  console.log(`\nOpen http://localhost:${HTTP_PORT} in your browser`);
  console.log('\nControls:');
  console.log('  Play   - Start the simulation');
  console.log('  Pause  - Pause the simulation');
  console.log('  Step   - Advance one tick');
  console.log('  Reset  - Reset to a new match');
  console.log('\nKeyboard shortcuts:');
  console.log('  Space       - Play/Pause');
  console.log('  Right Arrow - Step forward');
  console.log('  Ctrl+R      - Reset');
}

// Handle shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  stopTickLoop();
  if (wsServer) {
    await wsServer.stop();
  }
  process.exit(0);
});

main().catch(console.error);
