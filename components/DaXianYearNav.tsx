'use client';
// 大限 + 流年 快捷切换列表（抽离自 ChartBoard，独立组件供 page.tsx 与 Iztrolabe 并列渲染）
// 大限 12 卡片；流年 10 卡片（= 当前选中大限的 10 个公历年，随大限联动）
import type { ZiweiChart } from '@/lib/ziwei/types';
import { type TimeView, getYearGanZhi } from './TimeNav';

interface DaXianYearNavProps {
  chart: ZiweiChart;
  /** 当前视图（决定哪些卡片高亮） */
  view: TimeView;
  /** 当前流年选年 */
  liunianYear: number;
  /** 用户临时选定的大限索引（点大限卡片时更新；-1 表示跟随 currentDaXianIndex） */
  activeDaXianIndex: number;
  /** 切换 TimeView（点大限/流年卡片） */
  onViewChange: (view: TimeView) => void;
  /** 切换流年选年 */
  onYearChange: (year: number) => void;
  /** 切换大限索引（点大限卡片时调用） */
  onDaXianChange: (index: number) => void;
}

/** 由公历年反推其所属大限索引（虚岁 startAge 对应公历年 = 出生年 + startAge - 1） */
function decadeIndexOfYear(chart: ZiweiChart, year: number): number {
  for (let i = 0; i < chart.daXians.length; i++) {
    const dx = chart.daXians[i];
    const startYear = chart.birthInfo.year + dx.startAge - 1;
    const endYear = chart.birthInfo.year + dx.endAge - 1;
    if (year >= startYear && year <= endYear) return i;
  }
  return chart.currentDaXianIndex;
}

export default function DaXianYearNav({
  chart, view, liunianYear, activeDaXianIndex,
  onViewChange, onYearChange, onDaXianChange,
}: DaXianYearNavProps) {
  // 当前「锚定」的大限：大限视图下用点选索引，否则用 liunianYear 所属大限
  const activeDecadeIdx =
    view === 'daxian' && activeDaXianIndex >= 0
      ? activeDaXianIndex
      : decadeIndexOfYear(chart, liunianYear);
  const activeDx = chart.daXians[activeDecadeIdx];
  // 流年：锚定大限的 10 个公历年（虚岁 startAge 起算）
  const decadeStartYear = chart.birthInfo.year + activeDx.startAge - 1;
  const yearCards = Array.from({ length: 10 }, (_, i) => decadeStartYear + i);

  return (
    <div className="mt-3 space-y-2">
      {/* ── 大限行（12 卡片）── */}
      <div>
        <div className="text-[9px] tracking-wider mb-1 px-1" style={{ color: 'var(--t-faint)' }}>
          大限 · 点击切换（流年随所选大限联动）
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))' }}>
          {chart.daXians.map((dx, idx) => {
            const isActive = view === 'daxian' && idx === activeDaXianIndex;
            const isNatural = idx === chart.currentDaXianIndex;
            return (
              <button
                key={idx}
                onClick={() => {
                  onDaXianChange(idx);
                  onViewChange('daxian');
                }}
                className="rounded-md px-2 py-2 text-center transition-all hover:scale-[1.03]"
                style={{
                  background: isActive
                    ? 'rgba(212,168,67,0.20)'
                    : isNatural
                      ? 'rgba(147,51,234,0.10)'
                      : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${
                    isActive
                      ? 'rgba(212,168,67,0.55)'
                      : isNatural
                        ? 'rgba(147,51,234,0.4)'
                        : 'var(--t-border)'
                  }`,
                }}
                title={`${dx.startAge}-${dx.endAge}岁 · ${dx.palaceName} 大限`}
              >
                <div
                  className="text-[10px] font-medium tabular-nums leading-tight"
                  style={{
                    color: isActive
                      ? 'var(--t-gold)'
                      : isNatural
                        ? 'rgb(167,139,250)'
                        : 'var(--t-text2)',
                  }}
                >
                  {dx.startAge}–{dx.endAge}岁
                </div>
                <div
                  className="text-[9px] mt-0.5 leading-tight"
                  style={{
                    color: isActive ? 'var(--t-gold)' : 'var(--t-text2)',
                    opacity: isActive ? 0.95 : 0.7,
                  }}
                >
                  {dx.palaceName}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 流年行（锚定大限的 10 年）── */}
      <div>
        <div className="text-[9px] tracking-wider mb-1 px-1" style={{ color: 'var(--t-faint)' }}>
          流年 · {activeDx.startAge}–{activeDx.endAge}岁大限的 10 年
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${yearCards.length}, minmax(0, 1fr))` }}>
          {yearCards.map(y => {
            const isCurrent = y === liunianYear;
            return (
              <button
                key={y}
                onClick={() => {
                  onYearChange(y);
                  onViewChange('liunian');
                }}
                className="rounded-md px-1 py-2 text-center transition-all hover:scale-[1.03]"
                style={{
                  background: isCurrent
                    ? 'rgba(212,168,67,0.20)'
                    : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isCurrent ? 'rgba(212,168,67,0.55)' : 'var(--t-border)'}`,
                }}
                title={`${y}年 ${getYearGanZhi(y)}`}
              >
                <div
                  className="text-[10px] font-medium tabular-nums leading-tight"
                  style={{ color: isCurrent ? 'var(--t-gold)' : 'var(--t-text2)' }}
                >
                  {y}
                </div>
                <div
                  className="text-[8px] mt-0.5 leading-tight"
                  style={{
                    color: isCurrent ? 'var(--t-gold)' : 'var(--t-faint)',
                    opacity: isCurrent ? 0.95 : 0.7,
                  }}
                >
                  {getYearGanZhi(y)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
