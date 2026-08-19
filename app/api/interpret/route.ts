import { BRANCHES } from '@/lib/ziwei/constants';
import { getLiuNianSiHua } from '@/lib/ziwei/sihua';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { getProviders, streamChatCompletion } from '@/lib/llm';

/**
 * POST /api/interpret — AI 命盘解读（SSE 流式）
 *
 * LLM 接入：OpenAI 兼容 Provider 层（lib/llm.ts）
 *   - 换模型/加模型 = 改 .env.local 的 AI_PROVIDER 与对应 KEY，零代码改动
 *   - 支持按序回退：AI_PROVIDER=agnes,deepseek → agnes 失败自动切 deepseek
 *   - 上游 OpenAI SSE → 转换为前端 InsightPanel 协议：
 *     data: {"delta":{"text":"..."}}\n\n ... data: [DONE]\n\n
 * 降级：未配置任何 API Key 时返回 mock 模板解读（便于开发调试）。
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── 系统提示（倪海厦《天纪》南派三合派立场） ───
// 动态注入当前日期：模型训练数据截止 2025，不知道"今年"是 2026，必须显式告知
function buildSystemPrompt(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return `你是资深紫微斗数命理师，精通倪海厦《天纪》体系（南派三合派）。

【当前时间】今天是 ${year}年${month}月${day}日。用户问题中的"今年""今年运势"均指 ${year} 年，请以 ${year} 年的流年为基准解读，不要使用更早的年份。

解读原则：
1. 以本命盘数据为准，结合十二宫星曜、亮度（庙旺利陷）、四化（禄权科忌）、三方四正、当前大限、当前流年进行解读。
2. 四化永远固定不动（倪师立场），不使用宫干自化、来因宫等飞星派工具。
3. 输出使用【小标题】分段（如【命格定性】【主星解读】【三方四正】【当前大限】【实际建议】），每段 2-4 句话，语气专业、通俗、有条理。
4. 定位为传统文化与自我认知参考：不承诺具体预测结果，不涉及封建迷信或恐吓性表述，涉及健康问题建议就医。
5. 引用倪师观点或古籍（《紫微斗数全集》《骨髓赋》《天纪》讲义）时注明出处。`;
}

// ─── chart → 结构化上下文（喂给 LLM） ───
function buildChartContext(chart: ZiweiChart): string {
  const g = chart.birthInfo.gender === 'male' ? '男' : '女';
  const lines: string[] = [];
  const now = new Date();
  const year = now.getFullYear();
  const ln = getLiuNianSiHua(year);
  lines.push(`命主：${g}，${chart.wuxingJuName}，命宫${BRANCHES[chart.mingGongBranch]}，身宫${BRANCHES[chart.shenGongBranch]}，紫微在${BRANCHES[chart.ziweiPos]}，农历 ${chart.lunarInfo.lunarYear}年${chart.lunarInfo.lunarMonth}月${chart.lunarInfo.lunarDay}日`);
  lines.push(`当前流年：${year}年（${ln.stemName}年），流年四化：${ln.transforms.禄}化禄、${ln.transforms.权}化权、${ln.transforms.科}化科、${ln.transforms.忌}化忌`);

  for (const p of chart.palaces) {
    const stars = p.stars.map(s => {
      let t = s.name;
      if (s.type === 'major' && s.brightness === 'bright') t += '(庙旺)';
      else if (s.type === 'major' && s.brightness === 'dim') t += '(落陷)';
      if (s.siHua) t += `化${s.siHua}`;
      return t;
    }).join('、') || '空宫';
    const daXian = p.daXianAge ? ` 大限${p.daXianAge[0]}-${p.daXianAge[1]}岁` : '';
    const mark = p.isMingGong ? ' [命宫]' : p.isShenGong ? ' [身宫]' : '';
    lines.push(`${p.name}${mark}(${BRANCHES[p.branch]}): ${stars}${daXian}`);
  }

  const dx = chart.daXians[chart.currentDaXianIndex];
  if (dx) lines.push(`当前大限：${dx.palaceName}，${dx.startAge}-${dx.endAge}岁`);

  return lines.join('\n');
}

// ─── Agnes 调用（SSE 流式 + 协议转换） ───
function buildTransformStream(upstreamBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              const content: string | undefined = json.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text: content } })}\n\n`));
              }
            } catch { /* 忽略无法解析的行 */ }
          }
        }
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text: chunk } })}\n\n`));
        await new Promise(r => setTimeout(r, 25));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const chart = body?.chart as ZiweiChart | undefined;
  const messages = (body?.messages ?? []) as ChatMessage[];

  if (!chart) {
    return new Response(JSON.stringify({ error: '缺少 chart 数据' }), { status: 400 });
  }

  // 构造 LLM 消息：system + 命盘上下文 + 用户消息（InsightPanel 的 prompt 保留）
  const llmMessages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: `以下是命盘数据，请基于此解读：\n${buildChartContext(chart)}` },
    ...messages,
  ];

  // 无任何可用 Provider → mock 降级（开发调试用）
  const providers = getProviders();
  if (providers.length === 0) {
    return mockSseResponse(buildMockReply(chart, messages));
  }

  // 按 AI_PROVIDER 顺序尝试，失败自动回退下一个
  for (const provider of providers) {
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
