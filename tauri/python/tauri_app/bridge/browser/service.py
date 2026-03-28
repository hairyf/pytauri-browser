from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any, Final

from browser_use import BrowserSession, Tools
from browser_use.agent.views import ActionResult
from browser_use.filesystem.file_system import FileSystem

# 常量定义
EXCLUDED_ACTIONS: Final[list[str]] = ["extract"]
DEFAULT_APP_DIR: Final[str] = "starter-pytauri-browser-use"

# 全局状态管理
_session: BrowserSession | None = None
_tools: Tools | None = None
_file_system: FileSystem | None = None
_lock = asyncio.Lock()


def _is_headless() -> bool:
    """从环境变量获取是否开启无头模式，默认为 False。"""
    val = os.environ.get("BROWSER_USE_HEADLESS", "").lower()
    return val in ("1", "true", "yes")


def actions_prompt_text() -> str:
    """返回支持的动作说明，避免不必要的对象创建（如果频繁调用可考虑缓存）。"""
    return Tools(exclude_actions=EXCLUDED_ACTIONS).registry.get_prompt_description()


def _dump_result(result: Any) -> dict[str, Any]:
    """格式化执行结果。"""
    if isinstance(result, ActionResult):
        return result.model_dump(mode="json", exclude_none=True)
    if isinstance(result, str):
        return {"extracted_content": result}
    return {"result": repr(result)}


def _get_fs_base_dir() -> Path:
    """
    确定存储根目录。
    优先级：环境变量 > 系统文档目录 > 用户主目录。
    """
    override = os.environ.get("BROWSER_USE_DATA_DIR") or os.environ.get("STARTER_PYTAURI_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()

    # 优化路径查找逻辑：使用 next 迭代器简化循环
    home = Path.home()
    possible_docs = (home / name for name in ("Documents", "文档", "My Documents"))
    base_path = next((p for p in possible_docs if p.is_dir()), home)

    return base_path / DEFAULT_APP_DIR


async def ensure_browser() -> tuple[BrowserSession, Tools, FileSystem]:
    """确保浏览器实例已启动（线程安全）。"""
    global _session, _tools, _file_system
    if _session is not None:
        # 双重检查锁优化性能：如果已经存在则不进入锁
        return _session, _tools, _file_system  # type: ignore

    async with _lock:
        if _session is None:
            base = _get_fs_base_dir()
            base.mkdir(parents=True, exist_ok=True)

            _file_system = FileSystem(base)
            _session = BrowserSession(headless=_is_headless())
            await _session.start()
            _tools = Tools(exclude_actions=EXCLUDED_ACTIONS)

        return _session, _tools, _file_system


async def run_action(action_name: str, params: dict[str, Any]) -> dict[str, Any]:
    """执行单个动作，增强了错误处理边界。"""

    try:
        session, tools, fs = await ensure_browser()
        result = await tools.registry.execute_action(
            action_name,
            params,
            browser_session=session,
            page_extraction_llm=None,
            file_system=fs,
        )
        return _dump_result(result)
    except Exception as e:
        # 捕获更广泛的异常，避免后端崩溃
        return {"error": f"执行动作失败: {str(e)}", "type": type(e).__name__}


async def get_page_state(max_chars: int = 120_000) -> dict[str, Any]:
    """获取当前页面状态，支持截断。"""
    try:
        session, _, _ = await ensure_browser()
        text = await session.get_state_as_text()
        total = len(text)

        if total > max_chars:
            return {
                "text": text[:max_chars] + f"\n\n... (已截断，原文约 {total} 字符)",
                "truncated": True,
                "approx_total_chars": total
            }

        return {"text": text, "truncated": False, "approx_total_chars": total}
    except Exception as e:
        return {"error": f"获取状态失败: {str(e)}"}


async def close_browser() -> dict[str, Any]:
    """安全关闭浏览器并重置全局状态。"""
    global _session, _tools, _file_system
    async with _lock:
        if _session is None:
            return {"ok": True, "message": "浏览器未启动"}

        try:
            await _session.kill()
        finally:
            # 无论 kill 是否成功，都重置状态防止死锁或僵尸引用
            _session = None
            _tools = None
            _file_system = None

    return {"ok": True}
