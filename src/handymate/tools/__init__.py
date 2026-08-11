"""Tools primitive — tool system with ABC interface and built-in tools."""

from __future__ import annotations

from handymate.tools._stubs import BaseTool, ToolExecutor, ToolSpec

# Import built-in tools to trigger @ToolRegistry.register() decorators.
# Each is wrapped in try/except so the package loads even before the
# individual tool modules are created.
try:
    import handymate.tools.calculator  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.think  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.retrieval  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.llm_tool  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.file_read  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.web_search  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.code_interpreter  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.code_interpreter_docker  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.repl  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.storage_tools  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.mcp_adapter  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.channel_tools  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.http_request  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.docker_shell_exec  # noqa: F401
    import handymate.tools.shell_exec  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.memory_manage  # noqa: F401
except ImportError:
    pass
try:
    import handymate.tools.user_profile_manage  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.skill_manage  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.file_write  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.apply_patch  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.git_tool  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.db_query  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.pdf_tool  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.image_tool  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.audio_tool  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.knowledge_tools  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.text_to_speech  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.digest_collect  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.scan_chunks  # noqa: F401
except ImportError:
    pass

try:
    import handymate.tools.knowledge_sql  # noqa: F401
except ImportError:
    pass

__all__ = ["BaseTool", "ToolExecutor", "ToolSpec"]
