import { BRANCHES } from '@/lib/ziwei/constants';
import { getLiuNianSiHua } from '@/lib/ziwei/sihua';
import { getDaXianFeiBu, getLiuNianFeiBu } from '@/lib/ziwei/limit';
import type { ZiweiChart } from '@/lib/ziwei/types';

/** 运限视图（与 components/TimeNav TimeView 同构；prompt 层为服务端共用，避免反向 import 组件） */
export type ChartContextView = 'mingpan' | 'daxian' | 'liunian';

/** buildChartContext 的可选运限参数（缺省 = 本命视角，行为与旧签名完全一致） */
export interface ChartContextOpts {
  view?: ChartContextView;
  /** view='daxian' 时：chart.daXians[daXianIndex]（-1 或缺省 = currentDaXianIndex） */
  daXianIndex?: number;
  /** view='liunian' 时：流年年份（缺省 = 今年） */
  liunianYear?: number;
}

/** 落宫 → 领域提示词（宫职重叠，四化飞星技法惯用语） */
const PALACE_THEME: Record<string, string> = {
  命宫: '自我与人生整体',
  兄弟宫: '兄弟/合伙/平辈',
  夫妻宫: '感情婚姻',
  子女宫: '子女/下属/桃花晚辈',
  财帛宫: '求财方式与钱财流动',
  疾厄宫: '健康与身体',
  迁移宫: '外出发展与人际舞台',
  交友宫: '朋友交际与助力',
  仆役宫: '朋友交际与助力',
  官禄宫: '事业成就',
  田宅宫: '家宅不动产与财库',
  福德宫: '精神享受与福分',
  父母宫: '父母长辈与文书',
};

function themeOf(palaceName: string): string {
  return PALACE_THEME[palaceName] ?? palaceName;
}

/**
 * 系统提示（倪海厦《天纪》南派三合派立场 + 大限/流年飞星技法分层口径）
 * 动态注入当前日期：模型训练数据截止 2025，不知道"今年"是 2026，必须显式告知
 *
 * 分层口径（2026-09-07 运限解读增强）：
 *   本命层 = 倪师三合派（四化固定、禁宫干自化/来因宫）；
 *   大限/流年层 = 四化飞星技法（大限宫干/流年天干四化飞布落宫断引动）。
 *   两口径只在各自上下文出现，不在本命盘混入飞星表述。
 */
export function buildSystemPrompt(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return `你是资深紫微斗数命理师，精通倪海厦《天纪》体系（南派三合派），同时掌握四化飞星技法用于大限/流年动态层。

【当前时间】今天是 ${year}年${month}月${day}日。用户问题中的"今年""今年运势"均指 ${year} 年，请以 ${year} 年的流年为基准解读，不要使用更早的年份。

解读原则：
1. 本命盘（命格/性格/本命各宫格局）：以倪海厦《天纪》三合派为准——本命四化（生年干所化）固定不动，不使用宫干自化、来因宫等飞星派工具；结合十二宫星曜、亮度（庙旺利陷）、四化（禄权科忌）、三方四正、当前大限、当前流年进行解读。
2. 大限/流年（运限层，仅当上下文提供"=== 所选运限 ==="段时启用）：按四化飞星技法断引动——以大限宫干/流年天干所化的禄权科忌四星「飞布」落宫为线索（落宫 = 该运限被引动的本命宫位领域），结合落宫宫职与三方四正解读；四化飞布与宫职重叠信息以命盘上下文所列为准，不要自行推算。化忌落宫为该大限/该流年的重点课题，须重点说明。
3. 输出使用【小标题】分段（如【命格定性】【主星解读】【三方四正】【当前大限】【实际建议】），每段 2-4 句话，语气专业、通俗、有条理。
4. 定位为传统文化与自我认知参考：不承诺具体预测结果，不涉及封建迷信或恐吓性表述，涉及健康问题建议就医。
5. 引用倪师观点或古籍（《紫微斗数全集》《骨髓赋》《天纪》讲义）时注明出处。`;
}

/** 将「四化飞布落宫」逐条序列化为文本行 */
function feiBuLines(
  landings: { siHua: string; starName: string; branch: number; palaceName: string }[],
): string[] {
  return landings.map(l => {
    const mark = l.siHua === '忌' ? '　★化忌落宫 = 该运限重点课题' : '';
    return `- ${l.starName}化${l.siHua} → ${l.palaceName}（${BRANCHES[l.branch] ?? ''}）${mark}`;
  });
}

/**
 * chart → 结构化上下文（喂给 LLM）
 * 必须携带阳历生日+时辰+性别，iztro 官方模型才能跑 iztro-mingpan
 *
 * opts.view 非 mingpan 时在末尾追加「=== 所选运限 ===」段：
 *   大限 → 大限命宫/宫干支/年龄区间/宫职重叠/大限四化四星/每化飞布落宫；
 *   流年 → 流年干支/流年命宫落本命哪宫/流年四化四星/飞布落宫。
 */
export function buildChartContext(chart: ZiweiChart, opts: ChartContextOpts = {}): string {
  const g = chart.birthInfo.gender === 'male' ? '男' : '女';
  const bi = chart.birthInfo;
  const lines: string[] = [];
  const clock = bi.hour * 2;
  lines.push(`阳历生日：${bi.year}-${String(bi.month).padStart(2, '0')}-${String(bi.day).padStart(2, '0')}，${g}，出生时辰：${BRANCHES[bi.hour]}时（约 ${String(clock).padStart(2, '0')}:00）`);
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

  // ── 所选运限上下文（运限解读增强；本命视角不追加）──
  const view = opts.view ?? 'mingpan';
  if (view === 'daxian') {
    const dxIdx = (opts.daXianIndex ?? -1) >= 0 ? opts.daXianIndex! : chart.currentDaXianIndex;
    const f = getDaXianFeiBu(chart, dxIdx);
    if (f) {
      lines.push('');
      lines.push('=== 所选运限（大限） ===');
      lines.push(
        `所选大限：第${dxIdx + 1}步大限，命宫落本命${f.nativePalaceName}（${f.ganZhi}），${f.startAge}-${f.endAge}岁。` +
        `宫职重叠：大限命宫叠于本命${f.nativePalaceName}，此十年主题围绕「${themeOf(f.nativePalaceName)}」展开。`,
      );
      lines.push(
        `大限四化（${f.ganZhi[0]}干）：${f.transforms.禄}化禄、${f.transforms.权}化权、${f.transforms.科}化科、${f.transforms.忌}化忌`,
      );
      lines.push('大限四化飞布落宫：');
      lines.push(...feiBuLines(f.landings));
    }
  } else if (view === 'liunian') {
    const yearSel = opts.liunianYear ?? year;
    const f = getLiuNianFeiBu(chart, yearSel);
    if (f) {
      lines.push('');
      lines.push('=== 所选运限（流年） ===');
      lines.push(
        `所选流年：${f.year}年（${f.ganZhi}年），流年命宫落本命${f.nativePalaceName}。` +
        `宫职重叠：此年主题围绕「${themeOf(f.nativePalaceName)}」展开。`,
      );
      lines.push(
        `流年四化（${f.ganZhi[0]}干）：${f.transforms.禄}化禄、${f.transforms.权}化权、${f.transforms.科}化科、${f.transforms.忌}化忌`,
      );
      lines.push('流年四化飞布落宫：');
      lines.push(...feiBuLines(f.landings));
    }
  }

  return lines.join('\n');
}
