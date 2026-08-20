'use client';
import { useMemo, useState, type MouseEvent } from 'react';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import InsightPanel from '@/components/InsightPanel';
import TimeNav, { type TimeView } from '@/components/TimeNav';
import PatternsCard from '@/components/PatternsCard';
import StarDetailPanel from '@/components/StarDetailPanel';
import { generateChart } from '@/lib/ziwei/algorithm';
import { useHistory } from '@/lib/ziwei/history';
import { formToBirthInfo } from '@/lib/ziwei/share';
import type { BirthInfo, Palace, Star, ZiweiChart } from '@/lib/ziwei/types';
import { Iztrolabe } from 'react-iztro';
import 'react-iztro/lib/Iztrolabe/Iztrolabe.css';
import 'react-iztro/lib/Izpalace/Izpalace.css';
import 'react-iztro/lib/IzpalaceCenter/IzpalaceCenter.css';
import 'react-iztro/lib/theme/default.css';

/**
 * 命盘页 —— P1 升级版（组装孤儿功能）
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
 *
 * 孤儿功能组装（上游开源时被裁剪但组件仍在仓库）：
 *   - PatternsCard    格局识别卡片（detectPatterns，严格古书条件）
 *   - StarDetailPanel 星曜详情（点击盘面星曜弹出）
 *   - useHistory      命盘历史（localStorage 最多 10 条，表单页回载）
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
  const [selectedStar, setSelectedStar] = useState<Star | null>(null);
  const [formKey, setFormKey] = useState(0);
  const { history, save: saveHistory, remove: removeHistory } = useHistory();

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

  // 表单提交 → 排盘
  const handleSubmit = (info: BirthInfo) => {
    setChart(generateChart(info));
    setView('mingpan');
    setSelectedPalace(null);
    setSelectedSiHua(null);
    setSelectedStar(null);
  };

  // 历史回载 → 重新起盘（防御：关键字段不齐全的历史直接忽略，避免 bySolar 收到非法日期）
  const handleLoadHistory = (form: BirthFormState) => {
    const y = parseInt(form.year);
    const m = parseInt(form.month);
    const d = parseInt(form.day);
    if (!y || !m || !d || !form.gender) return;
    setFormKey(k => k + 1);
    handleSubmit(formToBirthInfo(form));
  };

  // ── 未起盘：展示出生信息表单 + 历史命盘 ──
  if (!chart) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>紫微斗数排盘</h1>
        <p style={{ color: '#888', marginBottom: 32, fontSize: 14, lineHeight: 1.7 }}>
          输入出生年月日时，即时生成命盘。
        </p>
        <BirthForm
          key={formKey}
          onSubmit={handleSubmit}
          // 只在关键字段齐全时才写入历史（BirthForm 每次表单变化都会触发 onFormSave，
          // 不加这道闸会把残缺表单存进 localStorage，回载时 bySolar 收到非法日期）
          onFormSave={(form) => {
            if (form.year && form.month && form.day && form.gender) {
              saveHistory(form);
            }
          }}
        />

        {/* 历史命盘 */}
        {history.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11, letterSpacing: '0.2em',
              color: '#999', marginBottom: 12,
            }}>
              历史命盘
              <span style={{ flex: 1, height: 1, background: 'var(--t-border)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map(entry => (
                <div
                  key={entry.id}
                  onClick={() => handleLoadHistory(entry.form)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', cursor: 'pointer',
                    background: 'var(--t-card)',
                    border: '1px solid var(--t-border)',
                    borderRadius: 10,
                    fontSize: 12, color: 'var(--t-text2)',
                  }}
                >
                  <span style={{ color: 'var(--t-gold)', opacity: 0.5 }}>☯</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.label}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); removeHistory(entry.id); }}
                    style={{ color: '#999', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    );
  }

  const { year, month, day, hour, gender } = chart.birthInfo;

  // 事件委托：四化徽章 → 飞化分析；星曜 → 星曜详情；宫位 → 宫位解读
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

    // 2) 主星（.iztro-star，type=major）→ 星曜详情（优先于宫位解读）
    const starEl = target.closest('.iztro-star');
    if (starEl) {
      const starNameEl = starEl.querySelector('.star-with-mutagen');
      const starName = starNameEl?.textContent?.trim();
      if (starName) {
        const star = chart.palaces
          .flatMap(p => p.stars.map(s => ({ s, p })))
          .find(({ s }) => s.name === starName)?.s ?? null;
        // STAR_DETAIL 只覆盖 14 主星，辅星/煞星不拦截（落回宫位解读）
        if (star?.type === 'major') {
          setSelectedStar(star);
          return;
        }
      }
    }

    // 3) 宫位（.iztro-palace）→ 宫位解读
    const palaceEl = target.closest('.iztro-palace');
    if (palaceEl) {
      const nameEl = palaceEl.querySelector('.iztro-palace-name-wrapper');
      const palaceName = nameEl?.firstChild?.textContent?.trim();
      if (!palaceName) return;
      const palace = chart.palaces.find(p => p.name === palaceName);
      if (palace) setSelectedPalace(palace);
    }
  };

  // ── 已起盘：react-iztro 星盘 + 格局卡片 + AI 解读 ──
  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
      <button
        type="button"
        onClick={() => {
          setChart(null);
          setView('mingpan');
          setSelectedPalace(null);
          setSelectedSiHua(null);
          setSelectedStar(null);
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* 格局识别卡片（孤儿功能组装 1） */}
          <PatternsCard chart={chart} />

          <InsightPanel chart={chart} selectedPalace={selectedPalace} selectedSiHua={selectedSiHua} />
        </div>
      </div>

      {/* 星曜详情弹窗（孤儿功能组装 2，点击盘面主星弹出，居中遮罩） */}
      {selectedStar && (
        <div
          onClick={() => setSelectedStar(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(520px, 100%)', maxHeight: '85vh', overflowY: 'auto',
              borderRadius: 16,
            }}
          >
            <StarDetailPanel
              star={selectedStar}
              palaceName={chart.palaces.find(p =>
                p.stars.some(s => s.name === selectedStar.name)
              )?.name}
              onClose={() => setSelectedStar(null)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
