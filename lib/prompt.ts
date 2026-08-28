import { BRANCHES } from '@/lib/ziwei/constants';
import { getLiuNianSiHua } from '@/lib/ziwei/sihua';
import type { ZiweiChart } from '@/lib/ziwei/types';

/**
 * 系统提示（倪海厦《天纪》南派三合派立场）
 * 动态注入当前日期：模型训练数据截止 2025，不知道"今年"是 2026，必须显式告知
 */
export function buildSystemPrompt(): string {
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

/**
 * chart → 结构化上下文（喂给 LLM）
 * 必须携带阳历生日+时辰+性别，iztro 官方模型才能跑 iztro-mingpan
 */
export function buildChartContext(chart: ZiweiChart): string {
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

  return lines.join('\n');
}
