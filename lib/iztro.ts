/**
 * iztro 官方托管模型客户端（OpenAI 兼容协议）
 *
 * 端点：https://chat-api.iztro.com/v2/chat/completions
 * 模型：iztro-ziwei-v3（本命/合盘/长周期）| iztro-qimen-v3（单一事件决策+应期）
 *
 * 联调实测要点（2026-08-27，Key sk_ziwei_***）：
 * - 流式返回标准 OpenAI SSE：`data: {"choices":[{"delta":{"content":"..."}}]}`，结束于 `data: [DONE]`
 * - 非流式返回 choices[0].message.content + iztro_tools[] + usage + billing.balance_after_cny
 * - `role:"system"` 消息【生效】，可注入天纪体系/格局库；`metadata.system_prompt_override`【被忽略】，勿用
 * - 必须携带阳历生日+时辰+性别，否则 iztro-mingpan 无法计算，模型会要求补信息
 * - 单次调用约 12.9k 输入 token（命盘被注入 prompt），成本约 ¥0.015/次
 */

export type IztroModel = 'iztro-ziwei-v3' | 'iztro-qimen-v3';
export type IztroLanguage = 'zh' | 'en' | 'ko' | 'ja' | 'vi';
export type IztroReasoning = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface IztroChatOptions {
  model?: IztroModel;
  language?: IztroLanguage;
  reasoningEffort?: IztroReasoning;
  maxTokens?: number;
  /** 奇门问事时间（ISO 8601，带 UTC 偏移） */
  currentDatetime?: string;
  /** 默认 true；设为 false 可关闭服务端排盘计算（一般不需要） */
  enableIztroCall?: boolean;
}

export interface IztroChatResult {
  text: string;
  tools: string[];
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    [k: string]: unknown;
  } | null;
  balanceAfterCny: number | null;
}

const IZTRO_BASE = 'https://chat-api.iztro.com/v2';

export class IztroError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'IztroError';
  }
}

type ChatRole = 'system' | 'user' | 'assistant';
type ChatMessage = { role: ChatRole; content: string };

function buildBody(messages: ChatMessage[], opts: IztroChatOptions, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model ?? 'iztro-ziwei-v3',
    messages,
    stream,
    language: opts.language ?? 'zh',
    max_tokens: opts.maxTokens ?? 4096,
  };
  if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;
  if (opts.enableIztroCall === false) body.enable_iztro_call = false;
  if (opts.currentDatetime) body.metadata = { current_datetime: opts.currentDatetime };
  return body;
}

/** 流式：返回上游 OpenAI SSE Response，由调用方做协议转换（见 app/api/interpret/route.ts 的 buildTransformStream） */
export async function streamIztroChat(messages: ChatMessage[], opts: IztroChatOptions = {}): Promise<Response> {
  const apiKey = process.env.IZTRO_API_KEY;
  if (!apiKey) throw new Error('IZTRO_API_KEY 未配置（请在 .env.local 设置）');

  const res = await fetch(`${IZTRO_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildBody(messages, opts, true)),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new IztroError(res.status, `iztro HTTP ${res.status}: ${err.slice(0, 300)}`);
  }
  return res;
}

/** 非流式：一次性返回文本，便于单轮/测试 */
export async function iztroChat(messages: ChatMessage[], opts: IztroChatOptions = {}): Promise<IztroChatResult> {
  const apiKey = process.env.IZTRO_API_KEY;
  if (!apiKey) throw new Error('IZTRO_API_KEY 未配置（请在 .env.local 设置）');

  const res = await fetch(`${IZTRO_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(buildBody(messages, opts, false)),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new IztroError(res.status, `iztro HTTP ${res.status}: ${err.slice(0, 300)}`);
  }
  const json = await res.json();
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    tools: (json.iztro_tools as string[]) ?? [],
    usage: json.usage ?? null,
    balanceAfterCny: json.billing?.balance_after_cny ?? null,
  };
}
