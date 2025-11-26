"""
Analytics module for cortex SDK.

Provides data aggregation, trend analysis, and forecasting capabilities
for cortex metrics.
"""

from .aggregator import MetricsAggregator
from .trends import TrendAnalyzer
from .forecasting import MetricsForecaster

__all__ = [
    'MetricsAggregator',
    'TrendAnalyzer',
    'MetricsForecaster',
]
