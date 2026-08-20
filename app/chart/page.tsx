'use client';
import { useMemo, useState, type MouseEvent } from 'react';
import BirthForm from '@/components/BirthForm';
import InsightPanel from '@/components/InsightPanel';
import TimeNav, { type TimeView } from '@/components/TimeNav';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, Palace, ZiweiChart } from '@/lib/ziwei/types';
import { Iztrolabe } from 'react-iztro';
import 'react-iztro/lib/Iztrolabe/Iztrolabe.css';
import 'react-iztro/lib/Izpalace/Izpalace.css';
import 'react-iztro/lib/IzpalaceCenter/IzpalaceCenter.css';
import 'react-iztro/lib/theme/default.css';

/**
 * 命盘页 —— P1 升级版
 *
 * 盘面：react-iztro 星盘组件（Iztrolabe，自包含排盘渲染 + 中宫运限控制）
 * 解读：InsightPanel（AI 流式解读，基于 generateChart 的倪师数据层）
 * 说明：两套排盘同源（iztro），口径一致（P0 已验证）；generateChart 仅供
 *       InsightPanel 组织 AI 上下文，Iztrolabe 内部自行排盘渲染。
 *
 * 运限：恢复顶部 TimeNav（本命/大限/流年切换 + 流年年份 +/-），
 *       选择结果通过 horoscopeDate 驱动 Iztrolabe 的运限日期；
 *       Iztrolabe 中宫按钮仍可在此基础上微调流月/流日/流时。
 *
 * 宫位/四化联动：Iztrolabe 未暴露宫位与四化点击回调，这里在容器上用事件
 *       委托捕获 .iztro-palace / .iztro-star-mutagen 的点击，按宫名/星名
 *       匹配 chart.palaces 后传给 InsightPanel，恢复「点击宫位 → AI 解读
 *       该宫」「点击四化徽章 → 飞化分析」的原交互。
 */
export default function ChartPage() {
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [view, setView] = useState<TimeView>('mingpan');
  const [liunianYear, setLiunianYear] = useState(() => new Date().getFullYear());
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [selectedSiHua, setSelectedSiHua] = useState<{
    starName: string;
    siHua: string;
    view: TimeView;
  } | null>(null);

  // TimeNav 视图 → Iztrolabe 运限日期（本命盘用当前时间，大限用大限起始年，流年用所选年份）
  const horoscopeDate = useMemo(() => {
    if (!chart) return undefined;
    if (view === 'liunian') {
      return new Date(liunianYear, 6, 15);
    }
    if (view === 'daxian') {
      const dx = chart.daXians[chart.currentDaXianIndex];
      if (dx) {
        // 虚岁 startAge 对应的公历年 = 出生年 + startAge - 1
        return new Date(chart.birthInfo.year + dx.startAge - 1, 6, 15);
      }
    }
    return undefined; // mingpan：Iztrolabe 默认当前时间
  }, [view, liunianYear, chart]);

  // ── 未起盘：展示出生信息表单 ──
  if (!chart) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>紫微斗数排盘</h1>
        <p style={{ color: '#888', marginBottom: 32, fontSize: 14, lineHeight: 1.7 }}>
          输入出生年月日时，即时生成命盘。
        </p>
        <BirthForm onSubmit={(info: BirthInfo) => setChart(generateChart(info))} />
      </main>
    );
  }

  const { year, month, day, hour, gender } = chart.birthInfo;

  // 事件委托：四化徽章点击 → 飞化分析；宫位点击 → 宫位解读
  const handleAstrolabeClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // 1) 四化徽章（.iztro-star-mutagen）→ 飞化分析
    const mutagenEl = target.closest('.iztro-star-mutagen');
    if (mutagenEl) {
      const starEl = mutagenEl.closest('.iztro-star');
      const starNameEl = starEl?.querySelector('.star-with-mutagen');
      const starName = starNameEl?.textContent?.trim();
      const siHua = mutagenEl.textContent?.trim();
      if (starName && siHua) {
        setSelectedSiHua({ starName, siHua, view });
        return;
      }
    }

    // 2) 宫位（.iztro-palace）→ 宫位解读
    const palaceEl = target.closest('.iztro-palace');
    if (palaceEl) {
      const nameEl = palaceEl.querySelector('.iztro-palace-name-wrapper');
      const palaceName = nameEl?.firstChild?.textContent?.trim();
      if (!palaceName) return;
      const palace = chart.palaces.find(p => p.name === palaceName);
      if (palace) setSelectedPalace(palace);
    }
  };

  // ── 已起盘：react-iztro 星盘 + AI 解读 ──
  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
      <button
        type="button"
        onClick={() => {
          setChart(null);
          setView('mingpan');
          setSelectedPalace(null);
          setSelectedSiHua(null);
        }}
        style={{
          marginBottom: 16, padding: '6px 14px', cursor: 'pointer',
          border: '1px solid #ccc', borderRadius: 8, background: 'transparent',
        }}
      >
        ← 重新起盘
      </button>

      {/* 运限切换（本命 / 大限 / 流年 + 流年年份） */}
      <TimeNav
        chart={chart}
        view={view}
        liunianYear={liunianYear}
        onViewChange={setView}
        onYearChange={setLiunianYear}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 380px)',
          gap: 20, marginTop: 16, alignItems: 'start',
        }}
      >
        <div className="iztro-theme-host" onClick={handleAstrolabeClick}>
          <Iztrolabe
            birthday={`${year}-${month}-${day}`}
            birthTime={hour}
            birthdayType="solar"
            gender={gender}
            lang="zh-CN"
            horoscopeDate={horoscopeDate}
            // 年柱按立春、月柱按节气（正统八字口径）；iztro 默认 normal 按春节/初一，节气边界日期会错位
            options={{ yearDivide: 'exact', horoscopeDivide: 'exact' }}
          />
        </div>
        <InsightPanel chart={chart} selectedPalace={selectedPalace} selectedSiHua={selectedSiHua} />
      </div>
    </main>
  );
}
