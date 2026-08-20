'use client';
import '@/lib/ziwei/iztro-brightness'; // 修正 iztro 太阴酉宫亮度（不→旺），须在排盘前执行
import { useState } from 'react';
import LangSelect, { getStoredLang, type ChartLang } from '@/components/LangSelect';
import { Iztrolabe } from 'react-iztro';
import { astro } from 'iztro';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo } from '@/lib/ziwei/types';
import ChartBoard from '@/components/ChartBoard';
import { BRANCHES, STEMS } from '@/lib/ziwei/constants';
import 'react-iztro/lib/Iztrolabe/Iztrolabe.css';
import 'react-iztro/lib/Izpalace/Izpalace.css';
import 'react-iztro/lib/IzpalaceCenter/IzpalaceCenter.css';
import 'react-iztro/lib/theme/default.css';

/**
 * P0 验证页：双盘并排对比
 * 左侧 = ziwei-doushu 倪师体系盘面（generateChart）
 * 右侧 = react-iztro 组件盘面（本地 fork，含安星类型/排盘类型选项）
 * 底部 = 关键字段口径对比（命宫/身宫/五行局/紫微位置）
 *
 * 验证目标：React 19 兼容性、排盘口径差异范围、UI 效果
 */

interface DemoForm {
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: 'male' | 'female';
}

const DEFAULT_FORM: DemoForm = { year: 1990, month: 5, day: 20, hour: 6, gender: 'female' };

const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

function toBirthInfo(f: DemoForm): BirthInfo {
  return { year: f.year, month: f.month, day: f.day, hour: f.hour, gender: f.gender };
}

/** 用 iztro 默认口径取关键字段（与 react-iztro 组件内部一致） */
function getIztroKeyFields(f: DemoForm) {
  const solarDate = `${f.year}-${f.month}-${f.day}`;
  const a = astro.bySolar(solarDate, f.hour, f.gender === 'male' ? '男' : '女', true, 'zh-CN');
  return {
    mingGong: a.earthlyBranchOfSoulPalace as string,
    shenGong: a.earthlyBranchOfBodyPalace as string,
    wuxingJu: a.fiveElementsClass as string,
    ziweiBranch: a.palaces.find(p =>
      (p.majorStars ?? []).some((s: { name: string }) => s.name === '紫微')
    )?.earthlyBranch as string | undefined,
  };
}

function CompareRow({ label, a, b, note }: { label: string; a?: string; b?: string; note?: string }) {
  const same = a === b;
  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={{ padding: '6px 10px', fontSize: 13, color: '#666', width: 90 }}>{label}</td>
      <td style={{ padding: '6px 10px', fontSize: 13, fontFamily: 'monospace' }}>{a ?? '-'}</td>
      <td style={{ padding: '6px 10px', fontSize: 13, fontFamily: 'monospace' }}>{b ?? '-'}</td>
      <td style={{ padding: '6px 10px', fontSize: 12 }}>
        {same
          ? <span style={{ color: '#237804' }}>一致</span>
          : <span style={{ color: '#d4380d' }}>不一致</span>}
        {note && <span style={{ color: '#999', marginLeft: 8 }}>{note}</span>}
      </td>
    </tr>
  );
}

type ThemeKey = 'default' | 'gold' | 'ocean';

const THEMES: { key: ThemeKey; label: string }[] = [
  { key: 'default', label: '默认（紫）' },
  { key: 'gold', label: '倪师金' },
  { key: 'ocean', label: '墨蓝' },
];

