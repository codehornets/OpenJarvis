"""Learning primitive -- router policies, reward functions, learning."""

from __future__ import annotations

from handymate.learning._stubs import (
    QueryAnalyzer,
    RewardFunction,
    RouterPolicy,
    RoutingContext,
)
from handymate.learning.agents.agent_evolver import AgentConfigEvolver
from handymate.learning.learning_orchestrator import LearningOrchestrator
from handymate.learning.optimize.llm_optimizer import LLMOptimizer
from handymate.learning.optimize.optimizer import OptimizationEngine
from handymate.learning.optimize.store import OptimizationStore
from handymate.learning.routing.complexity import (
    ComplexityQueryAnalyzer,
    score_complexity,
)
from handymate.learning.routing.heuristic_reward import HeuristicRewardFunction
from handymate.learning.routing.router import (
    HeuristicRouter,
    build_routing_context,
)
from handymate.learning.training.data import TrainingDataMiner
from handymate.learning.training.lora import HAS_TORCH, LoRATrainer, LoRATrainingConfig


def ensure_registered() -> None:
    """Ensure all learning policies are registered in RouterPolicyRegistry."""
    from handymate.learning.routing.heuristic_policy import (
        ensure_registered as _reg_heuristic,
    )

    _reg_heuristic()

    from handymate.learning.routing.learned_router import (
        ensure_registered as _reg_learned,
    )

    _reg_learned()

    # Intelligence training (optional deps)
    try:
        import handymate.learning.intelligence  # noqa: F401
    except ImportError:
        pass

    # Orchestrator-specific training (optional deps)
    try:
        import handymate.learning.intelligence.orchestrator  # noqa: F401
    except ImportError:
        pass

    # Agent optimizers (optional deps)
    try:
        import handymate.learning.agents.dspy_optimizer  # noqa: F401
    except ImportError:
        pass
    try:
        import handymate.learning.agents.gepa_optimizer  # noqa: F401
    except ImportError:
        pass
    try:
        import handymate.learning.agents.ace_optimizer  # noqa: F401
    except ImportError:
        pass


__all__ = [
    "AgentConfigEvolver",
    "ComplexityQueryAnalyzer",
    "HAS_TORCH",
    "HeuristicRewardFunction",
    "HeuristicRouter",
    "LLMOptimizer",
    "LearningOrchestrator",
    "LoRATrainer",
    "LoRATrainingConfig",
    "OptimizationEngine",
    "OptimizationStore",
    "QueryAnalyzer",
    "RewardFunction",
    "RouterPolicy",
    "RoutingContext",
    "TrainingDataMiner",
    "build_routing_context",
    "ensure_registered",
    "score_complexity",
]
