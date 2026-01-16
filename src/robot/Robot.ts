import type {
  Position,
  RobotAction,
  RobotCommand,
  RobotConfig,
  RobotState,
} from '../types/index.js';
import { RobotActionType } from '../types/index.js';
import { Vector2D } from '../utils/Vector2D.js';

/**
 * Create initial robot state from configuration
 */
export function createRobotState(
  config: RobotConfig,
  alliance: 'red' | 'blue',
  startPosition: Position,
  startHeading: number = 0
): RobotState {
  return {
    id: config.id,
    config,
    alliance,
    position: { ...startPosition },
    heading: startHeading,
    velocity: 0,
    heldBalls: [],
    currentAction: {
      type: RobotActionType.IDLE,
      progress: 0,
      startedAt: 0,
    },
    disabled: false,
    hasAutoClimbed: false,
    hasClimbed: false,
    currentClimbLevel: null,
    currentPath: [],
    pathIndex: 0,
  };
}

/**
 * Robot entity class for managing robot state and operations
 */
export class Robot {
  state: RobotState;

  constructor(
    config: RobotConfig,
    alliance: 'red' | 'blue',
    startPosition: Position,
    startHeading: number = 0
  ) {
    this.state = createRobotState(config, alliance, startPosition, startHeading);
  }

  get id(): string {
    return this.state.id;
  }

  get config(): RobotConfig {
    return this.state.config;
  }

  get alliance(): 'red' | 'blue' {
    return this.state.alliance;
  }

  get position(): Position {
    return this.state.position;
  }

  get heading(): number {
    return this.state.heading;
  }

  get velocity(): number {
    return this.state.velocity;
  }

  get heldBalls(): string[] {
    return this.state.heldBalls;
  }

  get currentAction(): RobotAction {
    return this.state.currentAction;
  }

  get isDisabled(): boolean {
    return this.state.disabled;
  }

  get hasClimbed(): boolean {
    return this.state.hasClimbed;
  }

  get hasAutoClimbed(): boolean {
    return this.state.hasAutoClimbed;
  }

  get currentClimbLevel(): number | null {
    return this.state.currentClimbLevel;
  }

  /**
   * Check if robot is currently idle
   */
  isIdle(): boolean {
    return this.state.currentAction.type === RobotActionType.IDLE;
  }

  /**
   * Check if robot is currently moving
   */
  isMoving(): boolean {
    return this.state.currentAction.type === RobotActionType.MOVING;
  }

  /**
   * Check if robot can pick up more balls
   */
  canPickUpBall(): boolean {
    return this.state.heldBalls.length < this.config.ballCapacity;
  }

  /**
   * Check if robot has balls to shoot
   */
  hasBalls(): boolean {
    return this.state.heldBalls.length > 0;
  }

  /**
   * Get the number of balls held
   */
  ballCount(): number {
    return this.state.heldBalls.length;
  }

  /**
   * Pick up a ball
   */
  pickUpBall(ballId: string): boolean {
    if (!this.canPickUpBall()) return false;
    this.state.heldBalls.push(ballId);
    return true;
  }

  /**
   * Remove and return a ball for shooting
   */
  shootBall(): string | null {
    if (this.state.heldBalls.length === 0) return null;
    return this.state.heldBalls.shift() ?? null;
  }

  /**
   * Set the current action
   */
  setAction(action: RobotAction): void {
    this.state.currentAction = action;
  }

  /**
   * Start a new action from a command
   */
  startAction(command: RobotCommand, tick: number): void {
    this.state.currentAction = {
      type: command.type,
      targetPosition: command.targetPosition,
      targetBallId: command.targetBallId,
      targetScoringZoneId: command.targetScoringZoneId,
      targetRobotId: command.targetRobotId,
      targetClimbLevel: command.targetClimbLevel,
      isAutoClimb: command.isAutoClimb,
      progress: 0,
      startedAt: tick,
    };
  }

  /**
   * Update action progress
   */
  updateProgress(progress: number): void {
    this.state.currentAction.progress = Math.min(1, progress);
  }

  /**
   * Complete current action and go idle
   */
  completeAction(): void {
    this.state.currentAction = {
      type: RobotActionType.IDLE,
      progress: 0,
      startedAt: 0,
    };
  }

  /**
   * Set position
   */
  setPosition(pos: Position): void {
    this.state.position = { ...pos };
  }

  /**
   * Set heading
   */
  setHeading(heading: number): void {
    this.state.heading = ((heading % 360) + 360) % 360;
  }

  /**
   * Set velocity
   */
  setVelocity(velocity: number): void {
    this.state.velocity = Math.max(0, velocity);
  }

  /**
   * Set path for navigation
   */
  setPath(path: Position[]): void {
    this.state.currentPath = path;
    this.state.pathIndex = 0;
  }

  /**
   * Advance to next path waypoint
   */
  advancePath(): Position | null {
    if (this.state.pathIndex >= this.state.currentPath.length - 1) {
      return null;
    }
    this.state.pathIndex++;
    return this.state.currentPath[this.state.pathIndex];
  }

  /**
   * Get current path target
   */
  getCurrentPathTarget(): Position | null {
    if (this.state.pathIndex >= this.state.currentPath.length) {
      return null;
    }
    return this.state.currentPath[this.state.pathIndex];
  }

  /**
   * Check if path is complete
   */
  isPathComplete(): boolean {
    if (this.state.currentPath.length === 0) return true;
    return this.state.pathIndex >= this.state.currentPath.length - 1;
  }

  /**
   * Disable the robot
   */
  disable(): void {
    this.state.disabled = true;
    this.state.velocity = 0;
    this.completeAction();
  }

  /**
   * Enable the robot
   */
  enable(): void {
    this.state.disabled = false;
  }

  /**
   * Mark robot as climbed during auto
   */
  autoClimb(): void {
    this.state.hasAutoClimbed = true;
    this.state.velocity = 0;
  }

  /**
   * Mark robot as climbed in endgame with a specific level
   */
  endgameClimb(level: number): void {
    this.state.hasClimbed = true;
    this.state.currentClimbLevel = level;
    this.state.velocity = 0;
  }

  /**
   * @deprecated Use autoClimb() or endgameClimb(level) instead
   * Mark robot as climbed (legacy method)
   */
  climb(): void {
    this.endgameClimb(1);
  }

  /**
   * Get distance to a position
   */
  distanceTo(pos: Position): number {
    return Vector2D.fromPosition(this.position).distanceTo(pos);
  }

  /**
   * Get angle to a position
   */
  angleTo(pos: Position): number {
    return Vector2D.fromPosition(this.position).angleTo(pos);
  }

  /**
   * Get bounding box corners
   */
  getBoundingBox(): { minX: number; maxX: number; minY: number; maxY: number } {
    const halfWidth = this.config.width / 2;
    const halfLength = this.config.length / 2;
    return {
      minX: this.position.x - halfWidth,
      maxX: this.position.x + halfWidth,
      minY: this.position.y - halfLength,
      maxY: this.position.y + halfLength,
    };
  }

  /**
   * Clone the robot state
   */
  cloneState(): RobotState {
    return {
      ...this.state,
      position: { ...this.state.position },
      heldBalls: [...this.state.heldBalls],
      currentAction: { ...this.state.currentAction },
      currentPath: this.state.currentPath.map((p) => ({ ...p })),
    };
  }
}
