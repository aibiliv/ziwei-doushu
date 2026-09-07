import { BRANCHES } from '@/lib/ziwei/constants';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { getProviders, streamChatCompletion, type ProviderConfig } from '@/lib/llm';
import { getPlanState, consumeDeep } from '@/lib/plan';
import { buildSystemPrompt, buildChartContext, type ChartContextView } from '@/lib/prompt';
import { SSE_HEADERS, buildTransformStream } from '@/lib/sse';

/**
 * POST /api/interpret — AI 命盘解读（SSE 流式）
 *
 * 收费分层：请求体携带 plan（free=agnes 免费 / deep=iztro 付费深度）
 *   - free  → 仅用非 iztro 的 Provider（agnes/deepseek），不限量
 *   - deep  → 仅用 iztro；需经 lib/plan.ts 配额闸门（getPlanState + consumeDeep）
 *            未订阅/额度耗尽返回 402 { upgrade:true } → 前端弹升级
 *   - 换模型/加模型 = 改 .env.local 的 AI_PROVIDER 与对应 KEY，零代码改动
 *
 * iztro 经 lib/iztro.ts 接入：OpenAI 兼容 SSE，自动 language=zh；
 *   其 system 角色提示词【生效】（天纪体系由此注入），但需 buildChartContext 携带阳历生日
 * 上游 OpenAI SSE → 转换为前端 InsightPanel 协议：
 *   data: {"delta":{"text":"..."}}\n\n ... data: [DONE]\n\n
 * 降级：未配置任何 API Key 时返回 mock 模板解读（便于开发调试）。
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── Mock 降级（无 key 时使用，结构参考 buildChartContext） ───
function extractFacts(chart: ZiweiChart) {
  const gender = chart.birthInfo.gender === 'male' ? '男' : '女';
  const ming = chart.palaces.find(p => p.isMingGong);
  const majorStars = (ming?.stars ?? []).filter(s => s.type === 'major').map(s => s.name);
  const luckyStars = (ming?.stars ?? []).filter(s => s.type === 'lucky').map(s => s.name);
  const shaStars = (ming?.stars ?? []).filter(s => s.type === 'sha').map(s => s.name);
  const dx = chart.daXians[chart.currentDaXianIndex];
  return {
    gender,
    wuxingJu: chart.wuxingJuName,
    mingBranch: BRANCHES[chart.mingGongBranch],
    majorStars: majorStars.join('、') || '（空宫，借对宫主星）',
    luckyStars: luckyStars.join('、') || '无',
    shaStars: shaStars.join('、') || '无',
    daXian: dx ? `${dx.palaceName}宫 ${dx.startAge}–${dx.endAge}岁` : '—',
  };
}

function buildMockReply(chart: ZiweiChart, messages: ChatMessage[]): string {
  const c = extractFacts(chart);
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const prompt = lastUser?.content ?? '';

  const head = `**【命格定性】**\n${c.gender}命，${c.wuxingJu}，命宫主星 ${c.majorStars}。整体格局以稳定与内在积累为底色。\n\n**【主星解读】**\n命宫主星 ${c.majorStars}，此配置偏重个人意志与目标感，行动力强，重视实际成果。吉星（${c.luckyStars}）入命，为机遇与人际带来助力。\n\n**【三方四正】**\n财帛、官禄、迁移三宫联动决定整体发展模式（MOCK 解读，配置 AGNES_API_KEY 后由 agnes-2.5-flash 输出完整分析）。\n\n**【当前大限】**\n当前行运至${c.daXian}，此阶段运势围绕该宫位领域展开。\n\n**【实际建议】**\n优势在于目标明确、行动力强；需留意煞星（${c.shaStars}）带来的节奏干扰与情绪波动。`;

  if (prompt.includes('感情')) return `**【感情格局】**\n${c.gender}命，命宫主星 ${c.majorStars}，感情模式偏向直来直往，重视实际感受。\n\n**【夫妻宫分析】**\n夫妻宫星曜配置决定相处方式（MOCK 解读，配置 AGNES_API_KEY 后输出完整分析）。\n\n**【实际建议】**\n感情经营重在坦诚沟通与节奏把控。`;
  if (prompt.includes('事业')) return `**【事业格局】**\n命宫主星 ${c.majorStars}，事业心强，适合需要独立判断与专业深度的方向。\n\n**【官禄宫分析】**\n官禄宫配置决定成就模式（MOCK 解读，配置 AGNES_API_KEY 后输出完整分析）。\n\n**【实际建议】**\n聚焦主业深耕，善用吉星（${c.luckyStars}）带来的贵人缘。`;
  if (prompt.includes('财运')) return `**【财运格局】**\n${c.wuxingJu}之人，财运以阶段积累为主。\n\n**【财帛宫分析】**\n财帛宫配置决定财富来源与流动模式（MOCK 解读，配置 AGNES_API_KEY 后输出完整分析）。\n\n**【理财建议】**\n宜稳中求进，避免高风险投机。`;
  if (prompt.includes('健康')) return `**【疾厄宫主星】**\n疾厄宫星曜指向身体薄弱环节（MOCK 解读，配置 AGNES_API_KEY 后结合倪师子午流注输出）。\n\n**【预防建议】**\n规律作息、适度运动，重视睡眠与情绪疏导。`;
  if (prompt.includes('性格')) return `**【命宫主星性格】**\n命宫主星 ${c.majorStars}，性格核心是目标感强、行事果断。\n\n**【优势与人生课题】**\n优势是执行力与决断力；课题在于节奏把控与情绪管理。`;
  return head;
}

function mockSseResponse(text: string): Response {
  const encoder = new TextEncoder();
  const chunks = text.match(/.{1,6}/gs) ?? [text];
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text: chunk } })}
\n`));
        await new Promise(r => setTimeout(r, 25));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const chart = body?.chart as ZiweiChart | undefined;
  const messages = (body?.messages ?? []) as ChatMessage[];
  // 分层：free = agnes（免费），deep = iztro（付费深度解读）
  const plan = body?.plan === 'deep' ? 'deep' : 'free';
  const uid = (body?.uid as string | undefined) ?? 'anonymous';
  // 运限解读增强：透传 view/daXianIndex/liunianYear → buildChartContext(opts)
  // （仅影响 prompt 的「=== 所选运限 ===」追加段；不改 plan/402/配额逻辑）
  const chartView: ChartContextView | undefined =
    body?.view === 'daxian' || body?.view === 'liunian' || body?.view === 'mingpan'
      ? body.view
      : undefined;
  const daXianIndex = typeof body?.daXianIndex === 'number' ? body.daXianIndex : undefined;
  const liunianYear = typeof body?.liunianYear === 'number' ? body.liunianYear : undefined;

  if (!chart) {
    return new Response(JSON.stringify({ error: '缺少 chart 数据' }), { status: 400 });
  }

  // 构造 LLM 消息：system + 命盘上下文 + 用户消息（InsightPanel 的 prompt 保留）
  const llmMessages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: `以下是命盘数据，请基于此解读：\n${buildChartContext(chart, { view: chartView, daXianIndex, liunianYear })}` },
    ...messages,
  ];

  // 无任何可用 Provider → mock 降级（开发调试用）
  const providers = getProviders();
  if (providers.length === 0) {
    return mockSseResponse(buildMockReply(chart, messages));
  }

  // 按 plan 选 provider：free 排除 iztro，deep 仅用 iztro
  let selected: ProviderConfig[];
  if (plan === 'deep') {
    const st = await getPlanState(uid);
    if (!st.deepAllowed) {
      return new Response(
        JSON.stringify({
          error: 'DEEP_NOT_ALLOWED',
          upgrade: true,
          tier: st.tier,
          remaining: st.deepRemaining,
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } },
      );
    }
    await consumeDeep(uid);
    selected = providers.filter(p => p.name === 'iztro');
    if (selected.length === 0) {
      return new Response(
        JSON.stringify({ error: '未配置 iztro（付费深度解读）Provider，请检查 IZTRO_API_KEY' }),
        { status: 502 },
      );
    }
  } else {
    selected = providers.filter(p => p.name !== 'iztro');
    if (selected.length === 0) {
      return new Response(
        JSON.stringify({ error: '未配置免费 Provider（agnes/deepseek），请检查 AI_PROVIDER' }),
        { status: 502 },
      );
    }
  }

  // 按选定顺序尝试，失败自动回退下一个
  for (const provider of selected) {
    const upstream = await streamChatCompletion(provider, llmMessages);
    if (upstream && upstream.body) {
      return new Response(buildTransformStream(upstream.body), { headers: SSE_HEADERS });
    }
  }

  return new Response(
    JSON.stringify({ error: '所有 LLM Provider 均调用失败，请检查 API Key 与网络配置' }),
    { status: 502 },
  );
}
