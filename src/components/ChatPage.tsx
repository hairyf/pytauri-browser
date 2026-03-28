import { useChat } from "@ai-sdk/react";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  createChatAgent,
  type ChatAgentUIMessage,
  type DeepSeekModelId,
} from "@/ai/agent";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DirectChatTransport, getToolName, isToolUIPart } from "ai";
import { browserClose } from "@/lib/browser-tauri";
import { AlertCircleIcon, BotIcon, BrainIcon, ChevronDownIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

const AttachmentStrip = memo(() => {
  const attachments = usePromptInputAttachments();

  const handleRemove = useCallback(
    (id: string) => {
      attachments.remove(id);
    },
    [attachments]
  );

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((file) => (
        <Attachment
          data={file}
          key={file.id}
          onRemove={() => {
            handleRemove(file.id);
          }}
        >
          <AttachmentPreview />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
});

AttachmentStrip.displayName = "AttachmentStrip";

function MessageParts({ message }: { message: ChatAgentUIMessage }) {
  return (
    <>
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return (
            <MessageResponse key={`${message.id}-text-${i}`}>
              {part.text}
            </MessageResponse>
          );
        }

        if (part.type === "reasoning") {
          const streaming = part.state === "streaming";
          return (
            <Collapsible
              className="rounded-lg border border-border/80 bg-muted/30"
              defaultOpen={streaming}
              key={`${message.id}-reasoning-${i}`}
            >
              <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground text-xs hover:bg-muted/50">
                <BrainIcon className="size-3.5 shrink-0" />
                <span className="font-medium">
                  {streaming ? "思考中…" : "思考过程"}
                </span>
                <ChevronDownIcon className="ml-auto size-4 shrink-0 opacity-60" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3">
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-background/80 p-3 font-mono text-[0.8125rem] text-foreground leading-relaxed">
                  {part.text}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          );
        }

        if (part.type === "file") {
          const isImage = part.mediaType.startsWith("image/");
          return (
            <div
              className="flex flex-col gap-1"
              key={`${message.id}-file-${i}`}
            >
              {isImage ? (
                <img
                  alt={part.filename ?? "attachment"}
                  className="max-h-64 max-w-full rounded-md border object-contain"
                  src={part.url}
                />
              ) : (
                <a
                  className="text-primary text-sm underline"
                  download={part.filename}
                  href={part.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {part.filename ?? "下载附件"}
                </a>
              )}
            </div>
          );
        }

        if (isToolUIPart(part)) {
          const name = getToolName(part);

          return (
            <Tool defaultOpen={false} key={`${message.id}-tool-${i}`}>
              {part.type === "dynamic-tool" ? (
                <ToolHeader
                  state={part.state}
                  title={String(name)}
                  toolName={part.toolName}
                  type="dynamic-tool"
                />
              ) : (
                <ToolHeader
                  state={part.state}
                  title={String(name)}
                  type={part.type}
                />
              )}
              <ToolContent>
                {"input" in part && part.input !== undefined ? (
                  <ToolInput input={part.input} />
                ) : null}
                <ToolOutput
                  errorText={"errorText" in part ? part.errorText : undefined}
                  output={"output" in part ? part.output : undefined}
                />
              </ToolContent>
            </Tool>
          );
        }

        if (part.type === "step-start") {
          return null;
        }

        return null;
      })}
    </>
  );
}

export function ChatPage() {
  const hasApiKey = Boolean(import.meta.env.VITE_DEEPSEEK_API_KEY);

  const [modelId, setModelId] = useState<DeepSeekModelId>("deepseek-chat");

  const agent = useMemo(() => createChatAgent(modelId), [modelId]);
  const transport = useMemo(
    () =>
      new DirectChatTransport({
        agent,
        sendReasoning: true,
      }),
    [agent]
  );

  const { messages, sendMessage, status, error, stop } =
    useChat<ChatAgentUIMessage>({
      id: modelId,
      transport,
      onFinish: () => {
        void browserClose().catch(() => {
          /* 非 Tauri 或 IPC 失败时忽略 */
        });
      },
    });

  const handleSubmit = useCallback(
    async (input: PromptInputMessage) => {
      if (!hasApiKey) {
        return;
      }
      const text = input.text.trim();
      const files = input.files ?? [];
      if (!text && files.length === 0) {
        return;
      }
      if (files.length > 0 && !text) {
        await sendMessage({ files });
        return;
      }
      await sendMessage({
        files: files.length > 0 ? files : undefined,
        text,
      });
    },
    [hasApiKey, sendMessage]
  );

  const empty = messages.length === 0;

  const statusBar = useMemo(() => {
    if (!hasApiKey) {
      return (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive text-sm">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>
            请在项目根目录创建{" "}
            <code className="rounded bg-muted px-1">.env</code> 并设置{" "}
            <code className="rounded bg-muted px-1">VITE_DEEPSEEK_API_KEY</code>
            （可参考 <code className="rounded bg-muted px-1">.env.example</code>
            ），然后重启开发服务器。
          </span>
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive text-sm">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>{error.message}</span>
        </div>
      );
    }
    return null;
  }, [error, hasApiKey]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <BotIcon className="mt-0.5 size-5 shrink-0" />
          <div>
            <h1 className="font-semibold text-sm">DeepSeek 助手</h1>
            <p className="text-muted-foreground text-xs">
              工具：browser-use 全量动作（经 PyTauri / DeepSeek API）
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              模型
            </span>
            <Select
              disabled={!hasApiKey}
              onValueChange={(v) => {
                setModelId(v as DeepSeekModelId);
              }}
              value={modelId}
            >
              <SelectTrigger className="w-[min(100vw-4rem,220px)]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deepseek-chat">
                  deepseek-chat（对话）
                </SelectItem>
                <SelectItem value="deepseek-reasoner">
                  deepseek-reasoner（推理）
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>
      {statusBar}
      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
          {empty ? (
            <ConversationEmptyState
              description="向模型提问，或通过菜单添加图片与文件。deepseek-chat 以文本为主；若多模态请求失败可仅发送文字。"
              title="开始对话"
            />
          ) : (
            messages.map((m) => (
              <Message from={m.role} key={m.id}>
                <MessageContent>
                  <MessageParts message={m} />
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t bg-background p-3">
        <PromptInput
          className="w-full flex justify-end"
          globalDrop
          multiple
          onSubmit={handleSubmit}
        >
          <PromptInputHeader>
            <AttachmentStrip />
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextarea
              disabled={!hasApiKey}
              placeholder={
                hasApiKey
                  ? "输入消息…（Enter 发送，Shift+Enter 换行）"
                  : "配置 API Key 后即可使用"
              }
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            <PromptInputSubmit
              disabled={!hasApiKey}
              onStop={stop}
              status={status}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
