# FRC Score Simulator - Distributed Protocol Specification

This document describes the binary protocol for communication between the World Server and Robot Clients in the distributed simulation mode.

## Overview

The distributed architecture separates the simulation into:
- **World Server**: Central authority for game state, physics, and scoring
- **Robot Clients**: Independent processes that receive world state and send commands

Communication uses WebSocket with MessagePack binary encoding for efficient, language-agnostic messaging.

## Protocol Version

Current version: **1**

Clients must send a matching protocol version in `CLIENT_HELLO`. Version mismatches result in connection termination.

## Message Format

All messages are MessagePack-encoded objects with the structure:

```
{
  type: uint8,      // Message type identifier
  payload: object   // Type-specific payload
}
```

## Message Types

### Server → Robot Messages

| Type | Code | Description |
|------|------|-------------|
| FIELD_CONFIG | 0x01 | Initial field configuration (sent once on connect) |
| TICK_UPDATE | 0x02 | Per-tick world state broadcast |
| MATCH_END | 0x03 | Match has ended |
| PONG | 0x21 | Response to PING |
| ERROR | 0xFF | Error notification |

### Robot → Server Messages

| Type | Code | Description |
|------|------|-------------|
| CLIENT_HELLO | 0x10 | Initial connection announcement |
| ROBOT_COMMAND | 0x11 | Command for current tick |
| PING | 0x20 | Latency probe |

## Message Payloads

### CLIENT_HELLO (0x10)

Sent by robot immediately after WebSocket connection.

```
{
  robotId: string,       // Robot ID to control (e.g., "red-1", "blue-2")
  protocolVersion: uint8, // Must match server's PROTOCOL_VERSION
  clientName?: string    // Optional client identifier for logging
}
```

### FIELD_CONFIG (0x01)

Sent by server after accepting CLIENT_HELLO.

```
{
  fieldId: string,       // Unique field identifier
  config: FieldConfig,   // Full field configuration (JSON-compatible)
  tickRate: uint16,      // Ticks per second (typically 60)
  commandTimeoutMs: uint16 // Deadline for command response
}
```

The `FieldConfig` object includes:
- Field dimensions (width, height in inches)
- Zone definitions (obstacles, ramps, trenches, etc.)
- Ball spawn points
- Scoring targets
- Starting positions

Robots should cache this configuration; it won't change during a match.

### TICK_UPDATE (0x02)

Broadcast to all robots every tick.

```
{
  state: WorldState
}
```

**WorldState structure:**

```
{
  tick: uint32,             // Current tick number
  deadlineMs: uint64,       // Unix timestamp (ms) for command deadline
  phase: uint8,             // Match phase (see Phase enum)
  phaseTimeRemaining: float32, // Seconds remaining in phase
  currentShift: uint8,      // Current shift (1-4) or 0 if not in shift

  myRobot: RobotState,      // This robot's full state
  robots: RobotState[],     // All 6 robots
  balls: BallState[],       // All balls on field

  fieldId: string,          // Reference to cached field config
  redScore: uint32,
  blueScore: uint32,
  redParity: uint8,         // 0=EVEN, 1=ODD, 255=null
  blueParity: uint8
}
```

**RobotState structure:**

```
{
  id: string,
  alliance: uint8,          // 0=red, 1=blue
  x: float32,               // X position (inches)
  y: float32,               // Y position (inches)
  heading: float32,         // Facing direction (degrees, 0=right, 90=up)
  velocity: float32,        // Speed (inches/second)
  action: uint8,            // Current action type (see Action enum)
  heldBalls: uint8,         // Number of balls held
  heldBallIds: string[],    // IDs of held balls
  hasAutoClimbed: bool,
  hasClimbed: bool,
  climbLevel: uint8 | null,
  isDisabled: bool
}
```

**BallState structure:**

```
{
  id: string,
  x: float32,
  y: float32,
  height: float32,          // Height above ground (inches)
  state: uint8,             // Ball state (see BallState enum)
  heldBy: string | null     // Robot ID if held
}
```

