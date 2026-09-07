# 任务书：大限/流年解读增强（飞星派四化技法，分层共存）

## 目标
当前大限/流年只有"盘面日期切换 + 三方四正连线 + TimeNav 一行四化文字"，**AI 解读完全不感知用户所选运限**（服务端永远用当前自然年）。本次迭代把大限/流年做成真正可解读的运限层。

## 术数口径（分层共存，防算法写歪）
1. **本命层（mingpan）**：维持倪师《天纪》三合派现状——格局/三方四正/本命四化（star.siHua = 生年干四化），**现有代码与 prompt 立场不动**。
2. **大限层（daxian）**：引入**大限宫干四化**（飞星派技法）。规则：
   - 大限命宫 = `chart.daXians[idx].palaceBranch` 对应宫；大限宫干 = 该宫的 `palace.stem`（已由 iztro 填好）。
   - 大限四化 = `SI_HUA_TABLE[palace.stem]` 四星（sihua.ts `getDaXianSiHua` 已实现，可直接用）。
   - **四化飞布**：禄/权/科/忌四星各自在本命 12 宫的落宫 = 该大限被引动的宫位（如甲干廉贞化禄，廉贞在本命夫妻宫 → 该大限夫妻宫事被引动）。
   - 补充上下文：大限命宫落在本命哪一宫（宫职重叠，如大限命宫=本命财帛宫 → 此十年主题求财）。
3. **流年层（liunian）**：
   - **流年命宫 = 流年地支宫**（三合太岁口径，与 SanFangOverlay 现有 `getYearZhiIndex` 一致，勿引入小限/斗君——二期再说）。
   - 流年四化 = 流年天干四化（sihua.ts `getLiuNianSiHua(year)` 已实现）+ 四化飞布落宫。
4. **不做**（代码里有但本次不用）：宫干自化、来因宫追根、流月四化、小限。sihua.ts 现有函数保留不动，只是不接入。
5. 流年/大限四化飞布实现 = 找四化星（主星）在本命盘的落宫；若四化星为命盘中不存在的辅星（一般不会，四化皆主星）则跳过。计算需新增纯函数放 `lib/ziwei/sihua.ts`（或同目录新文件 limit.ts），**必须可单测**。

## 功能拆分（A+B+C 全做）

### A. 数据/prompt 层增强
- `lib/prompt.ts`：
  - `buildChartContext(chart)` 签名扩展为 `buildChartContext(chart, opts?: { view?: TimeView; daXianIndex?: number; liunianYear?: number })`。view 非 mingpan 时，在现有文本后追加"=== 所选运限 ==="段：大限 → 大限宫名/宫干支/年龄区间/大限四化四星/每化飞布落宫/宫职重叠；流年 → 流年干支/流年命宫落在本命哪宫/流年四化四星/飞布落宫。
  - `buildSystemPrompt()` 增加一条口径说明："本命盘按倪海厦《天纪》三合派断格局；大限/流年按四化飞星技法断引动——以大限宫干/流年天干所化禄权科忌飞布落宫为线索，结合落宫宫职与三方四正解读，化忌落宫为当年/该限重点课题。"（原"四化永远固定、禁用飞星工具"措辞仅限本命盘语境，需微调表述避免自相矛盾）
- 注意 `prompt.ts` 是服务端 + iztro provider 共用，改动需兼容 iztro 官方模型（它读 system + 文本）。

### B. 新增运限解读入口（InsightPanel 扩展）
- `components/InsightPanel.tsx`（现 1090 行，勿整体重写，增量改）：
  - props 扩展（**全部可选**，不破坏 cases/page.tsx 现有 `<InsightPanel chart={chart} />`）：`view?: TimeView`、`liunianYear?: number`、`activeDaXianIndex?: number`（缺省 = 本命模式，不显示运限入口）。
  - 本命模式下 UI 与逻辑**零变化**（免费/付费 13 维度、AI 对话、402 弹窗均不动）。
  - 当 `view==='daxian'`：命盘分析 tab 区显示一个"此大限运势"分析卡/按钮；`view==='liunian'` 显示"此流年运势"。点击后走**现有 generateAnalysis 管线**（复用 SSE/排队/渲染），但：
    - 请求体加 `view`、`daXianIndex`（view=daxian 时）、`liunianYear`（view=liunian 时）
    - 线程 key 用独立命名空间（如 `dx-{index}` / `ln-{year}`），勿污染本命 13 维线程；**运限解读线程不写回历史**（localStorage 结构不动，避免历史回载歧义——task.md 注明即可，代码里 onThreadsChange 对运限线程跳过或只在本命线程变更时触发）
  - 运限解读的付费口径：走 free（agnes）即可，不加锁（降低门槛、本命 7 维 locked 已有付费墙；若体验后要收费后续再加）。请求里 `plan:'free'`。
