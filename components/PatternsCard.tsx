'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { detectPatterns } from '@/lib/ziwei/patterns';

const LevelStyle = {
  excellent: { dot: 'bg-amber-400', label: 'text-amber-500', badge: 'text-amber-500 bg-amber-500/10 border-amber-500/25' },
  good:      { dot: 'bg-sky-400',   label: 'text-sky-500',   badge: 'text-sky-500 bg-sky-500/10 border-sky-500/25' },
  neutral:   { dot: 'bg-slate-400', label: 'text-slate-400', badge: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
  caution:   { dot: 'bg-orange-500', label: 'text-orange-500', badge: 'text-orange-500 bg-orange-500/10 border-orange-500/25' },
};

export default function PatternsCard({ chart }: { chart: ZiweiChart }) {
  const patterns = detectPatterns(chart);
  const [expanded, setExpanded] = useState(false);
  if (patterns.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="card-glass rounded-xl p-4 mb-4"
    >
      {/* 标题行 + 展开/收起按钮 */}
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: 'var(--t-gold)', opacity: 0.6 }}>◉</span>
        <span className="text-[10px] tracking-widest" style={{ color: 'var(--t-faint)' }}>
          格局识别（严格古书条件）
        </span>
        <span className="text-[9px]" style={{ color: 'var(--t-faint)', opacity: 0.75 }}>{patterns.length}个</span>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors"
          style={{
            color: expanded ? 'var(--ac-dim)' : 'var(--tx-3)',
            border: '1px solid var(--t-border)',
            background: 'transparent',
          }}
        >
          {expanded ? '收起' : '展开'}
          <svg
            width="9" height="9" viewBox="0 0 10 10"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}
          >
            <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* 折叠区：格局列表 */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-1">
              {patterns.map((p, i) => {
                const st = LevelStyle[p.level];
                return (
                  <motion.div
                    key={`${p.name}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="card-inner rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                      <span className={`text-[11px] font-medium ${st.label}`}>{p.name}</span>
                      <div className="flex gap-1 ml-auto">
                        {p.palaces.slice(0, 2).map(pa => (
                          <span key={pa} className={`text-[8px] px-1.5 py-px rounded-full border ${st.badge}`}>
                            {pa.replace('宫', '')}
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="text-[10px] leading-relaxed pl-3.5" style={{ color: 'var(--t-text2)' }}>
                      {p.description}
                    </p>

                    {p.conditions && (
                      <div className="mt-2 pl-3.5 space-y-0.5">
                        {p.conditions.required.length > 0 && (
                          <div className="text-[9px] leading-relaxed" style={{ color: 'var(--t-text2)', opacity: 0.85 }}>
                            <span className="font-medium" style={{ color: 'var(--t-gold)' }}>必须</span>
                            <span style={{ opacity: 0.6 }}> · </span>
                            {p.conditions.required.join('、')}
                          </div>
                        )}
                        {p.conditions.bonus && p.conditions.bonus.length > 0 && (
                          <div className="text-[9px] leading-relaxed" style={{ color: 'var(--t-text2)', opacity: 0.85 }}>
                            <span className="font-medium text-emerald-500">加分</span>
                            <span style={{ opacity: 0.6 }}> · </span>
                            {p.conditions.bonus.join('、')}
                          </div>
                        )}
                        {p.conditions.breaking && p.conditions.breaking.length > 0 && (
                          <div className="text-[9px] leading-relaxed" style={{ color: 'var(--t-text2)', opacity: 0.85 }}>
                            <span className="font-medium text-orange-500">破格</span>
                            <span style={{ opacity: 0.6 }}> · </span>
                            {p.conditions.breaking.join('、')}
                          </div>
                        )}
                      </div>
                    )}

                    {p.source && (
                      <div className="text-[9px] mt-1.5 pl-3.5" style={{ color: 'var(--t-faint)', opacity: 0.5 }}>
                        出处 · {p.source}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