### ROBOT_COMMAND (0x11)

Sent by robot in response to TICK_UPDATE.

```
{
  command: {
    tick: uint32,             // Which tick this responds to
    robotId: string,          // Robot ID (must match connection)
    action: uint8,            // Requested action type
    targetX: float32 | null,  // For MOVING
    targetY: float32 | null,
    targetBallId: string | null, // For PICKING_UP
    targetZoneId: string | null, // For SHOOTING
    climbLevel: uint8 | null,    // For CLIMBING (1-3)
    isAutoClimb: bool         // true for auto-climb, false for endgame
  }
}
```

### MATCH_END (0x03)

Sent when match completes.

```
{
  redScore: uint32,
  blueScore: uint32,
  winner: string,           // "red", "blue", or "tie"
  totalTicks: uint32
}
```

### ERROR (0xFF)

```
{
  code: uint16,
  message: string
}
```

Error codes:
| Code | Name | Description |
|------|------|-------------|
| 0 | UNKNOWN | Unknown error |
| 1 | INVALID_MESSAGE | Message format error |
| 2 | ROBOT_NOT_FOUND | Robot ID not in match |
| 3 | DUPLICATE_ROBOT | Robot already connected |
| 4 | PROTOCOL_MISMATCH | Protocol version mismatch |
| 5 | TIMEOUT | Command timeout |
| 6 | MATCH_NOT_STARTED | Match hasn't started |
| 7 | MATCH_ENDED | Match already ended |
| 8 | INVALID_COMMAND | Invalid command |

## Enums

### Match Phase (uint8)

| Value | Name | Description |
|-------|------|-------------|
| 0 | PRE_MATCH | Before match starts |
| 1 | AUTO | Autonomous period (20s) |
| 2 | TRANSITION | Transition (10s, all can score) |
| 3 | SHIFT_1 | Shift 1 (25s, ODD scores) |
| 4 | SHIFT_2 | Shift 2 (25s, EVEN scores) |
| 5 | SHIFT_3 | Shift 3 (25s, ODD scores) |
| 6 | SHIFT_4 | Shift 4 (25s, EVEN scores) |
| 7 | ENDGAME | Endgame (30s, all can score) |
| 8 | POST_MATCH | Match ended |

### Robot Action (uint8)

| Value | Name | Description |
|-------|------|-------------|
| 0 | IDLE | Not doing anything |
| 1 | MOVING | Moving to target position |
| 2 | PICKING_UP | Picking up a ball |
| 3 | SHOOTING | Shooting a ball |
| 4 | CLIMBING | Climbing |

### Ball State (uint8)

| Value | Name | Description |
|-------|------|-------------|
| 0 | ON_FIELD | Available for pickup |
| 1 | HELD | Held by a robot |
| 2 | IN_FLIGHT | Shot/passed, in air |
| 3 | SCORED | Scored, awaiting respawn |
| 4 | OUT_OF_BOUNDS | Out of bounds, awaiting respawn |

### Alliance (uint8)

| Value | Name |
|-------|------|
| 0 | RED |
| 1 | BLUE |

### Shift Parity (uint8)

| Value | Name |
|-------|------|
| 0 | EVEN |
| 1 | ODD |
| 255 | NULL (not determined yet) |

## Tick Synchronization

1. Server sends `TICK_UPDATE` to all connected robots
2. Server waits for `ROBOT_COMMAND` from each robot (or timeout)
3. On timeout: robot uses IDLE; after 30 missed ticks, robot is disabled
4. Server executes all commands, runs physics
5. Server broadcasts state to visualization clients
6. Repeat

### Timing

- Default tick rate: 60 ticks/second (~16.67ms per tick)
- Default command timeout: 100ms
- Clients should respond well before the deadline in `deadlineMs`

## Connection Flow

