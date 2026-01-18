"""Field configuration loader."""

from __future__ import annotations
import json
import logging
from pathlib import Path

import msgspec

from ..types.schemas import FieldConfig

logger = logging.getLogger(__name__)


def load_field_config(path: str | Path) -> FieldConfig:
    """Load field configuration from a JSON file."""
    path = Path(path)
    logger.info(f"Loading field config from: {path}")
    logger.debug(f"  Path exists: {path.exists()}")

    try:
        with open(path, "r") as f:
            data = json.load(f)

        logger.debug(f"  JSON loaded successfully")
        logger.debug(f"  Field name: {data.get('name', 'UNKNOWN')}")
        logger.debug(f"  Dimensions: {data.get('width', 0)}x{data.get('height', 0)}")
        logger.debug(f"  Zones count: {len(data.get('zones', []))}")
        logger.debug(f"  Ball spawn points: {len(data.get('ballSpawnPoints', []))}")
        logger.debug(f"  Scoring targets: {len(data.get('scoringTargets', []))}")

        # Use msgspec to convert the dict to a FieldConfig struct
        config = msgspec.convert(data, FieldConfig)
        logger.info(f"Field config loaded: {config.name} ({config.width}x{config.height})")
        return config

    except FileNotFoundError:
        logger.error(f"Field config file not found: {path}")
        raise
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in field config: {e}")
        raise
    except Exception as e:
        logger.error(f"Failed to load field config: {e}")
        raise


def find_default_field() -> Path:
    """Find the default field configuration file."""
    # Look for the field file relative to the project root
    current = Path(__file__).resolve()
    logger.debug(f"Searching for field config starting from: {current}")

    # Go up to find the FRCScoreSim root
    for i in range(10):
        current = current.parent
        field_path = current / "data" / "fields" / "infinite-recharge.json"
        logger.debug(f"  Checking: {field_path} (exists: {field_path.exists()})")
        if field_path.exists():
            logger.info(f"Found field config at: {field_path}")
            return field_path

    # Fallback to working directory
    fallback = Path.cwd() / "data" / "fields" / "infinite-recharge.json"
    logger.warning(f"Using fallback field path: {fallback}")
    return fallback
