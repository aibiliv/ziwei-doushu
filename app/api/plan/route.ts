/**
 * GET  /api/plan?uid=xxx    → 查询订阅/配额状态
 * POST /api/plan            → body { uid } 模拟支付成功，激活 pro（MVP）
 *
 * ⚠️ MVP：POST 直接激活，仅用于本地跑通免费/付费分层。
 * 生产环境须由支付 webhook(Stripe/微信)校验签名后调用 activatePro，
 * 且 uid 应来自已登录用户的服务端身份（NextAuth session），不要信任前端传入。
 */
import { activatePro, getPlanState } from '@/lib/plan';

export async function GET(req: Request) {
  const uid = new URL(req.url).searchParams.get('uid');
  if (!uid) return new Response(JSON.stringify({ error: '缺少 uid' }), { status: 400 });
  return Response.json(await getPlanState(uid));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const uid = body?.uid as string | undefined;
  if (!uid) return new Response(JSON.stringify({ error: '缺少 uid' }), { status: 400 });
  const state = await activatePro(uid);
  return Response.json(state);
}
