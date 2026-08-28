import type { ZiweiChart } from '@/lib/ziwei/types';
import { streamIztroChat } from '@/lib/iztro';
import { getPlanState, consumeDeep, getChatHistory, appendChatHistory, clearChatHistory, type ChatMessage } from '@/lib/plan';
import { buildSystemPrompt, buildChartContext } from '@/lib/prompt';
import { SSE_HEADERS, buildTransformStream } from '@/lib/sse';

/**
 * POST /api/chat — AI 对话（多轮，iztro 深度模型，付费）
 *
 * 请求体：
 *   - uid: string          本地用户标识（生产替换为登录用户 id）
 *   - chart: ZiweiChart    当前命盘
 *   - message: string      用户新问题
 *   - reset?: boolean      是否清空历史（新命盘/新会话）
 *
 * 收费：AI 对话走 iztro 深度模型，每次调用消耗一次 deep 额度。
 * 记忆：服务端维护最近 N 轮 chatHistory（文件存储 MVP，生产改 Postgres）。
 */

interface ChatReq {
  uid?: string;
  chart?: ZiweiChart;
  message?: string;
  reset?: boolean;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ChatReq | null;
  const uid = body?.uid?.trim() || 'anonymous';
  const chart = body?.chart;
  const message = body?.message?.trim();
  const reset = !!body?.reset;

  if (!chart) {
    return new Response(JSON.stringify({ error: '缺少 chart 数据' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!message) {
    return new Response(JSON.stringify({ error: '缺少 message' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // 1. 配额/订阅检查（AI 对话必须订阅）
  const st = await getPlanState(uid);
  if (!st.deepAllowed) {
    return new Response(
      JSON.stringify({ error: 'DEEP_NOT_ALLOWED', upgrade: true, tier: st.tier, remaining: st.deepRemaining }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 2. 扣额度
  const consumed = await consumeDeep(uid);
  if (!consumed.ok) {
    return new Response(
      JSON.stringify({ error: 'QUOTA_EXCEEDED', upgrade: true, tier: consumed.state.tier, remaining: consumed.state.deepRemaining }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 3. 历史管理
  if (reset) await clearChatHistory(uid);
  const history = await getChatHistory(uid);
  const userMsg: ChatMessage = { role: 'user', content: message };
  await appendChatHistory(uid, [userMsg]);

  // 4. 构造完整消息：system + 命盘上下文 + 历史 + 当前问题
  const llmMessages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: `以下是命盘数据，请基于该命盘数据与用户持续对话：\n${buildChartContext(chart)}` },
    ...history,
    userMsg,
  ];

  // 5. 调用 iztro 流式接口
  try {
    const upstream = await streamIztroChat(llmMessages, { model: 'iztro-ziwei-v3', language: 'zh', maxTokens: 2048 });
    if (!upstream.body) {
      throw new Error('iztro 未返回流式响应体');
    }

    // 流式返回给前端，并在结束时保存 assistant 回复
    const transformed = buildTransformStream(upstream.body, {
      onDone: async (fullText: string) => {
        if (fullText.trim()) {
          await appendChatHistory(uid, [{ role: 'assistant', content: fullText }]);
        }
      },
    });

    return new Response(transformed, { headers: SSE_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: 'CHAT_FAILED', message: msg }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
