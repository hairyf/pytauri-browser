from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any, Final, Optional, Tuple

from browser_use import BrowserSession, Tools
from browser_use.agent.views import ActionResult
from browser_use.browser.views import BrowserError
from browser_use.filesystem.file_system import FileSystem
from browser_use.tools.service import handle_browser_error

# 常量定义
EXCLUDED_ACTIONS: Final[list[str]] = ["extract"]
DEFAULT_APP_DIR: Final[str] = "starter-pytauri-browser-use"


class BrowserManager:
    """封装浏览器会话管理的单例类"""
    
    def __init__(self):
        self._session: Optional[BrowserSession] = None
        self._tools: Tools[Any] = Tools(exclude_actions=EXCLUDED_ACTIONS)
        self._file_system: Optional[FileSystem] = None
        self._lock = asyncio.Lock()

    @property
    def is_headless(self) -> bool:
        """从环境变量获取是否开启无头模式"""
        return os.environ.get("BROWSER_USE_HEADLESS", "").lower() in ("1", "true", "yes")

    def get_fs_base_dir(self) -> Path:
        """确定存储根目录"""
        override = os.environ.get("BROWSER_USE_DATA_DIR") or os.environ.get("STARTER_PYTAURI_DATA_DIR")
        if override:
            return Path(override).expanduser().resolve()

        home = Path.home()
        # 简化路径查找：优先查找文档目录，不存在则回退至 Home
        for name in ("Documents", "文档", "My Documents"):
            p = home / name
            if p.is_dir():
                return p / DEFAULT_APP_DIR
        return home / DEFAULT_APP_DIR

    def get_actions_prompt(self) -> str:
        """获取支持的动作说明"""
        return self._tools.registry.get_prompt_description()

    async def ensure_browser(self) -> Tuple[BrowserSession, FileSystem]:
        """确保浏览器实例已启动（双重检查锁实现）"""
        if self._session and self._file_system:
            return self._session, self._file_system

        async with self._lock:
            if self._session is None:
                try:
                    base = self.get_fs_base_dir()
                    base.mkdir(parents=True, exist_ok=True)

                    self._file_system = FileSystem(base)
                    self._session = BrowserSession(headless=self.is_headless)
                    await self._session.start()
                except Exception:
                    await self.close()  # 出错时彻底清理
                    raise
            assert self._session is not None and self._file_system is not None
            return self._session, self._file_system

    async def close(self) -> dict[str, Any]:
        """安全关闭并重置状态"""
        async with self._lock:
            if self._session:
                try:
                    await self._session.kill()
                finally:
                    self._session = None
                    self._file_system = None
            return {"ok": True}

    @staticmethod
    def dump_result(result: Any) -> dict[str, Any]:
        """格式化执行结果"""
        if isinstance(result, ActionResult):
            return result.model_dump(mode="json", exclude_none=True)
        if isinstance(result, str):
            return {"extracted_content": result}
        return {"result": repr(result)}


# --- 外部调用接口（保持 API 不变） ---

_manager = BrowserManager()

def actions_prompt_text() -> str:
    return _manager.get_actions_prompt()

async def run_action(action_name: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        session, fs = await _manager.ensure_browser()
        result = await _manager._tools.registry.execute_action(
            action_name,
            params,
            browser_session=session,
            page_extraction_llm=None,
            file_system=fs,
        )
        return _manager.dump_result(result)
    except BrowserError as e:
        return _manager.dump_result(handle_browser_error(e))
    except (TimeoutError, asyncio.TimeoutError) as e:
        return {"error": f"动作执行超时: {e}", "type": "TimeoutError"}
    except Exception as e:
        return {"error": f"执行动作失败: {str(e)}", "type": type(e).__name__}

async def get_page_state(max_chars: int = 120_000) -> dict[str, Any]:
    try:
        session, _ = await _manager.ensure_browser()
        text = await session.get_state_as_text()
        total = len(text)

        truncated = total > max_chars
        return {
            "text": f"{text[:max_chars]}\n\n... (已截断，原文约 {total} 字符)" if truncated else text,
            "truncated": truncated,
            "approx_total_chars": total
        }
    except Exception as e:
        return {"error": f"获取状态失败: {str(e)}"}

async def close_browser() -> dict[str, Any]:
    return await _manager.close()