/**
 * 运限四化飞布工具（飞星派技法 · 仅用于大限/流年解读层）
 *
 * 分层口径（与任务书 task-daxian-liunian.md 一致）：
 *   - 本命层（mingpan）：维持倪师《天纪》三合派——四化固定不动，本文件不参与；
 *   - 大限层（daxian）：大限宫干四化（大限命宫 = chart.daXians[idx].palaceBranch，
 *     宫干 = 该宫 palace.stem，已由 iztro heavenlyStem 填充，见 algorithm.ts）；
 *   - 流年层（liunian）：流年天干四化（三合太岁口径：流年命宫 = 流年地支宫）。
 *
 * 四化飞布：由运限天干化出的禄/权/科/忌四颗星（皆为主星/吉星，必在本命 12 宫之一），
 * 各自落在本命盘的宫位 = 该运限被「引动」的宫位领域（如甲干廉贞化禄 → 廉贞若在
 * 本命夫妻宫，则该大限夫妻宫事被引动）。
 *
 * 本文件全部为纯函数，可直接用 node --experimental-strip-types / tsc 单测（见 logs/test-run.txt）。
 */

import type { Palace, SiHua, ZiweiChart } from './types';
import { BRANCHES } from './constants';
import { getDaXianSiHua, getLiuNianSiHua, getYearBranchIndex } from './sihua';

/** 单颗四化星的飞布落宫信息 */
export interface FeiBuLanding {
  /** 禄/权/科/忌 */
  siHua: SiHua;
  /** 被化的星名（如「廉贞」） */
  starName: string;
  /** 落宫地支索引 0-11；四化星不在本命盘（理论不发生）时为 -1 */
  branch: number;
  /** 落宫（本命宫职）名，如「财帛宫」；未找到时为空串 */
  palaceName: string;
}

export interface DaXianFeiBu {
  dxIndex: number;
  /** 大限命宫地支索引（= chart.daXians[dxIndex].palaceBranch） */
  palaceBranch: number;
  /** 大限命宫干支，如「甲申」 */
  ganZhi: string;
  /** 大限命宫落在本命哪一宫（宫职重叠），如「财帛宫」 */
  nativePalaceName: string;
  startAge: number;
  endAge: number;
  /** 大限宫干四化四星 */
  transforms: Record<SiHua, string>;
  /** 四化飞布（4 条，序固定：禄/权/科/忌） */
  landings: FeiBuLanding[];
}

export interface LiuNianFeiBu {
  /** 流年年份 */
  year: number;
  /** 流年干支，如「丙午」 */
  ganZhi: string;
  /** 流年命宫地支索引（= 流年地支宫） */
  palaceBranch: number;
  /** 流年命宫落在本命哪一宫（宫职重叠），如「迁移宫」 */
  nativePalaceName: string;
  /** 流年天干四化四星 */
  transforms: Record<SiHua, string>;
  /** 四化飞布（4 条，序固定：禄/权/科/忌） */
  landings: FeiBuLanding[];
}

const SIHUA_ORDER: SiHua[] = ['禄', '权', '科', '忌'];

/** 按地支索引查本命宫位 */
export function findPalaceByBranch(chart: ZiweiChart, branch: number): Palace | undefined {
  return chart.palaces.find(p => p.branch === branch);
}

/** 宫名归一：iztro 仅命宫 name 带「宫」后缀，其余为裸名（父母/福德…），统一补「宫」 */
export function palaceFullName(name: string): string {
  if (!name) return name;
  return name.endsWith('宫') ? name : `${name}宫`;
}

/**
 * 核心纯函数：把某运限天干的四化四星「飞布」到本命 12 宫。
 * @param transforms 禄/权/科/忌 → 星名（sihua.ts getSiHuaByStem 等产出）
 * @returns 4 条落宫结果（序 = 禄权科忌）；四化星理论上皆是主星/吉星必在盘上，找不到则 branch=-1
 */
export function computeFeiBu(
  chart: ZiweiChart,
  transforms: Record<SiHua, string>,
): FeiBuLanding[] {
  return SIHUA_ORDER.map(siHua => {
    const starName = transforms[siHua];
    const palace = starName
      ? chart.palaces.find(p => p.stars.some(s => s.name === starName))
      : undefined;
    return {
      siHua,
      starName,
      branch: palace ? palace.branch : -1,
      palaceName: palace ? palaceFullName(palace.name) : '',
    };
  });
}

/** 按落宫地支聚合（供盘面 overlay 用）：branch → 该宫承接的化 */
export function groupFeiBuByBranch(landings: FeiBuLanding[]): Record<number, FeiBuLanding[]> {
  const by: Record<number, FeiBuLanding[]> = {};
  for (const l of landings) {
    if (l.branch < 0) continue;
    (by[l.branch] ??= []).push(l);
  }
  return by;
}

/**
 * 大限四化飞布全量信息。
 * @param chart 命盘
 * @param dxIndex 大限索引（chart.daXians[dxIndex]）
 * @returns null = 大限索引非法
 */
export function getDaXianFeiBu(chart: ZiweiChart, dxIndex: number): DaXianFeiBu | null {
  const dx = chart.daXians[dxIndex];
  if (!dx) return null;
  const sh = getDaXianSiHua(chart, dxIndex); // 大限宫干四化（含 stemIndex/stemName/transforms）
  if (!sh) return null;
  const landings = computeFeiBu(chart, sh.transforms);
  const palace = findPalaceByBranch(chart, dx.palaceBranch);
  return {
    dxIndex,
    palaceBranch: dx.palaceBranch,
    ganZhi: `${sh.stemName}${BRANCHES[dx.palaceBranch] ?? ''}`,
    nativePalaceName: palace ? palaceFullName(palace.name) : '（未知宫位）',
    startAge: dx.startAge,
    endAge: dx.endAge,
    transforms: sh.transforms,
    landings,
  };
}

/**
 * 流年四化飞布全量信息（流年命宫 = 流年地支宫，三合太岁口径，与 SanFangOverlay 一致）。
 */
export function getLiuNianFeiBu(chart: ZiweiChart, year: number): LiuNianFeiBu | null {
  if (!Number.isFinite(year)) return null;
  const sh = getLiuNianSiHua(year);
  const branch = getYearBranchIndex(year); // 流年地支索引（= 流年命宫地支，三合太岁口径）
  const palace = findPalaceByBranch(chart, branch);
  const landings = computeFeiBu(chart, sh.transforms);
  return {
    year,
    ganZhi: `${sh.stemName}${BRANCHES[branch] ?? ''}`,
    palaceBranch: branch,
    nativePalaceName: palace ? palaceFullName(palace.name) : '（未知宫位）',
    transforms: sh.transforms,
    landings,
  };
}
