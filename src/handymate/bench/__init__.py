"""Benchmarking framework for Handymate inference engines."""

from __future__ import annotations

from handymate.bench._stubs import BaseBenchmark, BenchmarkResult, BenchmarkSuite
from handymate.core.registry import BenchmarkRegistry


def ensure_registered() -> None:
    """Ensure all benchmark implementations are registered."""
    from handymate.bench.energy import ensure_registered as _reg_energy
    from handymate.bench.latency import ensure_registered as _reg_latency
    from handymate.bench.throughput import ensure_registered as _reg_throughput

    _reg_latency()
    _reg_throughput()
    _reg_energy()


# Trigger registration on import
ensure_registered()

__all__ = [
    "BaseBenchmark",
    "BenchmarkRegistry",
    "BenchmarkResult",
    "BenchmarkSuite",
    "ensure_registered",
]
