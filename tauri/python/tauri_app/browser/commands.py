"""
PyTauri 命令：针对 browser-use 的工具集成与页面状态管理。
优化点：简化冗余模型、增强类型校验、统一错误处理。
"""

from __future__ import annotations
from typing import Any, Optional

from pydantic import BaseModel, Field
from pytauri import Commands

# 假设 service 层已处理具体的 Playwright/Browser 逻辑
from tauri_app.browser.service import (
    actions_prompt_text,
    close_browser,
    get_page_state,
    run_action,
)

# --- 模型定义 ---

class ExecuteActionBody(BaseModel):
    """执行浏览器动作的请求体"""
    action: str = Field(
        ..., 
        min_length=1, 
        pattern=r"^[a-z_]+$",  # 约束动作名格式
        description="browser-use 注册的动作名，例如: navigate, click"
    )
    params: dict[str, Any] = Field(
        default_factory=dict, 
        description="动作参数，需与 browser_actions_help 文档匹配"
    )

class GetStateBody(BaseModel):
    """获取页面状态的配置"""
    max_chars: int = Field(
        default=120_000, 
        ge=1_000, 
        le=500_000,
        description="返回状态文本的最大字符数限制"
    )

# --- 命令注册 ---

def register_browser_commands(commands: Commands) -> None:
    """注册所有与浏览器操作相关的 PyTauri 命令"""

    @commands.command()
    async def browser_actions_help() -> dict[str, str]:
        """获取可用动作的帮助文档"""
        return {"reference": actions_prompt_text()}

    @commands.command()
    async def browser_execute_action(body: ExecuteActionBody) -> dict[str, Any]:
        """
        执行指定的浏览器动作。
        添加了基础的错误捕获以确保后端不会因单个动作失败而崩溃。
        """
        try:
            result = await run_action(body.action, body.params)
            return {"success": True, "data": result}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @commands.command()
    async def browser_get_state(body: GetStateBody) -> dict[str, Any]:
        """获取当前页面的结构化状态（如 DOM、URL 等）"""
        state = await get_page_state(body.max_chars)
        return {"state": state}

    @commands.command()
    async def browser_close() -> dict[str, bool]:
        """关闭浏览器实例"""
        await close_browser()
        return {"success": True}