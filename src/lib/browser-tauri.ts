import { pyInvoke } from "tauri-plugin-pytauri-api";

/** browser-use 官方 Tools 动作说明（与 Agent 内建一致）。 */
export async function browserActionsHelp(): Promise<Record<string, unknown>> {
  return pyInvoke("browser_actions_help", {});
}

/**
 * 执行 browser-use 注册表中的单个动作（navigate、click、search、extract…）。
 * 参数形状见 browser_actions_help 返回的 reference。
 */
export async function browserExecuteAction(
  action: string,
  params?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return pyInvoke("browser_execute_action", {
    action,
    params: params ?? {},
  });
}

export async function browserGetState(
  maxChars?: number
): Promise<Record<string, unknown>> {
  return pyInvoke("browser_get_state", {
    max_chars: maxChars ?? 120_000,
  });
}

export async function browserClose(): Promise<Record<string, unknown>> {
  return pyInvoke("browser_close", {});
}
