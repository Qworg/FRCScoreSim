"""Simulation engine - core tick loop."""

from __future__ import annotations
import asyncio
import logging
import time
from typing import Optional, Callable, TYPE_CHECKING
from dataclasses import dataclass

from ..types.enums import MatchPhase, RobotActionType, BallState, ShiftParity
from ..types.schemas import (
    Position,
    FieldConfig,
    RobotConfig,
    GameState,
    BallVelocity,
    GameRules,
    BallPhysicsConfig,
    DEFAULT_GAME_RULES,
    DEFAULT_BALL_PHYSICS,
)
from ..entities.robot import Robot, create_idle_action
from ..entities.ball import Ball
from ..field.field import Field
from ..field.pathfinding import AStar
from ..physics.robot import update_robot_movement
from ..physics.ball import update_ball_physics, calculate_shot_velocity, is_in_pickup_range
from ..physics.collision import (
    are_robots_colliding,
    separate_robots,
    handle_robot_ball_collisions,
    handle_ball_ball_collisions,
)
from ..strategy.base import Strategy, StrategyContext, StrategyDecision
from ..strategy.idle import IdleStrategy
from ..strategy.collector import CollectorStrategy
from ..strategy.scorer import ScorerStrategy
from .match import Match
from .clock import GameClock

logger = logging.getLogger(__name__)


@dataclass
class RobotSetup:
    """Setup for a robot in the match."""
    config: RobotConfig
    alliance: str
    strategy: str
    starting_balls: int = 0


