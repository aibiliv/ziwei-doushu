/**
 * LLM Provider 抽象层（OpenAI 兼容协议）
 *
 * 设计目标：换模型 = 改 .env.local 配置，零代码改动。
 * 支持多 Provider 按序回退：AI_PROVIDER=agnes,deepseek 表示主用 agnes，
 * 请求失败时自动回退 deepseek。
 *
 * 已适配（全部 OpenAI 兼容，SSE 格式相同）：
 *   - agnes   : AGNES_API_KEY / AGNES_BASE_URL / AGNES_MODEL
 *   - deepseek: DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL
 *   - custom  : CUSTOM_API_KEY / CUSTOM_BASE_URL / CUSTOM_MODEL（任意兼容服务）
 *
 * 注意：Anthropic（Claude）协议不同，需单独适配，未包含在此层。
 */

export interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const env = (k: string) => process.env[k];

function configOf(
  name: string,
  apiKey: string,
  baseUrl: string | undefined,
  defaultBaseUrl: string,
  model: string | undefined,
  defaultModel: string,
): ProviderConfig | null {
  if (!apiKey) return null;
  return { name, apiKey, baseUrl: baseUrl ?? defaultBaseUrl, model: model ?? defaultModel };
}

/** 按 AI_PROVIDER 顺序返回可用 Provider 列表（只包含已配置 key 的） */
export function getProviders(): ProviderConfig[] {
  const order = (env('AI_PROVIDER') ?? 'agnes')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const providers: ProviderConfig[] = [];
  for (const name of order) {
    let p: ProviderConfig | null = null;
    switch (name) {
      case 'agnes':
        p = configOf('agnes', env('AGNES_API_KEY') ?? '', env('AGNES_BASE_URL'), 'https://apihub.agnes-ai.cn/v1', env('AGNES_MODEL'), 'agnes-2.5-flash');
        break;
      case 'deepseek':
        p = configOf('deepseek', env('DEEPSEEK_API_KEY') ?? '', env('DEEPSEEK_BASE_URL'), 'https://api.deepseek.com/v1', env('DEEPSEEK_MODEL'), 'deepseek-chat');
        break;
      case 'custom':
        p = configOf('custom', env('CUSTOM_API_KEY') ?? '', env('CUSTOM_BASE_URL'), 'https://api.openai.com/v1', env('CUSTOM_MODEL'), 'gpt-4o-mini');
        break;
    }
    if (p) providers.push(p);
  }
  return providers;
}

/** 统一的 OpenAI 兼容流式调用；失败时返回 null 由调用方决定是否回退 */
export async function streamChatCompletion(
  provider: ProviderConfig,
  messages: { role: string; content: string }[],
): Promise<Response | null> {
  try {
    const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error(`[LLM:${provider.name}] HTTP ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }
    return res;
  } catch (e) {
    console.error(`[LLM:${provider.name}] 请求异常:`, (e as Error).message);
    return null;
  }
}
