import { useEffect, useState, useCallback } from 'react';
import type { BirthFormState } from '@/components/BirthForm';

const STORAGE_KEY = 'ziwei_history';
const MAX_ENTRIES = 10;
/** 保留 AI 解读的历史条数（只给最近 3 个命盘存解读，防 localStorage 膨胀） */
const INSIGHTS_KEEP = 3;

/** AI 解读消息（与 InsightPanel 的 Message 结构保持一致，duck typing 兼容） */
export interface HistoryInsightMessage {
  role: 'user' | 'assistant';
  content: string;
  hidden?: boolean;
}

/** 每维度线程：key = 维度（overview/love/.../advisory） */
export type HistoryInsights = Record<string, HistoryInsightMessage[]>;

export interface HistoryEntry {
  id: string;
  label: string;
  form: BirthFormState;
  savedAt: number;
  /** AI 解读快照（最近 INSIGHTS_KEEP 条才有，更早的不存） */
  insights?: HistoryInsights;
}

/** 判断两条历史是否同一命盘（与 save 去重同口径：出生信息 5 字段） */
export function sameBirth(a: BirthFormState, b: BirthFormState): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.gender === b.gender &&
    a.clockHour === b.clockHour &&
    a.clockMinute === b.clockMinute
  );
}

/** 在历史中查找与指定出生信息匹配的条目 */
export function matchHistoryEntry(
  history: HistoryEntry[],
  form: BirthFormState,
): HistoryEntry | undefined {
  return history.find(e => sameBirth(e.form, form));
}

/** 只保留最近 INSIGHTS_KEEP 条历史的解读，更早的置空（防 localStorage 膨胀） */
function trimInsights(entries: HistoryEntry[]): HistoryEntry[] {
  const keepIds = new Set(
    [...entries]
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, INSIGHTS_KEEP)
      .map(e => e.id),
  );
  return entries.map(e => (keepIds.has(e.id) ? e : { ...e, insights: undefined }));
}

/** 判断历史表单是否可回载（字段不齐会导致 bySolar 收到非法日期） */
export function isValidForm(form: BirthFormState): boolean {
  return (
    !!form &&
    !!parseInt(form.year) &&
    !!parseInt(form.month) &&
    !!parseInt(form.day) &&
    !!form.gender
  );
}

/** 从 localStorage 读取并过滤历史（同步、总是最新——save 内部同步写 localStorage，
 *  而 React state 更新是异步的，匹配当前命盘时必须用这里的值兜底） */
export function readStoredHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return parsed.filter(e => isValidForm(e.form));
  } catch {
    return [];
  }
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HistoryEntry[];
        const clean = parsed.filter(e => isValidForm(e.form));
        setHistory(clean);
        // 顺带清理脏数据，避免下次读取重复过滤
        if (clean.length !== parsed.length) {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(clean)); } catch {}
        }
      }
    } catch { /* localStorage 不可用时静默失败 */ }
  }, []);

  const save = useCallback((form: BirthFormState) => {
    if (!isValidForm(form)) return; // 只保存完整表单
    const label = [
      form.name,
      `${form.year}年${form.month}月${form.day}日`,
      form.city || form.province || '',
      form.gender === 'male' ? '男' : '女',
    ].filter(Boolean).join(' · ');

    const entry: HistoryEntry = {
      id: Date.now().toString(),
      label,
      form,
      savedAt: Date.now(),
    };

    setHistory(prev => {
      // 去重：相同出生信息视为同一条记录。复用旧条目的 id 与 insights（保证
      // 解读写回目标 activeHistoryId 持续有效、不因表单微调而丢失），仅更新
      // label/form/savedAt 并置顶。
      const existing = prev.find(e => sameBirth(e.form, form));
      const finalEntry: HistoryEntry = existing
        ? { ...existing, label, form, savedAt: Date.now() }
        : entry;
      const deduped = prev.filter(e => !sameBirth(e.form, form));
      const updated = trimInsights([finalEntry, ...deduped].slice(0, MAX_ENTRIES));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  /** 回写指定命盘的 AI 解读（仅最近 INSIGHTS_KEEP 条会实际保存） */
  const updateInsights = useCallback((id: string, insights: HistoryInsights) => {
    setHistory(prev => {
      const updated = prev.map(e => (e.id === id ? { ...e, insights } : e));
      const trimmed = trimInsights(updated);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); } catch {}
      return trimmed;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(e => e.id !== id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  return { history, save, remove, updateInsights };
}