export default function ChartComparePage() {
  const [form, setForm] = useState<DemoForm>(DEFAULT_FORM);
  const [submitted, setSubmitted] = useState<DemoForm>(DEFAULT_FORM);
  const [theme, setTheme] = useState<ThemeKey>('default');
  const [lang, setLang] = useState<ChartLang>(() => getStoredLang());

  const handleLangChange = (v: ChartLang) => {
    setLang(v);
    if (typeof window !== 'undefined') window.localStorage.setItem('ziwei-chart-lang', v);
  };

  const chart = generateChart(toBirthInfo(submitted));
  const iztroFields = getIztroKeyFields(submitted);

  const doushuMing = BRANCHES[chart.mingGongBranch];
  const doushuShen = BRANCHES[chart.shenGongBranch];

  return (
    <main style={{ maxWidth: 1500, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>P0 验证 · 双盘并排对比</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        左：ziwei-doushu 倪师体系（generateChart）｜右：react-iztro 组件（本地 fork）
      </p>

      {/* 输入区 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20, padding: '12px 16px', border: '1px solid #e5e5e5', borderRadius: 10, background: '#fafafa' }}>
        <label style={{ fontSize: 13 }}>生日
          <input type="number" value={form.year} onChange={e => setForm({ ...form, year: +e.target.value })}
            style={{ width: 80, marginLeft: 4, marginRight: 8, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6 }} />
          <input type="number" value={form.month} min={1} max={12} onChange={e => setForm({ ...form, month: +e.target.value })}
            style={{ width: 52, marginRight: 8, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6 }} />
          <input type="number" value={form.day} min={1} max={31} onChange={e => setForm({ ...form, day: +e.target.value })}
            style={{ width: 52, marginRight: 8, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6 }} />
        </label>
        <label style={{ fontSize: 13 }}>时辰
          <select value={form.hour} onChange={e => setForm({ ...form, hour: +e.target.value })}
            style={{ marginLeft: 4, marginRight: 8, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6 }}>
            {SHICHEN.map((s, i) => <option key={i} value={i}>{s}时</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>性别
          <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as 'male' | 'female' })}
            style={{ marginLeft: 4, marginRight: 12, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6 }}>
            <option value="female">女</option>
            <option value="male">男</option>
          </select>
        </label>
        <button onClick={() => setSubmitted(form)}
          style={{ padding: '6px 18px', cursor: 'pointer', border: 'none', borderRadius: 8, background: '#531dab', color: '#fff', fontSize: 13 }}>
          重新排盘
        </button>
      </div>

      {/* 双盘并排 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* 左：现有倪师盘 */}
        <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 12, background: '#fff' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#333' }}>
            ① ziwei-doushu 倪师体系 <span style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>generateChart + ChartBoard</span>
          </div>
          <ChartBoard chart={chart} onPalaceSelect={() => {}} />
        </div>

        {/* 右：react-iztro 组件 */}
        <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 12, background: '#fff' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#333' }}>
            ② react-iztro 组件 <span style={{ fontSize: 12, fontWeight: 400, color: '#999' }}>Iztrolabe（本地 fork）</span>
            <span style={{ float: 'right', fontSize: 12, fontWeight: 400 }}>
              {THEMES.map(t => (
                <button key={t.key} onClick={() => setTheme(t.key)}
                  style={{
                    marginLeft: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12,
                    border: theme === t.key ? '2px solid #531dab' : '1px solid #ccc',
                    borderRadius: 6, background: theme === t.key ? '#f3effd' : '#fff',
                  }}>
                  {t.label}
                </button>
              ))}
              <span style={{ marginLeft: 6, verticalAlign: 'middle' }}>
                <LangSelect value={lang} onChange={handleLangChange} />
              </span>
            </span>
          </div>
          <div className={`iztro-theme-host ${theme !== 'default' ? `theme-${theme}` : ''}`}>
            <Iztrolabe
              birthday={`${submitted.year}-${submitted.month}-${submitted.day}`}
              birthTime={submitted.hour}
              birthdayType="solar"
              gender={submitted.gender}
              lang={lang}
              options={{ yearDivide: 'exact', horoscopeDivide: 'exact' }}
            />
          </div>
        </div>
      </div>

      {/* 口径对比 */}
      <div style={{ marginTop: 20, border: '1px solid #e5e5e5', borderRadius: 12, padding: '12px 16px', background: '#fff' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#333' }}>关键字段口径对比（同一出生数据）</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th style={{ padding: '6px 10px', fontSize: 13, textAlign: 'left', color: '#666' }}>字段</th>
              <th style={{ padding: '6px 10px', fontSize: 13, textAlign: 'left', color: '#666' }}>① 倪师体系</th>
              <th style={{ padding: '6px 10px', fontSize: 13, textAlign: 'left', color: '#666' }}>② iztro 默认</th>
              <th style={{ padding: '6px 10px', fontSize: 13, textAlign: 'left', color: '#666' }}>结论</th>
            </tr>
          </thead>
          <tbody>
            <CompareRow label="命宫" a={doushuMing} b={iztroFields.mingGong} />
            <CompareRow label="身宫" a={doushuShen} b={iztroFields.shenGong} />
            <CompareRow label="五行局" a={chart.wuxingJuName} b={iztroFields.wuxingJu} />
            <CompareRow label="紫微位置" a={`${BRANCHES[chart.ziweiPos]}`} b={iztroFields.ziweiBranch} />
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
          说明：两套都是基于 iztro 排盘，口径差异主要来自倪师体系对四化/自化的取舍（见 algorithm.ts 注释），宫位与星曜基础安星应一致。
        </p>
      </div>
    </main>
  );
}
