// 5 维雷达图数据计算：按官方 5 维（事业/财运/感情/性格/健康 + 综合）从本盘主星庙旺与格局推算
// 评分规则：bright（庙旺）= 90，normal（平和）= 60，dim（落陷）= 40；空宫借对宫主星
import type { Palace, Star, ZiweiChart } from './types';

export type RadarDimensionKey = 'career' | 'wealth' | 'love' | 'personality' | 'health';

export interface RadarDimension {
  key: RadarDimensionKey;
  label: string;        // 事业
  palaceName: string;   // 官禄宫
  starName: string;     // 太阴
  brightness: 'bright' | 'normal' | 'dim' | undefined;  // 主星最亮的一颗
  score: number;        // 0-100
  reasoning: string;    // 取值理由
}

export interface RadarData {
  dimensions: RadarDimension[];
  overall: number;      // 综合 = 5 维均值
  hasLocked: boolean;   // 是否有 LOCKED 维度（一般是 false）
}

/** 取本宫主星中最亮的那颗；空宫借对宫主星 */
function bestMajorStar(palace: Palace, chart: ZiweiChart): Star | null {
  let majors = palace.stars.filter(s => s.type === 'major');
  let source: '本宫' | '借对宫' = '本宫';
  if (majors.length === 0) {
    const opposite = chart.palaces[(palace.branch + 6) % 12];
    if (opposite) {
      majors = opposite.stars.filter(s => s.type === 'major');
      source = '借对宫';
    }
  }
  if (majors.length === 0) return null;
  const rank: Record<string, number> = { bright: 3, normal: 2, dim: 1 };
  return majors.reduce((best, s) => {
    const b = s.brightness ? rank[s.brightness] ?? 0 : 0;
    const bestB = best.brightness ? rank[best.brightness] ?? 0 : 0;
    return b > bestB ? s : best;
  });
}

function brightnessToScore(b: 'bright' | 'normal' | 'dim' | undefined): number {
  if (b === 'bright') return 90;
  if (b === 'dim') return 40;
  if (b === 'normal') return 60;
  return 60; // 缺省平和
}

function brightnessLabel(b: 'bright' | 'normal' | 'dim' | undefined): string {
  if (b === 'bright') return '庙旺';
  if (b === 'dim') return '落陷';
  if (b === 'normal') return '平和';
  return '平和';
}

// 注意：generateChart 的宫名无"宫"后缀（官禄/财帛/夫妻/疾厄，唯命宫带后缀），
// 查表必须用实际宫名；展示时统一补"宫"（命宫除外）
const PALACE_NAME_MAP: Record<RadarDimensionKey, string> = {
  career: '官禄',
  wealth: '财帛',
  love: '夫妻',
  personality: '命宫',
  health: '疾厄',
};

function displayPalaceName(name: string): string {
  return name.endsWith('宫') ? name : `${name}宫`;
}

const LABEL_MAP: Record<RadarDimensionKey, string> = {
  career: '事业',
  wealth: '财运',
  love: '感情',
  personality: '性格',
  health: '健康',
};

export function computeRadar(chart: ZiweiChart): RadarData {
  const dimensions: RadarDimension[] = (Object.keys(PALACE_NAME_MAP) as RadarDimensionKey[]).map(key => {
    const palaceName = PALACE_NAME_MAP[key];
    const palace = chart.palaces.find(p => p.name === palaceName);
    if (!palace) {
      return {
        key,
        label: LABEL_MAP[key],
        palaceName: displayPalaceName(palaceName),
        starName: '—',
        brightness: undefined,
        score: 60,
        reasoning: '宫位未找到',
      };
    }
    const best = bestMajorStar(palace, chart);
    const isBorrowed = palace.stars.filter(s => s.type === 'major').length === 0;
    return {
      key,
      label: LABEL_MAP[key],
      palaceName: displayPalaceName(palaceName),
      starName: best?.name ?? (isBorrowed ? '空宫借对宫' : '—'),
      brightness: best?.brightness,
      score: brightnessToScore(best?.brightness),
      reasoning: best
        ? `${best.name}${isBorrowed ? '(借对宫)' : ''} ${brightnessLabel(best.brightness)}`
        : '无主星',
    };
  });
  const overall = Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length);
  return { dimensions, overall, hasLocked: false };
}
