'use client';
import '@/lib/ziwei/iztro-brightness'; // 修正 iztro 太阴酉宫亮度，须在排盘前执行
import { useMemo, useState } from 'react';
import { generateChart } from '@/lib/ziwei/algorithm';
import { FAMOUS_PERSONS, FAMOUS_CATEGORIES } from '@/lib/ziwei/famous';
import { Iztrolabe } from 'react-iztro';
import 'react-iztro/lib/Iztrolabe/Iztrolabe.css';
import 'react-iztro/lib/Izpalace/Izpalace.css';
import 'react-iztro/lib/IzpalaceCenter/IzpalaceCenter.css';
import 'react-iztro/lib/theme/default.css';
import InsightPanel from '@/components/InsightPanel';
import PatternsCard from '@/components/PatternsCard';
import LangSelect, { getStoredLang, type ChartLang } from '@/components/LangSelect';
import type { ZiweiChart } from '@/lib/ziwei/types';

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/**
 * 名人实盘案例库 —— 付费功能 MVP
 *
 * 复用 /chart 的排盘 + 解读组件：
 *  - 列表按 category 分 Tab，展示名人身份与命盘亮点（免费预览）
 *  - 选中后用 famous 生日 generateChart 排盘，渲染 Iztrolabe 星盘 + PatternsCard 格局
 *  - InsightPanel 自带付费墙：免费维度（命格总览等）可看，专业版维度 / AI 对话触发 402
 *    升级（UpgradeModal + activateDemo 本地模拟激活 pro），复用 lib/plan.ts 配额体系
 */
export default function CasesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string>(FAMOUS_CATEGORIES[0]);
  const [lang, setLang] = useState<ChartLang>(() => getStoredLang());

  const selected = FAMOUS_PERSONS.find(p => p.id === selectedId) ?? null;
  const chart = useMemo<ZiweiChart | null>(() => {
    if (!selected) return null;
    return generateChart({ year: selected.year, month: selected.month, day: selected.day, hour: selected.hour, gender: selected.gender });
  }, [selected]);

  // ── 列表视图（免费预览） ──
  if (!selected || !chart) {
    const list = FAMOUS_PERSONS.filter(p => p.category === activeCat);
    return (
      <main className="chart-stage-bg">
        <div className="chart-main-inner form-wrap">
          <h1 className="form-title">名人实盘案例</h1>
          <p className="form-sub">
            真实名人命盘 + AI 深度解读。免费看命格总览，升级专业版解锁全维度深度解读与多轮 AI 对话。
          </p>

          {/* 分类 Tab */}
          <div style={{ display: 'flex', gap: 8, margin: '20px 0 16px', flexWrap: 'wrap' }}>
            {FAMOUS_CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setActiveCat(c)}
                style={{
                  padding: '6px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 13,
                  border: '1px solid var(--t-border)',
                  background: c === activeCat ? 'var(--t-gold)' : 'var(--t-card)',
                  color: c === activeCat ? '#1a1205' : 'var(--t-text2)',
                }}
              >
                {c}
              </button>
            ))}
          </div>

          {/* 卡片网格 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {list.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                style={{
                  padding: 16, cursor: 'pointer', background: 'var(--t-card)',
                  border: '1px solid var(--t-border)', borderRadius: 12,
                  display: 'flex', flexDirection: 'column', gap: 8,
                  transition: 'border-color .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--t-gold)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--t-border)')}
              >
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t-text)' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--tx-3)' }}>{p.description}</div>
                <div style={{ fontSize: 12, color: 'var(--t-gold)', opacity: 0.85, lineHeight: 1.6 }}>
                  {p.notable}
                </div>
                <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--tx-3)' }}>
                  {p.gender === 'male' ? '男' : '女'} · {p.year}年生
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // ── 详情视图：星盘 + 解读（付费墙由 InsightPanel 自带） ──
  const { year, month, day, hour, gender } = chart.birthInfo;
  const genderLabel = gender === 'male' ? '男命' : '女命';
  const hourLabel = `${BRANCHES[hour] ?? ''}时`;

  return (
    <main className="chart-stage-bg">
      <div className="chart-main-inner">
        <header className="chart-header">
          <button type="button" className="chart-back-btn" onClick={() => setSelectedId(null)}>
            ← 案例列表
          </button>
          <div className="birth-chip">
            <span className="accent">{selected.name}</span>
            <span className="sep" />
            <span>{genderLabel}</span>
            <span className="sep" />
            <span>阳历 {year}年{month}月{day}日</span>
            <span className="sep" />
            <span>{hourLabel}</span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <LangSelect value={lang} onChange={setLang} />
          </div>
        </header>

        <div className="chart-grid">
          <div>
            <div className="astrolabe-shell iztro-theme-host theme-metis" style={{ position: 'relative' }}>
              <Iztrolabe
                birthday={`${year}-${month}-${day}`}
                birthTime={hour}
                birthdayType="solar"
                gender={gender}
                lang={lang}
                // 年柱按立春、月柱按节气（正统八字口径）；与 /chart 一致
                options={{ yearDivide: 'exact', horoscopeDivide: 'exact' }}
              />
            </div>
          </div>

          <div className="chart-side">
            <PatternsCard chart={chart} />
            <InsightPanel chart={chart} />
          </div>
        </div>
      </div>
    </main>
  );
}
