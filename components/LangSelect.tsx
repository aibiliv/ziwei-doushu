'use client';

/** iztro 支持的盘面语言（与 iztro/lib/i18n/locales 一致） */
export const CHART_LANGS = [
  { value: 'zh-CN', label: '简体' },
  { value: 'zh-TW', label: '繁體' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
] as const;

export type ChartLang = (typeof CHART_LANGS)[number]['value'];

/** localStorage 持久化 key（chart / chart-compare 共用） */
export const CHART_LANG_KEY = 'ziwei-chart-lang';

/** 读取持久化语言（SSR 安全：服务端返回默认 zh-CN） */
export function getStoredLang(): ChartLang {
  if (typeof window === 'undefined') return 'zh-CN';
  const v = window.localStorage.getItem(CHART_LANG_KEY);
  return (CHART_LANGS.some(l => l.value === v) ? v : 'zh-CN') as ChartLang;
}

export default function LangSelect({
  value,
  onChange,
}: {
  value: ChartLang;
  onChange: (v: ChartLang) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as ChartLang)}
      aria-label="盘面语言"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--bdr-med)',
        borderRadius: 'var(--r-sm)',
        padding: '4px 8px',
        fontSize: 12,
        color: 'var(--tx-1)',
        fontFamily: 'var(--font)',
        cursor: 'pointer',
        outline: 'none',
        transition: 'border-color 0.15s ease',
      }}
    >
      {CHART_LANGS.map(l => (
        <option key={l.value} value={l.value}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
