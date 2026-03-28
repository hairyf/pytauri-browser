import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  generateText,
  InferAgentUIMessage,
  stepCountIs,
  tool,
  ToolLoopAgent,
} from "ai";
import { z } from "zod";
import {
  browserActionsHelp,
  browserExecuteAction,
  browserGetState,
} from "@/lib/browser-tauri";

const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY ?? "";

const deepseek = createDeepSeek({
  apiKey,
});

export type DeepSeekModelId = "deepseek-chat" | "deepseek-reasoner";

const agentInstructions = [
  "你是带真实浏览器能力的桌面助手（browser-use + Chromium，经 PyTauri 调用）。",
  "编排：先 browser_actions_help 查动作与参数 → 需要看页面时用 browser_get_state → 用 browser_execute_action 做点击、导航等。",
  "需要按语义从当前页抽取信息时，使用 browser_execute_action，action 为 extract，params 含 query（及可选 extract_links 等）；抽取在前端用模型完成，Python 不调大模型。",
  "每轮回复结束后应用会自动关闭受控浏览器，无需为收尾而调用 browser_close。",
  "回答用户语言（默认中文）；工具返回的 JSON 用自然语言概括，不要整段粘贴。",
].join("\n");

async function runFrontendExtract(
  modelId: DeepSeekModelId,
  params: Record<string, unknown>
) {
  const query = params.query;
  if (typeof query !== "string" || !query.trim()) {
    return {
      error: "extract 需要 params.query 为非空字符串（与 browser-use 约定一致）。",
    };
  }
  if (!apiKey) {
    return {
      error:
        "未配置 VITE_DEEPSEEK_API_KEY，无法在前端完成抽取。请在 .env 中配置并重启开发服务器。",
    };
  }

  const maxChars =
    typeof params.max_chars === "number" && params.max_chars > 0
      ? params.max_chars
      : 120_000;
  const wantLinks = params.extract_links === true;
  const wantImages = params.extract_images === true;

  const state = await browserGetState(maxChars);
  const pageText =
    typeof state.text === "string" ? state.text : JSON.stringify(state);
  const truncated = Boolean(state.truncated);

  const hints: string[] = [];
  if (wantLinks) {
    hints.push("若文本中出现可辨识的 URL 或链接说明，请在结果中一并列出。");
  }
  if (wantImages) {
    hints.push("若需图片地址，请从文本中出现的图片相关描述或 URL 中提取。");
  }

  const { text } = await generateText({
    model: deepseek(modelId),
    prompt: [
      "你是网页内容抽取助手。下面是一段 browser_state 文本视图（来自真实浏览器页面，可能已截断）。",
      "请严格依据文本内容回答；文本中没有的信息不要编造。若因截断导致信息不全，请在说明中注明。",
      ...hints,
      "",
      "用户抽取需求：",
      query.trim(),
      "",
      "--- 页面文本 ---",
      pageText,
      "---",
      "",
      "请用用户使用的语言输出（默认中文），只输出抽取结果，不要冗长前言。",
    ].join("\n"),
  });

  return {
    extracted_content: text,
    page_truncated: truncated,
    approx_total_chars:
      typeof state.approx_total_chars === "number"
        ? state.approx_total_chars
        : undefined,
  };
}

function buildTools(modelId: DeepSeekModelId) {
  const browserActionsHelpTool = tool({
    description:
      "返回 browser-use 动作列表及参数说明（不含 extract；extract 由 browser_execute_action 在前端处理）。",
    inputSchema: z.object({}),
    execute: async () => {
      return browserActionsHelp();
    },
  });

  const browserExecuteActionTool = tool({
    description:
      "执行 browser-use 内建浏览器动作：search、navigate、go_back、wait、click、input、scroll、evaluate、switch、close、screenshot、write_file、read_file、done 等；其中 extract 在本工具内由前端模型完成（params 含 query，可选 extract_links、extract_images、max_chars）。params 键名与 browser_actions_help 中非 extract 动作一致。",
    inputSchema: z.object({
      action: z
        .string()
        .min(1)
        .describe("动作名，如 navigate、click、search、extract"),
      params: z
        .record(z.string(), z.unknown())
        .default({})
        .describe("该动作的参数对象；无参数时传 {}"),
    }),
    execute: async ({ action, params }) => {
      if (action === "extract") {
        return runFrontendExtract(modelId, params);
      }
      return browserExecuteAction(action, params);
    },
  });

  const browserGetStateTool = tool({
    description:
      "获取当前页 browser_state 文本视图（可交互元素索引、标签页等）。navigate/search 后调用；根据索引再 browser_execute_action(click/input/…)。",
    inputSchema: z.object({
      max_chars: z
        .number()
        .optional()
        .describe("最长字符数，默认 120000"),
    }),
    execute: async ({ max_chars }) => {
      return browserGetState(max_chars);
    },
  });

  return {
    browser_actions_help: browserActionsHelpTool,
    browser_execute_action: browserExecuteActionTool,
    browser_get_state: browserGetStateTool,
  };
}

export function createChatAgent(modelId: DeepSeekModelId) {
  return new ToolLoopAgent({
    model: deepseek(modelId),
    instructions: agentInstructions,
    tools: buildTools('deepseek-chat'),
    stopWhen: stepCountIs(24),
  });
}

export type ChatAgentUIMessage = InferAgentUIMessage<
  ReturnType<typeof createChatAgent>
>;