```
Client                              Server
  |                                   |
  |-- WebSocket Connect ------------->|
  |                                   |
  |-- CLIENT_HELLO ------------------>|
  |     {robotId, protocolVersion}    |
  |                                   |
  |<------------ FIELD_CONFIG --------|
  |     {fieldId, config, tickRate}   |
  |                                   |
  |        [Wait for match start]     |
  |                                   |
  |<------------- TICK_UPDATE --------|
  |     {tick: 0, state: {...}}       |
  |                                   |
  |-- ROBOT_COMMAND ----------------->|
  |     {tick: 0, action: MOVING}     |
  |                                   |
  |<------------- TICK_UPDATE --------|
  |     {tick: 1, state: {...}}       |
  |                                   |
  |-- ROBOT_COMMAND ----------------->|
  |     {tick: 1, action: SHOOTING}   |
  |                                   |
  |            ... repeat ...         |
  |                                   |
  |<------------- MATCH_END ---------|
  |     {redScore, blueScore, winner} |
  |                                   |
```

## Implementation Notes

### MessagePack Libraries

- **TypeScript/JavaScript**: `@msgpack/msgpack`
- **Python**: `msgpack-python`
- **Rust**: `rmp-serde`
- **Go**: `github.com/vmihailenco/msgpack`
- **C++**: `msgpack-c`
- **Java**: `org.msgpack:msgpack-core`

### Pathfinding

Robots receive the full world state including all robot and ball positions. Clients can run A* pathfinding locally using:
- Field zones (from `FIELD_CONFIG`)
- Dynamic obstacles (robot positions from `TICK_UPDATE`)

The server provides the `targetX`/`targetY` in commands, and handles the actual movement physics.

### Shift-Based Scoring

During shifts 1-4:
- EVEN parity alliance scores during shifts 2 and 4
- ODD parity alliance scores during shifts 1 and 3

Parity is determined after AUTO phase based on which alliance scored more balls. The alliance with more auto-balls gets EVEN parity.

Use `redParity`/`blueParity` in world state to determine if your alliance can score.

## Example: Python Client

```python
import asyncio
import websocket
import msgpack

ROBOT_ID = "red-1"
SERVER_URL = "ws://localhost:8081"
PROTOCOL_VERSION = 1

def create_hello():
    return msgpack.packb({
        'type': 0x10,  # CLIENT_HELLO
        'payload': {
            'robotId': ROBOT_ID,
            'protocolVersion': PROTOCOL_VERSION,
            'clientName': 'python-client'
        }
    })

def create_command(tick, action, target_x=None, target_y=None):
    return msgpack.packb({
        'type': 0x11,  # ROBOT_COMMAND
        'payload': {
            'command': {
                'tick': tick,
                'robotId': ROBOT_ID,
                'action': action,
                'targetX': target_x,
                'targetY': target_y,
                'targetBallId': None,
                'targetZoneId': None,
                'climbLevel': None,
                'isAutoClimb': False
            }
        }
    })

def on_message(ws, data):
    msg = msgpack.unpackb(data, raw=False)
    msg_type = msg['type']

    if msg_type == 0x01:  # FIELD_CONFIG
        print(f"Received field config")
    elif msg_type == 0x02:  # TICK_UPDATE
        state = msg['payload']['state']
        tick = state['tick']
        my_robot = state['myRobot']

        # Simple strategy: move towards center
        target_x = 324
        target_y = 162

        # Send MOVING command
        ws.send(create_command(tick, 1, target_x, target_y), opcode=0x2)
    elif msg_type == 0x03:  # MATCH_END
        print(f"Match ended: {msg['payload']}")

def main():
    ws = websocket.WebSocketApp(
        SERVER_URL,
        on_open=lambda ws: ws.send(create_hello(), opcode=0x2),
        on_message=on_message
    )
    ws.run_forever()

if __name__ == '__main__':
    main()
```

## Server Ports

- **Robot connections**: Default port 8081
- **Visualization**: Default port 8080 (JSON protocol for browser)
- **HTTP static files**: Default port 3000

## Running

Start the world server:
```bash
npm run serve:world
```

Connect a robot client:
```bash
npm run robot -- --id=red-1 --strategy=collector --server=ws://localhost:8081
```
