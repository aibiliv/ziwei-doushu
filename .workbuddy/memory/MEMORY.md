# 项目长期记忆（ziwei-doushu）

## 架构决策
- AI 解读层经 `lib/llm.ts` 的 OpenAI 兼容 Provider 抽象；iztro 官方模型通过 `lib/iztro.ts` 接入（`AI_PROVIDER=iztro`）。
- iztro 官方 API 实测：`role:"system"` 消息生效可注入天纪体系；`metadata.system_prompt_override` 与 Session `instructions` 均被忽略，勿用。
- iztro 必须拿到阳历生日+时辰+性别才能跑 `iztro-mingpan`；`app/api/interpret/route.ts` 的 `buildChartContext` 已补阳历生日行。
- 单次 iztro 调用 ≈¥0.015（~12.9k 输入 token）；响应带 `billing.balance_after_cny`。
- 当前为全量走 iztro；免费/付费分层（freemium UI + 配额）尚未实现。

## 免费/付费分层（freemium，2026-08-28 实现）
- 分层模式：`plan=free` 走 agnes（免费），`plan=deep` 走 iztro（付费深度）。`AI_PROVIDER=agnes,iztro`。
- `lib/plan.ts`：订阅/配额 MVP（文件存储 `.data/plan.json`，gitignore）。接口 `getPlanState/activatePro/consumeDeep`，结构对齐生产 Postgres 三表（users/subscriptions/usage_logs）。⚠️ 生产替换为 pg + NextAuth 鉴权 + 支付 webhook。
- `app/api/interpret/route.ts`：按 `plan` 选 provider；deep 必经 `getPlanState`+`consumeDeep` 闸门，未订阅/耗尽返回 402 `{upgrade:true}`。
- `app/api/plan/route.ts`：MVP 模拟支付（POST 激活 pro / GET 查状态），生产由支付 webhook 触发。
- 前端 `components/InsightPanel.tsx`：localStorage `uid`、深度解读 toggle（plan=deep）、挂载拉 `deepAllowed`、7 个 locked 主题与深度解读均按 `deepAllowed` 闸、402 弹升级 modal（含 MVP「体验激活」按钮）。原 `DEV_BYPASS_LOCKED` 已移除。
- 验证：tsc 通过；`lib/plan.ts` 算法实测（free→false，activate→pro/100，consume 递减，未订阅 ok:false）。
