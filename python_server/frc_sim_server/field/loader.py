"""Field configuration loader."""

from __future__ import annotations
import json
from pathlib import Path

import msgspec

from ..types.schemas import FieldConfig


def load_field_config(path: str | Path) -> FieldConfig:
    """Load field configuration from a JSON file."""
    path = Path(path)
    with open(path, "r") as f:
        data = json.load(f)

    # Use msgspec to convert the dict to a FieldConfig struct
    return msgspec.convert(data, FieldConfig)


def find_default_field() -> Path:
    """Find the default field configuration file."""
    # Look for the field file relative to the project root
    current = Path(__file__).resolve()

    # Go up to find the FRCScoreSim root
    for _ in range(10):
        current = current.parent
        field_path = current / "data" / "fields" / "infinite-recharge.json"
        if field_path.exists():
            return field_path

    # Fallback to working directory
    return Path.cwd() / "data" / "fields" / "infinite-recharge.json"
