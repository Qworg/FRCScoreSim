"""
Built-in strategies for the FRC robot client.
"""

from .base import BaseStrategy
from .collector import CollectorStrategy
from .scorer import ScorerStrategy
from .idle import IdleStrategy

__all__ = [
    "BaseStrategy",
    "CollectorStrategy",
    "ScorerStrategy",
    "IdleStrategy",
]