- `app/chart/page.tsx`：把现有 `view/liunianYear/activeDaXianIndex` 状态传给 `<InsightPanel>`。
- `app/api/interpret/route.ts`：解析并透传 `view/daXianIndex/liunianYear` → 调 `buildChartContext(chart, opts)`；**不改变现有 plan/402/配额逻辑**。

### C. 盘面四化标注
- 先调研：react-iztro `Iztrolabe` 在 `horoscopeDate`（chart/page.tsx L63-77 已传）下是否已自动渲染对应大限/流年的四化徽章（查 node_modules/react-iztro 源码/文档确认 horoscopeDate 语义）。若已渲染 → C 只需让 TimeNav 四化说明行与该盘面一致即可（基本已完成）；若未渲染宫位四化 → 仿照 `components/SanFangOverlay.tsx`（DOM 坐标实测）做一个轻量 overlay：按当前 view 算出四化飞布落宫，在对应 `.iztro-palace` 上叠加彩色角标（禄绿/权蓝/科黄/忌红，复用 TimeNav L43-48 SIHUA_COLORS）。
- 决策记录在代码注释 + 交付说明里。

## 关键文件与现状锚点（供参考，dev 自行核实行号）
- `lib/ziwei/sihua.ts`：getSiHuaByStem L18 / getDaXianSiHua L49（依赖 dxPalace.stem，palace.stem 由 algorithm.ts:77 iztro heavenlyStem 填充 ✅）/ getLiuNianSiHua L66 / 五虎遁 L84
- `lib/ziwei/algorithm.ts`：daXians 生成 L149-157（**当前不填 stemIndex/siHua**，types.ts DaXian L68-76 字段为可选——本次允许恢复填充供飞布使用，或飞布时现算，二选一，倾向恢复填充并保持向后兼容）
- `lib/prompt.ts`：buildSystemPrompt L9 / buildChartContext L30（当前只注"今年"流年 L38-40）
- `app/api/interpret/route.ts`：POST L80 / buildChartContext 调用处（自己找）
- `components/InsightPanel.tsx`：TOPICS L36-51 / generateAnalysis 请求（自己找）/ SSE 消费 L775-782 附近 / AI 对话 L814-878
- `components/TimeNav.tsx`：四化说明行 L155-176（SIHUA_COLORS L43-48）
- `components/SanFangOverlay.tsx`：DOM 坐标 overlay 参考实现
- `app/chart/page.tsx`：view/liunianYear/activeDaXianIndex 状态 L36-46、TimeNav L261-267、InsightPanel L312-317
- 梳理文档：`docs/analysis/02-AI后端与运营层.md`、`docs/analysis/03-前端页面与组件.md`

## 交付要求
1. 代码改动 + **自测通过**：`npx tsc --noEmit` exit 0；四化飞布纯函数用 node 脚本实测若干已知案例（如某命盘 甲干大限 → 廉贞化禄落宫断言）。
2. 若环境无 API key 无法真跑 SSE，需至少本地 `npm run dev` 起服务验证页面可渲染、切换大限/流年时运限入口出现、点击后请求体正确（可用 mock/console 验证到网络层）。
3. 测试日志落盘 `logs/test-run.txt` 并回传路径。
4. 中文汇报：改动文件清单 + git diff --stat + 自测结果（真实 exit code）+ 关键设计决策（尤其 C 的调研结论）。
5. commit 遵循 conventional format，小步提交（feat/fix/refactor 分开）。

## 禁止事项
- 不改本命盘格局/解读逻辑、不动 freemium 闸门与 402 结构、不删现有 TOPICS。
- 不引入状态管理库、不重写 InsightPanel 整体结构、不改 localStorage 历史结构。
- 不在本命 prompt 混入飞星口径（分层清晰）。
- 保持中文 UI 文案。
