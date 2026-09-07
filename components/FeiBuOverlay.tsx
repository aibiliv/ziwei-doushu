'use client';
// 四化飞布角标 Overlay（叠在 Iztrolabe 之上）
// 依据任务书 C 项：react-iztro 的 horoscopeDate 只切换中宫信息/流曜，不渲染所选运限的
// 「大限宫干/流年天干四化飞布落宫」标注（其 .iztro-star-mutagen 徽章需手动勾选且是宫头自化，
// 默认关闭、与本命徽章同色系无法区分）→ 仿 SanFangOverlay 从 DOM 实测宫位坐标，自绘角标。
//
// 显示规则：大限视图 → 所选大限（activeDaXianIndex>=0 ? 之 : currentDaXianIndex）的四化飞布；
//           流年视图 → 所选流年（liunianYear）的四化飞布；本命视图 → 不显示。
// 角标颜色与 TimeNav SIHUA_COLORS 一致：禄绿 / 权蓝 / 科黄 / 忌红。
import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { type TimeView } from './TimeNav';
import { getDaXianFeiBu, getLiuNianFeiBu, groupFeiBuByBranch, type FeiBuLanding } from '@/lib/ziwei/limit';

interface FeiBuOverlayProps {
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

const SIHUA_COLOR: Record<string, string> = {
  '禄': '#4ade80',
  '权': '#60a5fa',
  '科': '#facc15',
  '忌': '#f87171',
};
const SIHUA_ORDER: FeiBuLanding['siHua'][] = ['禄', '权', '科', '忌'];

export default function FeiBuOverlay({
  shellRef,
  chart,
  view,
  liunianYear,
  activeDaXianIndex,
}: FeiBuOverlayProps) {
  const [geo, setGeo] = useState<{ w: number; h: number; pts: Record<number, Pt> } | null>(null);

  // 当前视图的飞布落宫分组（branch → 该宫承接的化）——本命视图为空
  const marks = useMemo(() => {
    if (view === 'daxian') {
      const dxIdx = activeDaXianIndex >= 0 ? activeDaXianIndex : chart.currentDaXianIndex;
      const f = getDaXianFeiBu(chart, dxIdx);
      return f ? groupFeiBuByBranch(f.landings) : {};
    }
    if (view === 'liunian') {
      const f = getLiuNianFeiBu(chart, liunianYear);
      return f ? groupFeiBuByBranch(f.landings) : {};
    }
    return {};
  }, [chart, view, liunianYear, activeDaXianIndex]);

  // 从盘面 DOM 实测 12 宫坐标（与 SanFangOverlay 同法：gridArea 序号 ↔ chart.palaces 一一对应）
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const compute = () => {
      const shellRect = shell.getBoundingClientRect();
      const pts: Record<number, Pt> = {};
      const els = Array.from(shell.querySelectorAll<HTMLElement>('.iztro-palace'));
      for (const el of els) {
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
      setGeo({ w: shellRect.width, h: shellRect.height, pts });
    };

    compute();
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

  const branchList = Object.keys(marks).map(Number).filter(b => geo?.pts[b]);
  if (!geo || branchList.length === 0 || view === 'mingpan') return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 28 }}>
      {branchList.map(branch => {
        const pt = geo.pts[branch];
        const landings = [...marks[branch]].sort(
          (a, b) => SIHUA_ORDER.indexOf(a.siHua) - SIHUA_ORDER.indexOf(b.siHua),
        );
        return (
          <div
            key={branch}
            title={landings.map(l => `${l.starName}化${l.siHua}`).join(' · ')}
            style={{
              position: 'absolute',
              left: pt.x - pt.w / 2 + 3,
              top: pt.y - pt.h / 2 + 3,
              display: 'flex',
              gap: 2.5,
              zIndex: 29,
            }}
          >
            {landings.map(l => (
              <span
                key={l.siHua}
                title={`${l.starName}化${l.siHua}`}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 2,
                  background: SIHUA_COLOR[l.siHua] ?? '#888',
                  boxShadow: '0 0 3px rgba(0,0,0,0.45)',
                  opacity: 0.92,
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