class SimulationEngine:
    """Simulation engine - core tick loop for the simulation."""

    def __init__(
        self,
        field_config: FieldConfig,
        robot_setups: list[RobotSetup],
        rules: GameRules = DEFAULT_GAME_RULES,
        ball_physics: BallPhysicsConfig = DEFAULT_BALL_PHYSICS,
        tick_rate: int = 60,
    ):
        logger.info("Initializing SimulationEngine...")
        self.tick_rate = tick_rate
        self.rules = rules
        self.ball_physics = ball_physics

        # Create match
        logger.debug("Creating Match...")
        self.match = Match(field_config, rules, ball_physics)
        logger.debug("Initializing balls from spawn points...")
        self.match.initialize_balls()
        logger.info(f"  Balls initialized: {len(self.match.get_balls())} balls")

        # Initialize strategies
        self._strategies: dict[str, Strategy] = {
            "idle": IdleStrategy(),
            "collector": CollectorStrategy(),
            "scorer": ScorerStrategy(),
        }
        self._robot_strategies: dict[str, str] = {}

        # Initialize pathfinders
        self._pathfinders: dict[str, AStar] = {}

        # Initialize robots
        logger.debug(f"Initializing {len(robot_setups)} robots...")
        self._initialize_robots(robot_setups)
        self._initialize_pathfinders()

        # State
        self._running = False
        self._state_callback: Optional[Callable[[GameState], None]] = None

        # Log summary
        logger.info(f"SimulationEngine initialized:")
        logger.info(f"  Robots: {len(self.match.get_robots())}")
        logger.info(f"  Balls: {len(self.match.get_balls())}")
        logger.info(f"  Field: {field_config.width}x{field_config.height}")
        logger.info(f"  Tick rate: {tick_rate} Hz")

    def _initialize_robots(self, setups: list[RobotSetup]) -> None:
        """Initialize robots from setup."""
        robots = []
        red_positions = self.match.field.get_starting_positions("red")
        blue_positions = self.match.field.get_starting_positions("blue")

        logger.debug(f"  Red starting positions: {len(red_positions)}")
        logger.debug(f"  Blue starting positions: {len(blue_positions)}")

        red_index = 0
        blue_index = 0
        starting_ball_id = 1

        for setup in setups:
            alliance = setup.alliance
            positions = red_positions if alliance == "red" else blue_positions
            index = red_index if alliance == "red" else blue_index

            if alliance == "red":
                red_index += 1
            else:
                blue_index += 1

            position = positions[index % len(positions)]
            heading = 0.0 if alliance == "red" else 180.0

            robot = Robot(
                config=setup.config,
                alliance=alliance,
                position=position,
                heading=heading,
            )

            logger.debug(f"  Created robot {robot.id} at ({position.x:.1f}, {position.y:.1f})")

            # Give robot starting balls
            num_starting = min(setup.starting_balls, setup.config.ballCapacity)
            for _ in range(num_starting):
                ball_id = f"starting-ball-{starting_ball_id}"
                starting_ball_id += 1

                ball = Ball(
                    id=ball_id,
                    state=BallState.HELD,
                    position=position,
                    height=0.0,
                    velocity=BallVelocity(vx=0.0, vy=0.0, vz=0.0),
                    spawn_point_id=f"robot-start-{robot.id}",
                    last_update_tick=0,
                    held_by_robot_id=robot.id,
                )
                self.match.add_ball(ball)
                robot.pick_up_ball(ball_id)

            logger.debug(f"    Starting balls: {num_starting}")
            robots.append(robot)
            self._robot_strategies[robot.id] = setup.strategy

        self.match.initialize_robots(robots)
        logger.info(f"  Robots initialized: {len(robots)} robots")

    def _initialize_pathfinders(self) -> None:
        """Initialize pathfinders for each robot size."""
        robot_sizes = set()
        for robot in self.match.get_robots():
            robot_sizes.add((robot.config.height, robot.config.width))

        for height, width in robot_sizes:
            key = f"{height}-{width}"
            self._pathfinders[key] = AStar(
                self.match.field,
                robot_height=height,
                robot_width=width,
            )

    def _get_pathfinder(self, robot: Robot) -> AStar:
        """Get pathfinder for a robot."""
        key = f"{robot.config.height}-{robot.config.width}"
        return self._pathfinders.get(key) or AStar(
            self.match.field,
            robot_height=robot.config.height,
            robot_width=robot.config.width,
        )

    def register_strategy(self, strategy: Strategy) -> None:
        """Register a strategy."""
        self._strategies[strategy.id] = strategy

    def on_state_update(self, callback: Callable[[GameState], None]) -> None:
        """Set callback for state updates."""
        self._state_callback = callback

    def get_state(self) -> GameState:
        """Get current game state."""
        return self.match.get_state()

    def get_config(self) -> dict:
        """Get configuration for broadcasting to clients."""
        return {
            "field": self.match.field.config,
            "robots": [r.config for r in self.match.get_robots()],
        }

    async def start(self) -> None:
        """Start the simulation in real-time mode."""
        logger.info("Starting simulation...")
        self._running = True
        self.match.start()
        logger.info(f"  Match started in phase: {self.match.clock.phase.value}")
        logger.info(f"  Paused: {self.match.is_paused()}")
        await self._run_realtime()

    async def _run_realtime(self) -> None:
        """Run in real-time mode at 60 FPS."""
        tick_interval = 1.0 / self.tick_rate
        next_tick = time.perf_counter()
        tick_count = 0
        last_log_time = time.perf_counter()

        logger.info("Entering real-time simulation loop...")

        while self._running and not self.match.is_finished():
            now = time.perf_counter()

            if now >= next_tick:
                if not self.match.is_paused():
                    self.tick()
                    tick_count += 1

                    # Broadcast state
                    if self._state_callback:
                        self._state_callback(self.match.get_state())

                    # Log status every 5 seconds
                    if now - last_log_time >= 5.0:
                        logger.debug(
                            f"Simulation running: tick={self.match.clock.tick}, "
                            f"phase={self.match.clock.phase.value}, "
                            f"robots={len(self.match.get_robots())}, "
                            f"balls={len(self.match.get_balls())}"
                        )
                        last_log_time = now

                next_tick += tick_interval

                # Drift recovery - if we've fallen behind by more than 3 ticks
                if now > next_tick + tick_interval * 3:
                    next_tick = now + tick_interval
            else:
                # Sleep for 90% of remaining time
                await asyncio.sleep((next_tick - now) * 0.9)

        logger.info(f"Simulation loop ended after {tick_count} ticks")

    def tick(self) -> None:
        """Perform a single simulation tick."""
        delta_time = 1.0 / self.tick_rate

        # Advance game clock
        new_phase = self.match.clock.tick_forward()
        if new_phase:
            self.match.handle_phase_change(new_phase)

        # Update strategies and get commands
        self._update_strategies()

        # Update robot movement
        self._update_robots(delta_time)

        # Handle robot collisions
        self._handle_robot_collisions()

        # Handle robot-ball collisions
        handle_robot_ball_collisions(
            self.match.get_robots(),
            self.match.get_balls(),
            self.match.field,
            self.ball_physics.radius,
        )

        # Handle ball-ball collisions
        handle_ball_ball_collisions(
            self.match.get_balls(),
            self.match.field,
            self.ball_physics.radius,
        )

        # Update ball physics
        self._update_balls(delta_time)

        # Process ball respawns
        self.match.process_ball_respawns()

        # Process pickups
        self._process_pickups()

        # Clear tick events
        self.match.clear_tick_events()

    def _update_strategies(self) -> None:
        """Update all robot strategies."""
        for robot in self.match.get_robots():
            if robot.is_disabled or robot.has_climbed:
                continue

            # Skip if robot has an action in progress
            if not robot.is_idle():
                continue

            strategy_id = self._robot_strategies.get(robot.id, "idle")
            strategy = self._strategies.get(strategy_id)
            if not strategy:
                continue

            context = self._build_strategy_context(robot)
            decision = strategy.decide(context)

            # Execute the decision
            self._execute_decision(robot, decision)

    def _build_strategy_context(self, robot: Robot) -> StrategyContext:
        """Build strategy context for a robot."""
        state = self.match.get_state()

        teammates = [
            r.clone_state()
            for r in self.match.get_robots_by_alliance(robot.alliance)
            if r.id != robot.id
        ]
        opponents = [
            r.clone_state()
            for r in self.match.get_robots_by_alliance(
                "blue" if robot.alliance == "red" else "red"
            )
        ]

        available_balls = [b.clone_data() for b in self.match.get_available_balls()]

        # Find unclaimed balls
        teammate_ids = {t.id for t in teammates}
        unclaimed_balls = [
            b for b in available_balls
            if b.claimedByRobotId is None
            or b.claimedByRobotId == robot.id
            or b.claimedByRobotId not in teammate_ids
        ]

        scoring_targets = self.match.field.get_scoring_targets(robot.alliance)

        # Find nearest ball
        nearest_ball = None
        nearest_ball_distance = None
        for ball in available_balls:
            dist = robot.distance_to(ball.position)
            if nearest_ball_distance is None or dist < nearest_ball_distance:
                nearest_ball_distance = dist
                nearest_ball = ball

        # Find nearest unclaimed ball
        nearest_unclaimed = None
        nearest_unclaimed_dist = None
        for ball in unclaimed_balls:
            dist = robot.distance_to(ball.position)
            if nearest_unclaimed_dist is None or dist < nearest_unclaimed_dist:
                nearest_unclaimed_dist = dist
                nearest_unclaimed = ball

        # Find nearest scoring target
        nearest_target = None
        nearest_target_dist = None
        for target in scoring_targets:
            dist = robot.distance_to(target.position)
            if nearest_target_dist is None or dist < nearest_target_dist:
                nearest_target_dist = dist
                nearest_target = target

        in_shooting_range = (
            nearest_target_dist is not None
            and nearest_target_dist <= robot.config.shootingRange
        )

        alliance_parity = self.match.scoring.get_shift_parity(robot.alliance)
        can_score = self.match.can_alliance_score(robot.alliance)

        # Climb info
        alliance_robots = self.match.get_robots_by_alliance(robot.alliance)
        auto_climb_count = sum(1 for r in alliance_robots if r.has_auto_climbed)
        endgame_climb_count = sum(1 for r in alliance_robots if r.has_climbed)

        can_auto_climb = (
            robot.config.autoClimb
            and not robot.has_auto_climbed
            and self.match.clock.is_auto()
            and auto_climb_count < self.rules.maxAutoClimbers
        )

        is_near_climbing = self.match.field.is_near_climbing_zone(
            robot.position, robot.alliance
        )

        # Find climbing zone position
        climbing_zone_pos = None
        for zone in self.match.field.config.zones:
            if zone.type != "CLIMBING":
                continue
            if zone.modifiers and zone.modifiers.alliance != robot.alliance:
                continue
            bounds = zone.bounds
            climbing_zone_pos = Position(
                x=(bounds.minX + bounds.maxX) / 2,
                y=(bounds.minY + bounds.maxY) / 2,
            )
            break

        return StrategyContext(
            game_state=state,
            robot=robot.clone_state(),
            field=self.match.field.config,
            teammates=teammates,
            opponents=opponents,
            available_balls=available_balls,
            unclaimed_balls=unclaimed_balls,
            teammate_balls=[],
            scoring_targets=scoring_targets,
            nearest_ball_distance=nearest_ball_distance,
            nearest_ball=nearest_ball,
            nearest_unclaimed_ball_distance=nearest_unclaimed_dist,
            nearest_unclaimed_ball=nearest_unclaimed,
            nearest_scoring_target_distance=nearest_target_dist,
            nearest_scoring_target=nearest_target,
            in_shooting_range=in_shooting_range,
            phase=self.match.clock.phase,
            phase_time_remaining=self.match.clock.phase_time_remaining,
            current_shift=self.match.clock.current_shift,
            alliance_parity=alliance_parity,
            can_score=can_score,
            can_auto_climb=can_auto_climb,
            alliance_can_auto_climb=auto_climb_count < self.rules.maxAutoClimbers,
            alliance_can_endgame_climb=endgame_climb_count < self.rules.maxEndgameClimbers,
            alliance_auto_climb_count=auto_climb_count,
            alliance_endgame_climb_count=endgame_climb_count,
            is_near_climbing_zone=is_near_climbing,
            climbing_zone_position=climbing_zone_pos,
        )

    def _execute_decision(self, robot: Robot, decision: StrategyDecision) -> None:
        """Execute a strategy decision."""
        action = decision.action
        action_type = RobotActionType(action.type)

        if action_type == RobotActionType.IDLE:
            return

        if action_type == RobotActionType.MOVING:
            if action.targetPosition:
                pathfinder = self._get_pathfinder(robot)

                # Set other robots as obstacles
                other_robots = [
                    r for r in self.match.get_robots()
                    if r.id != robot.id and not r.has_climbed
                ]
                pathfinder.set_dynamic_obstacles(
                    [r.position for r in other_robots],
                    robot.config.width,
                )

                result = pathfinder.find_path(robot.position, action.targetPosition)
                pathfinder.clear_dynamic_obstacles()

                if result.found:
                    robot.set_path(result.path)
                    robot.start_action(action, self.match.clock.tick)

        elif action_type == RobotActionType.SHOOTING:
            if robot.has_balls() and action.targetScoringZoneId:
                robot.start_action(action, self.match.clock.tick)

        elif action_type == RobotActionType.PICKING_UP:
            if robot.can_pick_up_ball() and action.targetBallId:
                ball = self.match.get_ball(action.targetBallId)
                if ball:
                    ball.claim(robot.id, self.match.clock.tick)
                robot.start_action(action, self.match.clock.tick)

        elif action_type == RobotActionType.CLIMBING:
            if self.match.field.is_near_climbing_zone(robot.position, robot.alliance):
                robot.start_action(action, self.match.clock.tick)

    def _update_robots(self, delta_time: float) -> None:
        """Update all robots."""
        for robot in self.match.get_robots():
            if robot.is_disabled or robot.has_climbed:
                continue

            action_type = RobotActionType(robot.current_action.type)

            if action_type == RobotActionType.MOVING:
                self._update_moving_robot(robot, delta_time)
            elif action_type == RobotActionType.SHOOTING:
                self._update_shooting_robot(robot, delta_time)
            elif action_type == RobotActionType.PICKING_UP:
                self._update_picking_up_robot(robot, delta_time)
            elif action_type == RobotActionType.CLIMBING:
                self._update_climbing_robot(robot, delta_time)

    def _update_moving_robot(self, robot: Robot, delta_time: float) -> None:
        """Update robot movement along path."""
        target = robot.get_current_path_target()
        result = update_robot_movement(robot, target, self.match.field, delta_time)

        robot.set_position(result.position)
        robot.set_heading(result.heading)
        robot.set_velocity(result.velocity)

        if result.reached_target:
            next_target = robot.advance_path()
            if not next_target:
                robot.complete_action()

    def _update_shooting_robot(self, robot: Robot, delta_time: float) -> None:
        """Update robot shooting action."""
        progress = robot.current_action.progress + delta_time / robot.config.shootTime
        robot.update_progress(progress)

        if progress >= 1.0:
            ball_id = robot.shoot_ball()
            if ball_id:
                ball = self.match.get_ball(ball_id)
                target_id = robot.current_action.targetScoringZoneId
                target = self.match.field.get_scoring_target(target_id) if target_id else None

                if ball and target:
                    velocity = calculate_shot_velocity(
                        robot.position,
                        target.position,
                        target.minHeight or 100,
                    )
                    ball.shoot(
                        robot.id,
                        robot.position,
                        target.position,
                        velocity,
                        self.match.clock.tick,
                    )

                    # Apply accuracy - miss sometimes
                    import random
                    if random.random() > robot.config.shootingAccuracy:
                        # Perturb velocity
                        ball.set_velocity(BallVelocity(
                            vx=velocity.vx * (0.8 + random.random() * 0.4),
                            vy=velocity.vy * (0.8 + random.random() * 0.4),
                            vz=velocity.vz * (0.8 + random.random() * 0.2),
                        ))

            robot.complete_action()

    def _update_picking_up_robot(self, robot: Robot, delta_time: float) -> None:
        """Update robot pickup action."""
        progress = robot.current_action.progress + delta_time / robot.config.pickupTime
        robot.update_progress(progress)

        if progress >= 1.0:
            ball_id = robot.current_action.targetBallId
            if ball_id:
                ball = self.match.get_ball(ball_id)
                if ball and ball.is_available():
                    if is_in_pickup_range(robot.position, ball.position, 24):
                        ball.pickup(robot.id, self.match.clock.tick)
                        robot.pick_up_ball(ball_id)

            robot.complete_action()

    def _update_climbing_robot(self, robot: Robot, delta_time: float) -> None:
        """Update robot climbing action."""
        is_auto = robot.current_action.isAutoClimb

        # Check if climb is still valid
        if is_auto:
            if not self.match.clock.is_auto() or not self.match.scoring.can_auto_climb(robot.alliance):
                robot.complete_action()
                return
        else:
            if not self.match.clock.is_endgame() or not self.match.scoring.can_endgame_climb(robot.alliance):
                robot.complete_action()
                return

        progress = robot.current_action.progress + delta_time / robot.config.climbUpTime
        robot.update_progress(progress)

        if progress >= 1.0:
            if is_auto:
                robot.auto_climb()
                self.match.record_auto_climb(robot.id)
            else:
                level = robot.current_action.targetClimbLevel or robot.config.climbLevel
                robot.endgame_climb(level)
                self.match.record_endgame_climb(robot.id, level)

            robot.complete_action()

    def _handle_robot_collisions(self) -> None:
        """Handle robot-robot collisions."""
        robots = self.match.get_robots()

        for i in range(len(robots)):
            for j in range(i + 1, len(robots)):
                if are_robots_colliding(robots[i], robots[j]):
                    pos1, pos2 = separate_robots(robots[i], robots[j], self.match.field)
                    robots[i].set_position(pos1)
                    robots[j].set_position(pos2)

    def _update_balls(self, delta_time: float) -> None:
        """Update all balls."""
        for ball in self.match.get_balls():
            if ball.is_held():
                continue

            result = update_ball_physics(
                ball,
                self.match.field,
                delta_time,
                self.match.clock.tick,
                self.ball_physics,
            )

            if result.scored and result.scoring_target_id and ball.shot_by_robot_id:
                self.match.record_score(
                    ball.shot_by_robot_id,
                    ball.id,
                    result.scoring_target_id,
                )

    def _process_pickups(self) -> None:
        """Process automatic ball pickups."""
        for robot in self.match.get_robots():
            if not robot.can_pick_up_ball():
                continue

            if robot.is_idle():
                # Find balls in range
                for ball in self.match.get_available_balls():
                    if is_in_pickup_range(robot.position, ball.position, 12):
                        ball.claim(robot.id, self.match.clock.tick)
                        robot.start_action(
                            robot.create_pickup_action(ball.id) if hasattr(robot, 'create_pickup_action')
                            else create_idle_action(),
                            self.match.clock.tick,
                        )
                        # Start pickup action
                        from ..types.schemas import RobotAction
                        robot.current_action = RobotAction(
                            type=RobotActionType.PICKING_UP.value,
                            progress=0.0,
                            startedAt=self.match.clock.tick,
                            targetBallId=ball.id,
                        )
                        break

    def pause(self) -> None:
        """Pause the simulation."""
        self.match.pause()

    def resume(self) -> None:
        """Resume the simulation."""
        self.match.resume()

    def stop(self) -> None:
        """Stop the simulation."""
        self._running = False

    def is_running(self) -> bool:
        """Check if simulation is running."""
        return self._running
