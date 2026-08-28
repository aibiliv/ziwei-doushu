/**
 * 收费分层 MVP —— 订阅 / 配额（文件存储，便于本地零依赖跑通流程）
 *
 * 这是「免费(agnes) / 付费深度(iztro)」分层的服务端真相来源。
 * 当前用 .data/plan.json 存状态；生产环境直接把下面三个函数换成 Postgres
 * （pg 已在依赖中）—— 对应之前规划的 users / subscriptions / usage_logs 三表，
 * 并由 NextAuth(鉴权) + 支付 webhook(激活) 驱动，本文件接口保持不变。
 *
 * 闸门语义：
 *   - free  ：agnes 解读，不限量（站点主自己承担 token 成本）
 *   - pro   ：iztro 深度解读，每月 deepQuota 次，需订阅有效
 *   - 跨月自动重置 deepUsedThisMonth
 */

import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data');
const STORE = path.join(DATA_DIR, 'plan.json');

export type Tier = 'free' | 'pro';

export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface PlanRecord {
  tier: Tier;
  deepQuota: number; // 每月 deep 解读额度
  deepUsedThisMonth: number;
  monthKey: string; // YYYY-MM，跨月自动重置
  expiresAt: number; // pro 到期时间戳(ms)
  /** AI 对话历史（由后端维护，用于无状态 Chat Completions 多轮） */
  chatHistory: ChatMessage[];
  /** 预留：若后续改用 iztro 托管 Session API，存 session_id */
  chatSessionId?: string;
}

/** pro 每月 deep 额度（示例值，上线按定价调） */
export const DEFAULT_DEEP_QUOTA = 100;

function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function readAll(): Promise<Record<string, PlanRecord>> {
  try {
    const raw = await fs.readFile(STORE, 'utf-8');
    return JSON.parse(raw) as Record<string, PlanRecord>;
  } catch {
    return {};
  }
}

async function writeAll(data: Record<string, PlanRecord>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE, JSON.stringify(data, null, 2), 'utf-8');
}

const MAX_CHAT_HISTORY = 20; // 只保留最近 10 轮 user+assistant

function fresh(uid: string): PlanRecord {
  return { tier: 'free', deepQuota: 0, deepUsedThisMonth: 0, monthKey: monthKey(), expiresAt: 0, chatHistory: [] };
}

/** 读取 AI 对话历史（生产改为 SELECT chat_history FROM users/subscriptions） */
export async function getChatHistory(uid: string): Promise<ChatMessage[]> {
  const all = await readAll();
  return (all[uid] ?? fresh(uid)).chatHistory;
}

/** 追加并截断对话历史 */
export async function appendChatHistory(uid: string, messages: ChatMessage[]): Promise<void> {
  const all = await readAll();
  let r = all[uid] ?? fresh(uid);
  r = { ...r, chatHistory: [...r.chatHistory, ...messages].slice(-MAX_CHAT_HISTORY) };
  all[uid] = r;
  await writeAll(all);
}

/** 清空 AI 对话历史（reset 或新命盘） */
export async function clearChatHistory(uid: string): Promise<void> {
  const all = await readAll();
  let r = all[uid] ?? fresh(uid);
  r = { ...r, chatHistory: [] };
  all[uid] = r;
  await writeAll(all);
}

/** 预留：读取/写入 iztro 托管 session id */
export async function getChatSessionId(uid: string): Promise<string | undefined> {
  const all = await readAll();
  return (all[uid] ?? fresh(uid)).chatSessionId;
}

export async function setChatSessionId(uid: string, sessionId: string): Promise<void> {
  const all = await readAll();
  let r = all[uid] ?? fresh(uid);
  r = { ...r, chatSessionId: sessionId };
  all[uid] = r;
  await writeAll(all);
}

export interface PlanState {
  tier: Tier;
  deepAllowed: boolean; // 是否可走 iztro 深度解读
  deepRemaining: number; // 本月剩余 deep 额度
  expiresAt: number;
}

export async function getPlanState(uid: string): Promise<PlanState> {
  const all = await readAll();
  let r = all[uid] ?? fresh(uid);
  // 跨月重置
  if (r.monthKey !== monthKey()) {
    r = { ...r, deepUsedThisMonth: 0, monthKey: monthKey() };
    all[uid] = r;
    await writeAll(all);
  }
  const pro = r.tier === 'pro' && r.expiresAt > Date.now();
  const remaining = pro ? Math.max(0, r.deepQuota - r.deepUsedThisMonth) : 0;
  return { tier: pro ? 'pro' : 'free', deepAllowed: pro && remaining > 0, deepRemaining: remaining, expiresAt: r.expiresAt };
}

/**
 * MVP 模拟支付成功：激活 pro。
 * ⚠️ 生产由支付 webhook(Stripe/微信)调用并校验签名，勿在前端直连本函数。
 */
export async function activatePro(uid: string, days = 30, quota = DEFAULT_DEEP_QUOTA): Promise<PlanState> {
  const all = await readAll();
  const r = all[uid] ?? fresh(uid);
  const mk = monthKey();
  all[uid] = {
    ...r,
    tier: 'pro',
    deepQuota: quota,
    // 若仍是本月，保留已用额度；否则归零
    deepUsedThisMonth: r.monthKey === mk ? r.deepUsedThisMonth : 0,
    monthKey: mk,
    expiresAt: Date.now() + days * 86400_000,
  };
  await writeAll(all);
  return getPlanState(uid);
}

/** 消耗一次 deep 额度；返回是否成功（未订阅/额度耗尽则 false） */
export async function consumeDeep(uid: string): Promise<{ ok: boolean; state: PlanState }> {
  const all = await readAll();
  let r = all[uid] ?? fresh(uid);
  const pro = r.tier === 'pro' && r.expiresAt > Date.now();
  if (!pro) return { ok: false, state: await getPlanState(uid) };
  if (r.monthKey !== monthKey()) r = { ...r, deepUsedThisMonth: 0, monthKey: monthKey() };
  if (r.deepUsedThisMonth >= r.deepQuota) return { ok: false, state: await getPlanState(uid) };
  r.deepUsedThisMonth += 1;
  all[uid] = r;
  await writeAll(all);
  return { ok: true, state: await getPlanState(uid) };
}
