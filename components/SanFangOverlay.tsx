'use client';
// 三方四正连线 + 焦点宫高亮（叠加在 Iztrolabe 之上）
// 从盘面 DOM 实时读取 12 宫真实坐标，不依赖固定百分比布局；
// 焦点宫随视图切换：本命→命宫 / 大限→大限命宫 / 流年→流年命宫。
import { useEffect, useState, type RefObject } from 'react';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { type TimeView, getYearZhiIndex } from './TimeNav';

interface SanFangOverlayProps {
  shellRef: RefObject<HTMLDivElement | null>;
  chart: ZiweiChart;
  view: TimeView;
  liunianYear: number;
  activeDaXianIndex: number; // -1 = 跟随 currentDaXianIndex
}

interface Pt {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 当前视图下的焦点地支索引（0-11） */
function getFocusBranch(
  chart: ZiweiChart,
  view: TimeView,
  liunianYear: number,
  activeDaXianIndex: number,
): number {
  const dxIdx = activeDaXianIndex >= 0 ? activeDaXianIndex : chart.currentDaXianIndex;
  if (view === 'daxian' && chart.daXians[dxIdx]) {
    return chart.daXians[dxIdx].palaceBranch;
  }
  if (view === 'liunian') {
    return getYearZhiIndex(liunianYear);
  }
  // 本命：命宫
  const mg = chart.palaces.find(p => p.name === '命宫');
  return mg ? mg.branch : 0;
}

export default function SanFangOverlay({
  shellRef,
  chart,
  view,
  liunianYear,
  activeDaXianIndex,
}: SanFangOverlayProps) {
  const [geo, setGeo] = useState<{ w: number; h: number; pts: Record<number, Pt>; focus: number } | null>(null);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const compute = () => {
      const shellRect = shell.getBoundingClientRect();
      const pts: Record<number, Pt> = {};
      const els = Array.from(shell.querySelectorAll<HTMLElement>('.iztro-palace'));
      for (const el of els) {
        // gridArea = "g{index}"，index 即 iztro 宫序，与 chart.palaces 一一对应
        const ga = (el.style.gridArea || '').replace(/[^0-9]/g, '');
        const idx = parseInt(ga, 10);
        const palace = Number.isNaN(idx) ? undefined : chart.palaces[idx];
        if (!palace) continue;
        const r = el.getBoundingClientRect();
        pts[palace.branch] = {
          x: r.left - shellRect.left + r.width / 2,
          y: r.top - shellRect.top + r.height / 2,
          w: r.width,
          h: r.height,
        };
      }
      const focus = getFocusBranch(chart, view, liunianYear, activeDaXianIndex);
      setGeo({ w: shellRect.width, h: shellRect.height, pts, focus });
    };

    compute();
    // 兜底：盘面首帧可能尚未渲染出 12 宫，重试几帧确保坐标到位
    const raf1 = requestAnimationFrame(compute);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(compute));
    const ro = new ResizeObserver(compute);
    ro.observe(shell);
    const astro = shell.querySelector('.iztro-astrolabe');
    if (astro) ro.observe(astro);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, [shellRef, chart, view, liunianYear, activeDaXianIndex]);

  if (!geo) return null;
  // 本命视图不显示三方四正（隐藏原本本命的连线，保持盘面干净）
  if (view === 'mingpan') return null;

  const p0 = geo.pts[geo.focus];
  if (!p0) return null;

  // 三方四正：本宫 + 对宫(+6) + 三合1(+4) + 三合2(+8)
  const sf = [
    geo.focus,
    (geo.focus + 6) % 12,
    (geo.focus + 4) % 12,
    (geo.focus + 8) % 12,
  ];
  const sfPts = sf.map(i => geo.pts[i]).filter(Boolean);
  if (sfPts.length < 4) return null;

  const GOLD = 'rgba(212,168,67,0.9)';
  const PURPLE = 'rgba(167,139,250,0.85)';
  const dash = '5,4';
  const ccx = geo.w / 2;
  const ccy = geo.h / 2;

  // 每个宫格取其「朝向盘心的边线中点」作为连线落点（点不放在格中间，落在边上）
  const anchor = (pt: Pt) => {
    const dx = ccx - pt.x;
    const dy = ccy - pt.y;
    const tx = dx !== 0 ? (pt.w / 2) / Math.abs(dx) : Infinity;
    const ty = dy !== 0 ? (pt.h / 2) / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    return { x: pt.x + dx * t, y: pt.y + dy * t };
  };
  const A = sf.map(i => anchor(geo.pts[i])); // A[0]本宫 A[1]对宫 A[2]三合1 A[3]三合2

  return (
    <svg
      width={geo.w}
      height={geo.h}
      viewBox={`0 0 ${geo.w} ${geo.h}`}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}
    >
      {/* 对宫直线：本宫 ↔ 对宫（穿过中宫） */}
      <line x1={A[0].x} y1={A[0].y} x2={A[1].x} y2={A[1].y} stroke={GOLD} strokeWidth={1.5} strokeDasharray={dash} strokeLinecap="round" />
      {/* 三合三角形 */}
      <line x1={A[0].x} y1={A[0].y} x2={A[2].x} y2={A[2].y} stroke={GOLD} strokeWidth={1.5} strokeDasharray={dash} strokeLinecap="round" />
      <line x1={A[2].x} y1={A[2].y} x2={A[3].x} y2={A[3].y} stroke={GOLD} strokeWidth={1.5} strokeDasharray={dash} strokeLinecap="round" />
      <line x1={A[3].x} y1={A[3].y} x2={A[0].x} y2={A[0].y} stroke={GOLD} strokeWidth={1.5} strokeDasharray={dash} strokeLinecap="round" />

      {/* 四宫高亮框：本宫金、其余紫 */}
      {sf.map((i, k) => {
        const pt = geo.pts[i];
        const isFocus = k === 0;
        return (
          <rect
            key={`r-${i}`}
            x={pt.x - pt.w / 2 + 2}
            y={pt.y - pt.h / 2 + 2}
            width={pt.w - 4}
            height={pt.h - 4}
            rx={6}
            fill="none"
            stroke={isFocus ? GOLD : PURPLE}
            strokeWidth={isFocus ? 2.5 : 1.5}
            opacity={isFocus ? 1 : 0.7}
          />
        );
      })}

      {/* 边点标记：落在宫格朝向盘心的边线上，而非格中间 */}
      {A.map((a, k) => (
        <circle key={`c-${sf[k]}`} cx={a.x} cy={a.y} r={3} fill={k === 0 ? GOLD : PURPLE} />
      ))}
    </svg>
  );
}
