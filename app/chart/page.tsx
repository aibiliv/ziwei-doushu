'use client';
import '@/lib/ziwei/iztro-brightness'; // 修正 iztro 太阴酉宫亮度（不→旺），须在排盘前执行
import { useMemo, useRef, useState, type MouseEvent } from 'react';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import InsightPanel from '@/components/InsightPanel';
import TimeNav, { type TimeView } from '@/components/TimeNav';
import PatternsCard from '@/components/PatternsCard';
import StarDetailPanel from '@/components/StarDetailPanel';
import LangSelect, { getStoredLang, type ChartLang } from '@/components/LangSelect';
import { generateChart } from '@/lib/ziwei/algorithm';
import { useHistory, matchHistoryEntry, readStoredHistory, type HistoryInsights } from '@/lib/ziwei/history';
import { formToBirthInfo } from '@/lib/ziwei/share';
import type { BirthInfo, Palace, Star, ZiweiChart } from '@/lib/ziwei/types';
import { Iztrolabe } from 'react-iztro';
import 'react-iztro/lib/Iztrolabe/Iztrolabe.css';
import 'react-iztro/lib/Izpalace/Izpalace.css';
import 'react-iztro/lib/IzpalaceCenter/IzpalaceCenter.css';
import 'react-iztro/lib/theme/default.css';
import DaXianYearNav from '@/components/DaXianYearNav';
import SanFangOverlay from '@/components/SanFangOverlay';

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/**
 * 命盘页 —— 升级版（组装孤儿功能）
 *
 * 盘面：react-iztro 星盘组件（Iztrolabe，紫主题 theme-purple，自包含排盘渲染 + 中宫运限控制）
 * 解读：InsightPanel（AI 流式解读，基于 generateChart 的倪师数据层）
 *
 * 运限：顶部 TimeNav（本命/大限/流年切换 + 流年年份 +/-），
 *       选择结果通过 horoscopeDate 驱动 Iztrolabe 的运限日期。
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
  // 用户临时选定的大限（点底栏大限卡片时更新；-1 表示跟随 currentDaXianIndex）
  const [activeDaXianIndex, setActiveDaXianIndex] = useState<number>(-1);
  const [formKey, setFormKey] = useState(0);
  const [lang, setLang] = useState<ChartLang>(() => getStoredLang());
  // 解读 ↔ 历史绑定：当前命盘对应的历史条目 id 及其已存解读（回载时注入）
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [initialThreads, setInitialThreads] = useState<HistoryInsights | null>(null);
  const lastCompleteFormRef = useRef<BirthFormState | null>(null); // 提交时用于匹配历史条目
  const lastSavedInsightsRef = useRef(''); // 防重复写回：与上次已存内容相同则跳过
  const { history, save: saveHistory, remove: removeHistory, updateInsights } = useHistory();
  const shellRef = useRef<HTMLDivElement>(null); // 盘面容器（三方四正 overlay 锚点）

  const handleLangChange = (v: ChartLang) => {
    setLang(v);
    if (typeof window !== 'undefined') window.localStorage.setItem('ziwei-chart-lang', v);
  };

  // TimeNav 视图 → Iztrolabe 运限日期（本命盘用当前时间，大限用大限起始年，流年用所选年份）
  const horoscopeDate = useMemo(() => {
    if (!chart) return undefined;
    if (view === 'liunian') {
      return new Date(liunianYear, 6, 15);
    }
    if (view === 'daxian') {
      const dxIndex = activeDaXianIndex >= 0 ? activeDaXianIndex : chart.currentDaXianIndex;
      const dx = chart.daXians[dxIndex];
      if (dx) {
        // 虚岁 startAge 对应的公历年 = 出生年 + startAge - 1
        return new Date(chart.birthInfo.year + dx.startAge - 1, 6, 15);
      }
    }
    return undefined; // mingpan：Iztrolabe 默认当前时间
  }, [view, liunianYear, activeDaXianIndex, chart]);

  // 表单提交 → 排盘（同时写入/更新历史：只有点起盘才产生历史，填表过程不落库）
  const handleSubmit = (info: BirthInfo) => {
    // 用最近一次完整表单保存历史（同出生信息则复用 id/insights 并置顶，不同则新建）
    const form = lastCompleteFormRef.current;
    if (form) saveHistory(form);

    setChart(generateChart(info));
    setView('mingpan');
    setActiveDaXianIndex(-1);
    setSelectedPalace(null);
    setSelectedSiHua(null);
    setSelectedStar(null);

    // 匹配历史条目作为解读写回目标（真太阳时校正后 hour 可能变，须用原始 clockHour/Minute）。
    // 从 localStorage 读：saveHistory 同步写 localStorage、异步 setState，这里必须用最新值兜底
    const matched = form ? matchHistoryEntry(readStoredHistory(), form) : undefined;
    setActiveHistoryId(matched?.id ?? null);
    setInitialThreads(matched?.insights ?? null);
    lastSavedInsightsRef.current = JSON.stringify(matched?.insights ?? {});
  };

  // 历史回载 → 重新起盘（防御：关键字段不齐全的历史直接忽略，避免 bySolar 收到非法日期）
  const handleLoadHistory = (form: BirthFormState) => {
    const y = parseInt(form.year);
    const m = parseInt(form.month);
    const d = parseInt(form.day);
    if (!y || !m || !d || !form.gender) return;
    lastCompleteFormRef.current = form; // 先于 handleSubmit，确保匹配到被点击的这条
    setFormKey(k => k + 1);
    handleSubmit(formToBirthInfo(form));
  };

  // 解读线程变化 → 写回历史（防抖已在 InsightPanel 内做；这里再去重：内容相同不写）
  const handleThreadsChange = (threads: HistoryInsights) => {
    if (!activeHistoryId) return;
    const json = JSON.stringify(threads);
    if (json === lastSavedInsightsRef.current) return;
    lastSavedInsightsRef.current = json;
    updateInsights(activeHistoryId, threads);
  };

  // ── 未起盘：出生信息表单 + 历史命盘 ──
  if (!chart) {
    return (
      <main className="chart-stage-bg">
        <div className="chart-main-inner form-wrap">
          <h1 className="form-title">紫微斗数排盘</h1>
          <p className="form-sub">输入出生年月日时，即时生成命盘。</p>
          <BirthForm
            key={formKey}
            onSubmit={handleSubmit}
            // onFormSave 只记录最新完整表单（提交时用于保存历史/匹配解读写回目标），
            // 不再实时写历史——历史只在点击起盘（onSubmit）时更新
            onFormSave={(form) => {
              if (form.year && form.month && form.day && form.gender) {
                lastCompleteFormRef.current = form;
              }
            }}
          />

          {/* 历史命盘 */}
          {history.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11, letterSpacing: '0.2em',
                color: 'var(--tx-3)', marginBottom: 12,
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
                      style={{ color: 'var(--tx-3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  const { year, month, day, hour, gender } = chart.birthInfo;
  const genderLabel = gender === 'male' ? '男命' : '女命';
  const hourLabel = `${BRANCHES[hour] ?? ''}时`;

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

  const resetChart = () => {
    setChart(null);
    setView('mingpan');
    setActiveDaXianIndex(-1);
    setSelectedPalace(null);
    setSelectedSiHua(null);
    setSelectedStar(null);
    setActiveHistoryId(null);
    setInitialThreads(null);
  };

  // ── 已起盘：react-iztro 星盘（紫主题）+ 格局卡片 + AI 解读 ──
  return (
    <main className="chart-stage-bg">
      <div className="chart-main-inner">
        {/* 顶栏：重新起盘 + 出生摘要 */}
        <header className="chart-header">
          <button type="button" className="chart-back-btn" onClick={resetChart}>
            ← 重新起盘
          </button>
          <div className="birth-chip">
            <span className="accent">{genderLabel}</span>
            <span className="sep" />
            <span>阳历 {year}年{month}月{day}日</span>
            <span className="sep" />
            <span>{hourLabel}</span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <LangSelect value={lang} onChange={handleLangChange} />
          </div>
        </header>

        {/* 运限切换（本命 / 大限 / 流年 + 流年年份） */}
        <TimeNav
          chart={chart}
          view={view}
          liunianYear={liunianYear}
          onViewChange={setView}
          onYearChange={setLiunianYear}
        />

        <div className="chart-grid">
          {/* 盘面：react-iztro Iztrolabe 紫主题 */}
          <div>
            <div
              className="astrolabe-shell iztro-theme-host theme-purple"
              onClick={handleAstrolabeClick}
              ref={shellRef}
              style={{ position: 'relative' }}
            >
              <Iztrolabe
                birthday={`${year}-${month}-${day}`}
                birthTime={hour}
                birthdayType="solar"
                gender={gender}
                lang={lang}
                horoscopeDate={horoscopeDate}
                // 年柱按立春、月柱按节气（正统八字口径）；iztro 默认 normal 按春节/初一，节气边界日期会错位
                options={{ yearDivide: 'exact', horoscopeDivide: 'exact' }}
              />
              {/* 三方四正连线 + 焦点宫高亮（随大限/流年切换） */}
              <SanFangOverlay
                shellRef={shellRef}
                chart={chart}
                view={view}
                liunianYear={liunianYear}
                activeDaXianIndex={activeDaXianIndex}
              />
            </div>
            {/* 大限 + 流年 快捷切换列表 */}
            <DaXianYearNav
              chart={chart}
              view={view}
              liunianYear={liunianYear}
              activeDaXianIndex={activeDaXianIndex >= 0 ? activeDaXianIndex : chart.currentDaXianIndex}
              onViewChange={setView}
              onYearChange={setLiunianYear}
              onDaXianChange={setActiveDaXianIndex}
            />
          </div>

          {/* 右侧栏：格局识别 + AI 解读 */}
          <div className="chart-side">
            <PatternsCard chart={chart} />
            <InsightPanel
              chart={chart}
              selectedPalace={selectedPalace}
              selectedSiHua={selectedSiHua}
              initialThreads={initialThreads ?? undefined}
              onThreadsChange={handleThreadsChange}
            />
          </div>
        </div>

        {/* 星曜详情弹窗（孤儿功能组装 2，点击盘面主星弹出，居中遮罩） */}
        {selectedStar && (
          <div className="star-modal-mask" onClick={() => setSelectedStar(null)}>
            <div className="star-modal-box" onClick={e => e.stopPropagation()}>
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
      </div>
    </main>
  );
}
