# 任务书：ziwei-doushu 项目全面梳理（为二开迭代做准备）

## 目标
对 ziwei-doushu（紫微斗数排盘系统，基于倪海夏《天纪》三合派体系）当前工作分支 `feat_0.1` 做**全面代码梳理**，输出结构化文档，供后续二开迭代直接使用。

## 背景
- 仓库路径：`E:\yx-projects\ziweidoushu\ziwei-doushu`
- 两个分支：
  - `main`：开源版（Next.js + 排盘算法，无 AI 后端）
  - `feat_0.1`：运营版（当前 checkout，含 AI 解读 / 订阅 freemium / 名人案例 / SSE 聊天），比 main 多 ~36 文件 / +3753 行
- 技术栈：Next.js 15 (App Router) + React 19 + TypeScript + Tailwind + framer-motion + iztro 2.6 / iztro-hook / react-iztro / lunar-javascript；AI 侧 @anthropic-ai/sdk、ioredis、pg
- 线上站点：https://metisziwei.com
- 领域知识背景（务必了解，否则读不懂代码）：
  - `lib/ziwei/` 自研排盘算法 + 格局知识库 + 四化（禄权科忌）+ 真太阳时
  - `lib/nihai/` 倪海夏《天纪》体系（天纪/人纪/地纪分类知识）
  - `lib/classics/` 古籍原文（骨髓赋、紫微斗数全集/全书）
  - `lib/iztro.ts` + `lib/llm.ts`：AI provider 抽象，支持 agnes(免费) / deepseek / iztro 官方(付费，专业解读)；freemium 分层：plan=free 走 agnes，plan=deep 走 iztro，402 闸门 + 配额（`lib/plan.ts` MVP 文件存储，未来换 Postgres 三表）
  - `.workbuddy/memory/` 有历史决策记录（2026-08-27 iztro 接入联调结论、08-28 freemium 分层与栏目拆分），**所有侦察代理都应先读这些记忆**再读代码
- 本任务只做分析梳理，**不改任何代码**。每篇文档落盘到 `docs/analysis/` 下对应文件（文件名见各代理 goal），写作语言：中文。

## 统一文档结构（各代理按此组织）
1. **范围与职责**：本模块干什么、边界在哪
2. **关键文件清单**：路径 / 行数 / 职责 / 主要导出（附关键函数行号）
3. **核心流程与架构**：数据流、调用链、算法要点、与外部依赖(iztro/lunar-javascript)的交互
4. **关键概念与常量**：领域术语在本仓库代码中的体现
5. **已知坑点 / TODO / 遗留事项**：搜索代码中的 TODO/FIXME/⚠️，结合 .workbuddy 记忆
6. **二开扩展点建议**：哪里适合加功能、现状阻碍、风险点
7. **行号引用的关键代码锚点**：方便后续直接定位

## 输出
- `docs/analysis/01-排盘引擎与知识库.md`（代理 A）
- `docs/analysis/02-AI后端与运营层.md`（代理 B）
- `docs/analysis/03-前端页面与组件.md`（代理 C）
- 主 agent 最后汇总 `docs/analysis/00-项目总览与二开指引.md`
