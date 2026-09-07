'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { STEMS, BRANCHES } from '@/lib/ziwei/constants';
import type { TimeView } from './TimeNav';
import RadarChart from './RadarChart';
import { computeRadar } from '@/lib/ziwei/radar';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  hidden?: boolean;
}

interface ChatMessage extends Message {
  // AI 对话栏目使用，不隐藏任何消息
}

interface SelectedSiHua {
  starName: string;
  siHua: string;
  view: TimeView;
}

interface InsightPanelProps {
  chart: ZiweiChart;
  selectedSiHua?: SelectedSiHua | null;
  initialThreads?: Record<string, Message[]>;
  onThreadsChange?: (threads: Record<string, Message[]>) => void;
  /** ── 运限解读增强（全部可选；缺省 = 本命模式，UI/逻辑零变化，兼容 cases 等旧调用）── */
  /** 当前运限视图；view!=='mingpan' 时命盘分析栏出现「此大限/流年运势」入口 */
  view?: TimeView;
  /** 当前流年年份（view='liunian' 时随 TimeNav 变化） */
  liunianYear?: number;
  /** 当前选中大限索引（view='daxian' 时；-1 或缺省 = 跟随 currentDaXianIndex） */
  activeDaXianIndex?: number;
}

/**
 * 运限解读线程 key 命名空间：dx-{daXianIndex} / ln-{year}。
 * 独立于本命 13 维线程（TOPICS keys），也不写入 localStorage 历史
 * （历史结构不变；onThreadsChange 只上报本命 threads，见下方 effect）。
 */
const scopeKeyOf = (view: TimeView | undefined, dxIndex: number, year: number): string | null => {
  if (view === 'daxian' && dxIndex >= 0) return `dx-${dxIndex}`;
  if (view === 'liunian' && year > 0) return `ln-${year}`;
  return null;
};

/** 运限线程标题（快照回看时用） */
function scopeThreadTitle(key: string): string {
  if (key.startsWith('dx-')) return '大限运势解读';
  if (key.startsWith('ln-')) return '流年运势解读';
  return '运限解读';
}

/** 宫名归一：iztro palace.name 除「命宫」外均无「宫」后缀 */
function palaceFullName(name: string): string {
  return name.endsWith('宫') ? name : `${name}宫`;
}

/** 解读线程的两种存储：native = 本命 13 维（可写历史）；scope = 运限（不写历史） */
type AnalysisStore = 'native' | 'scope';

/** 专项解读（宫位 / 四化飞化）在命盘分析栏目内 */
const ADVISORY = 'advisory';

/** 13 个主题标签：前 6 个免费，后 7 个需专业版 */
const TOPICS = [
  { key: 'overview',      label: '命格总览',  locked: false },
  { key: 'wealth',        label: '财运',      locked: false },
  { key: 'career',        label: '事业',      locked: false },
  { key: 'love',          label: '感情',      locked: false },
  { key: 'personality',   label: '性格',      locked: false },
  { key: 'health',        label: '健康',      locked: false },
  // 7 个付费维度
  { key: 'siblings',      label: '兄弟合伙',  locked: true },
  { key: 'children',      label: '子女',      locked: true },
  { key: 'migration',     label: '迁移外出',  locked: true },
  { key: 'interpersonal', label: '人际贵人',  locked: true },
  { key: 'property',      label: '田宅',      locked: true },
  { key: 'mentality',     label: '福德',      locked: true },
  { key: 'parents',       label: '父母长辈',  locked: true },
] as const;

const TOPIC_PROMPTS: Record<string, string> = {
  overview: `请生成命格总览（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 命格"开头一句话点题（例：太阳 · 命格）。

**【一句话定调】**
一句话（15-25 字）定调命格最核心的格局与命主气质。

**【核心论断】**
2-3 句核心论断，用本盘最关键的主星+庙旺+四化作为判断依据。

**【主星解读】**
本盘命宫主星的倪海厦体系详解，引用倪师原话或观点，200-300 字。

**【三方四正】**
命宫的三方四正（财、官、迁）联动分析，整体格局定调（巨日/机月同梁/杀破狼 等）。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星解读。

**【命盘推演 · 三方】**
财帛宫、官禄宫、迁移宫主星+庙旺，对命格的影响。

**【命盘推演 · 对宫】**
父母宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化（化禄/权/科/忌）的落点及对命格的影响（例：紫微化科落田宅）。

**【成长课题】**
3-5 句本命的核心功课与人生方向，倪师视角。

**【一句话走调】**
用一句精炼的 10-20 字古意短语（如"光风霁月，外圆内方"）收束全篇。`,

  love: `请深度分析感情婚姻运（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 感情"开头一句话点题（例：天同 · 感情）。

**【一句话定调】**
15-25 字定调感情命格（如"深情缘浅，迟婚为上"）。

**【核心论断】**
2-3 句核心论断，以夫妻宫主星+四化为依据。

**【主星解读】**
夫妻宫主星的倪海厦体系详解，200-300 字。

**【三方四正】**
夫妻宫的三方四正（迁移宫、官禄宫、福德宫）联动分析。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星（注意空宫借对宫的情况）。

**【命盘推演 · 三方】**
迁移宫（对外桃花）、官禄宫（事业对感情的影响）、福德宫（精神契合）主星+庙旺。

**【命盘推演 · 对宫】**
官禄宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化中落入夫妻宫或三方的化忌（桃花杀手）分析。

**【实际建议】**
3-5 句具体可行的感情建议：择偶方向、相处之道、避坑点。

**【一句话走调】**
10-20 字古意短语收束。`,

  career: `请深度分析事业运（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 事业"开头一句话点题（例：紫微 · 事业）。

**【一句话定调】**
15-25 字定调事业命格（如"宜守成于大企业，忌独立创业"）。

**【核心论断】**
2-3 句核心论断，以官禄宫主星+四化为依据。

**【主星解读】**
官禄宫主星的倪海厦体系详解，200-300 字。

**【三方四正】**
官禄宫的三方四正（财帛宫、夫妻宫、迁移宫）联动分析。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星。

**【命盘推演 · 三方】**
财帛宫（收入方式）、夫妻宫（合伙稳定性）、迁移宫（在外发展）主星+庙旺。

**【命盘推演 · 对宫】**
迁移宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化中落入官禄宫或三方的禄/权（事业催化剂）分析。

**【实际建议】**
3-5 句具体可行的事业方向：宜从行业、宜从职位、避坑点、合伙/独立的选择。

**【一句话走调】**
10-20 字古意短语收束。`,

  wealth: `请深度分析财运（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 财运"开头一句话点题（例：武曲 · 财运）。

**【一句话定调】**
15-25 字定调财运模式（主动财/被动财/正财/偏财）。

**【核心论断】**
2-3 句核心论断，以财帛宫主星+四化为依据。

**【主星解读】**
财帛宫主星的倪海厦体系详解，200-300 字。

**【三方四正】**
财帛宫的三方四正（兄弟宫、疾厄宫、田宅宫）联动分析。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星（注意空宫借对宫的情况）。

**【命盘推演 · 三方】**
兄弟宫（合伙财）、疾厄宫（健康与体力变现）、田宅宫（财库与不动产）主星+庙旺。

**【命盘推演 · 对宫】**
田宅宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化中落入财帛宫或财库的化禄/化忌（财来财去）分析。

**【理财建议】**
3-5 句具体可行的理财方向：主动收入与被动收入配置、不动产 vs 流动资产、避坑点。

**【一句话走调】**
10-20 字古意短语收束。`,

  health: `请分析健康运势（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 健康"开头一句话点题（例：廉贞 · 健康）。

**【一句话定调】**
15-25 字定调健康格局（如"心血管与血分为命门"）。

**【核心论断】**
2-3 句核心论断，以疾厄宫主星+四化为依据。

**【主星解读】**
疾厄宫主星的倪海厦体系详解，200-300 字，含主要疾病风险部位。

**【三方四正】**
疾厄宫的三方四正（兄弟宫、田宅宫、父母宫）联动分析。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星（注意空宫借对宫的情况）。

**【命盘推演 · 三方】**
兄弟宫（体质遗传）、田宅宫（家族病史）、父母宫（先天禀赋）主星+庙旺。

**【命盘推演 · 对宫】**
父母宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化中落入疾厄宫或对宫的化忌（健康风险）分析。

**【养生建议】**
3-5 句具体可行的养生方向：重点保养部位、饮食宜忌、推荐运动、定期检查项目。

**【一句话走调】**
10-20 字古意短语收束。`,

  personality: `请深度解析性格特质（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 性格"开头一句话点题（例：太阳 · 性格）。

**【一句话定调】**
15-25 字定调核心性格（如"外圆内方，光明正大"）。

**【核心论断】**
2-3 句核心论断，以命宫主星+四化为依据。

**【主星解读】**
命宫主星的倪海厦体系详解，200-300 字。

**【三方四正】**
命宫的三方四正（财、官、迁）性格映射，整体格局定调。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星。

**【命盘推演 · 三方】**
财帛宫（理财风格）、官禄宫（工作态度）、迁移宫（对外形象）主星+庙旺。

**【命盘推演 · 对宫】**
父母宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化中与命宫关联的化禄/化科（天赋放大）分析。

**【人际模式】**
3-5 句命主与他人互动方式、待人处世风格、贵人/小人缘。

**【优势与人生课题】**
3-5 句天赋优势，以及需要面对的人生功课（身心灵层面）。

**【一句话走调】**
10-20 字古意短语收束。`,

  siblings: `请深度解析兄弟合伙运（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 兄弟合伙"开头一句话点题。

**【一句话定调】**
15-25 字定调兄弟关系与合伙缘分。

**【核心论断】**
2-3 句核心论断，以兄弟宫主星+四化为依据。

**【主星解读】**
兄弟宫主星的倪海厦体系详解，200-300 字。

**【三方四正】**
兄弟宫的三方四正（命宫、奴仆宫、田宅宫）联动分析。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星（注意空宫借对宫的情况）。

**【命盘推演 · 三方】**
命宫（与命主关系深浅）、奴仆宫（朋友型合作）、田宅宫（家族资源）主星+庙旺。

**【命盘推演 · 对宫】**
奴仆宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化中落入兄弟宫或三方的禄/忌（合伙成败）分析。

**【实际建议】**
3-5 句具体可行的合伙建议：择友标准、合伙避坑、家族资源利用。

**【一句话走调】**
10-20 字古意短语收束。`,

  children: `请深度解析子女缘与下属关系（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 子女"开头一句话点题。

**【一句话定调】**
15-25 字定调子女缘分（数量、性别倾向、关系亲疏）。

**【核心论断】**
2-3 句核心论断，以子女宫主星+四化为依据。

**【主星解读】**
子女宫主星的倪海厦体系详解，200-300 字。

**【三方四正】**
子女宫的三方四正（田宅宫、官禄宫、疾厄宫）联动分析。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星（注意空宫借对宫的情况）。

**【命盘推演 · 三方】**
田宅宫（家族传承）、官禄宫（事业承继）、疾厄宫（生产健康）主星+庙旺。

**【命盘推演 · 对宫】**
田宅宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化中落入子女宫或三方的化忌（子女缘波动）分析。

**【实际建议】**
3-5 句具体可行建议：子女教育方向、与子女相处之道、晚年依靠。

**【一句话走调】**
10-20 字古意短语收束。`,

  migration: `请深度解析迁移外出运（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 迁移外出"开头一句话点题。

**【一句话定调】**
15-25 字定调在外发展运势（宜出/宜守）。

**【核心论断】**
2-3 句核心论断，以迁移宫主星+四化为依据。

**【主星解读】**
迁移宫主星的倪海厦体系详解，200-300 字。

**【三方四正】**
迁移宫的三方四正（命宫、夫妻宫、官禄宫）联动分析。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星（注意空宫借对宫的情况）。

**【命盘推演 · 三方】**
命宫（出行是否有利本心）、夫妻宫（是否带配偶）、官禄宫（在外事业）主星+庙旺。

**【命盘推演 · 对宫】**
官禄宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化中落入迁移宫或三方的禄/忌（出行吉凶）分析。

**【实际建议】**
3-5 句具体可行建议：宜/忌出远门的方向、长期驻地选择、避坑点。

**【一句话走调】**
10-20 字古意短语收束。`,

  interpersonal: `请深度解析人际贵人运（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 人际贵人"开头一句话点题。

**【一句话定调】**
15-25 字定调人际关系格局（贵人/小人缘）。

**【核心论断】**
2-3 句核心论断，以奴仆宫（交友宫）主星+四化为依据。

**【主星解读】**
交友宫主星的倪海厦体系详解，200-300 字。

**【三方四正】**
交友宫的三方四正（兄弟宫、官禄宫、疾厄宫）联动分析。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星（注意空宫借对宫的情况）。

**【命盘推演 · 三方】**
兄弟宫（平辈关系）、官禄宫（同事关系）、疾厄宫（健康支持）主星+庙旺。

**【命盘推演 · 对宫】**
疾厄宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化中落入交友宫或三方的化禄/化忌（贵人/小人）分析。

**【实际建议】**
3-5 句具体可行建议：择友标准、社交圈经营、识别小人。

**【一句话走调】**
10-20 字古意短语收束。`,

  property: `请深度解析田宅不动产运（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 田宅"开头一句话点题。

**【一句话定调】**
15-25 字定调家宅与不动产运势。

**【核心论断】**
2-3 句核心论断，以田宅宫主星+四化为依据。

**【主星解读】**
田宅宫主星的倪海厦体系详解，200-300 字。

**【三方四正】**
田宅宫的三方四正（福德宫、疾厄宫、兄弟宫）联动分析。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星（注意空宫借对宫的情况）。

**【命盘推演 · 三方】**
福德宫（精神生活）、疾厄宫（家庭健康）、兄弟宫（家族人口）主星+庙旺。

**【命盘推演 · 对宫】**
福德宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化中落入田宅宫或三方的禄/忌（置业吉凶）分析。

**【实际建议】**
3-5 句具体可行建议：购房时机、不动产配置、家庭经营。

**【一句话走调】**
10-20 字古意短语收束。`,

  mentality: `请深度解析福德精神生活（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 福德"开头一句话点题。

**【一句话定调】**
15-25 字定调精神格局（如"内求丰厚，外象和光"）。

**【核心论断】**
2-3 句核心论断，以福德宫主星+四化为依据。

**【主星解读】**
福德宫主星的倪海厦体系详解，200-300 字。

**【三方四正】**
福德宫的三方四正（田宅宫、父母宫、夫妻宫）联动分析。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星（注意空宫借对宫的情况）。

**【命盘推演 · 三方】**
田宅宫（家宅安宁）、父母宫（祖荫庇佑）、夫妻宫（精神契合）主星+庙旺。

**【命盘推演 · 对宫】**
田宅宫作为对宫的主星+庙旺。

**【四化路径】**
本盘四化中落入福德宫或三方的化禄/忌（精神丰盈/匮乏）分析。

**【修心建议】**
3-5 句具体可行建议：精神修养方向、信仰选择、压力管理。

**【一句话走调】**
10-20 字古意短语收束。`,

  parents: `请深度解析父母长辈缘（倪海厦体系），严格按以下多块结构输出：

**【主星 · 标签】**
以"${'{{主星}}'} · 父母长辈"开头一句话点题。

**【一句话定调】**
15-25 字定调父母缘分与文书运。

**【核心论断】**
2-3 句核心论断，以父母宫主星+四化为依据。

**【主星解读】**
父母宫主星的倪海厦体系详解，200-300 字。

**【三方四正】**
父母宫的三方四正（命宫、福德宫、疾厄宫）联动分析。

**【命盘推演 · 本宫】**
本宫主星 + 庙旺状态 + 同宫辅星（注意空宫借对宫的情况）。

**【命盘推演 · 三方】**
命宫（祖荫与命主关系）、福德宫（精神传承）、疾厄宫（父母健康）主星+庙旺。

**【命盘推演 · 对宫】**
命宫作为对宫的主星+庙旺（注意此为命宫的对宫）。

**【四化路径】**
本盘四化中落入父母宫或三方的禄/忌（父母关系/文书吉凶）分析。

**【实际建议】**
3-5 句具体可行建议：与父母相处之道、文书契约注意事项、长辈健康关注。

**【一句话走调】**
10-20 字古意短语收束。`,
};

/** 升级专业版提示 modal */
function UpgradeModal({ topic, onClose, onActivate }: { topic: string; onClose: () => void; onActivate?: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        onClick={onClose}
        style={{ background: 'rgba(0,0,0,0.45)' }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="max-w-sm rounded-2xl p-6 text-center"
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--t-card)',
            border: '1px solid rgba(212,168,67,0.4)',
            boxShadow: '0 20px 60px rgba(212,168,67,0.15)',
          }}
        >
          <div className="text-3xl mb-3" style={{ color: 'var(--t-gold)' }}>✦</div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--t-text)' }}>
            {topic} · 专业版
          </h3>
          <p className="text-[11px] leading-relaxed mb-4" style={{ color: 'var(--t-text2)' }}>
            「{topic}」属于专业版功能，需升级后使用。<br />
            升级后可解锁：全维度深度解读 · 多轮 AI 对话 · 大限流年流月多层对照。
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-[11px] font-medium transition-all"
              style={{ background: 'transparent', border: '1px solid var(--t-border)', color: 'var(--t-text2)' }}
            >
              稍后
            </button>
            {onActivate && (
              <button
                onClick={onActivate}
                className="flex-1 px-4 py-2 rounded-lg text-[11px] font-medium transition-all"
                style={{ background: 'transparent', border: '1px solid rgba(212,168,67,0.25)', color: 'var(--t-gold)' }}
              >
                体验激活
              </button>
            )}
            <button
              onClick={() => { window.location.href = '/pricing'; onClose(); }}
              className="flex-1 px-4 py-2 rounded-lg text-[11px] font-medium transition-all"
              style={{ background: 'rgba(212,168,67,0.18)', border: '1px solid rgba(212,168,67,0.4)', color: 'var(--t-gold)' }}
            >
              了解升级
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Render AI markdown: **【Title】** → gold header, **bold** → strong */
function AiContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const sectionMatch = line.match(/^\*\*【(.+?)】\*\*$/);
        if (sectionMatch) {
          return (
            <div key={i} className="pt-3 pb-0.5 first:pt-0">
              <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--t-gold)' }}>【{sectionMatch[1]}】</span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>
            {parts.map((part, j) => j % 2 === 0 ? part : <strong key={j} className="font-medium" style={{ color: 'var(--t-text)' }}>{part}</strong>)}
          </div>
        );
      })}
      {streaming && <span className="inline-block w-1.5 h-3 ml-0.5 animate-pulse rounded-sm align-middle" style={{ background: 'var(--t-gold)', opacity: 0.6 }} />}
    </div>
  );
}

export default function InsightPanel({
  chart,
  selectedSiHua,
  initialThreads,
  onThreadsChange,
  view = 'mingpan',
  liunianYear,
  activeDaXianIndex,
}: InsightPanelProps) {
  // ── 顶层栏目：命盘分析 / AI 对话 ──
  const [activeSection, setActiveSection] = useState<'analysis' | 'chat'>('analysis');

  // ── 命盘分析栏目 ──
  const [threads, setThreads] = useState<Record<string, Message[]>>(() => initialThreads ?? {});
  const [activeTab, setActiveTab] = useState<string>('overview');
  // ── 运限解读增强：运限线程独立存储（key = dx-{i} / ln-{year}），与 threads（本命 13 维）隔离 ──
  const [scopeThreads, setScopeThreads] = useState<Record<string, Message[]>>({});
  const [scopeKey, setScopeKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTab, setLoadingTab] = useState<string | null>(null);

  // ── AI 对话栏目 ──
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatNeedsReset, setChatNeedsReset] = useState(false);

  // ── 收费分层 ──
  const [uid] = useState<string>(() => {
    if (typeof window === 'undefined') return 'anonymous';
    let u = localStorage.getItem('zw_uid');
    if (!u) {
      u = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('zw_uid', u);
    }
    return u;
  });
  const [deepAllowed, setDeepAllowed] = useState(false);
  const [lockedTopic, setLockedTopic] = useState<string | null>(null);

  // refs
  const threadsRef = useRef<Record<string, Message[]>>(initialThreads ?? {});
  const scopeThreadsRef = useRef<Record<string, Message[]>>({});
  const analysisScrollRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const chatLoadingRef = useRef(false);
  // 解读进行中被点击的其他分析 tab：暂存最后一次请求（本命/运限通用），结束后自动执行
  const pendingGenerateRef = useRef<{
    prompt: string;
    key: string;
    plan: 'free' | 'deep';
    store: AnalysisStore;
    extraBody?: Record<string, unknown>;
  } | null>(null);

  // sync refs
  useEffect(() => { threadsRef.current = threads; }, [threads]);
  useEffect(() => { scopeThreadsRef.current = scopeThreads; }, [scopeThreads]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { chatLoadingRef.current = chatLoading; }, [chatLoading]);

  // 订阅状态
  useEffect(() => {
    if (uid === 'anonymous') return;
    fetch(`/api/plan?uid=${encodeURIComponent(uid)}`)
      .then(r => r.json())
      .then((d: { deepAllowed?: boolean }) => setDeepAllowed(!!d.deepAllowed))
      .catch(() => setDeepAllowed(false));
  }, [uid]);

  // 维度线程上报（仅命盘分析）
  useEffect(() => {
    if (!onThreadsChange) return;
    const t = setTimeout(() => onThreadsChange(threads), 400);
    return () => clearTimeout(t);
  }, [threads, onThreadsChange]);

  // 命盘分析滚动
  useEffect(() => {
    if (activeSection === 'analysis' && analysisScrollRef.current) {
      analysisScrollRef.current.scrollTop = analysisScrollRef.current.scrollHeight;
    }
  }, [threads, scopeThreads, activeTab, scopeKey, activeSection]);

  // AI 对话滚动
  useEffect(() => {
    if (activeSection === 'chat' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, activeSection]);

  // 命盘变化时清空 AI 对话本地状态，并在下次发送时 reset 服务端历史
  const chartKey = useMemo(() => {
    const bi = chart.birthInfo;
    return `${bi.year}-${bi.month}-${bi.day}-${bi.hour}-${bi.gender}`;
  }, [chart.birthInfo]);
  useEffect(() => {
    setChatMessages([]);
    setChatNeedsReset(true);
    setScopeThreads({}); // 换命盘：运限解读线程一并清空（不落历史，无需回载）
    setScopeKey(null);
  }, [chartKey]);

  // ── 运限解读增强：解析当前运限（大限索引 / 流年） ──
  // 大限索引：优先用户选中（activeDaXianIndex，-1 = 跟随当前年龄大限）
  const scopeDxIndex = useMemo(() => {
    if (!chart || view !== 'daxian') return -1;
    const idx = (activeDaXianIndex ?? -1) >= 0 ? activeDaXianIndex! : chart.currentDaXianIndex;
    return chart.daXians[idx] ? idx : -1;
  }, [chart, view, activeDaXianIndex]);
  // 流年：TimeNav 传入选年，缺省今年
  const scopeYear = useMemo(() => {
    if (view !== 'liunian') return 0;
    const y = liunianYear ?? new Date().getFullYear();
    return Number.isFinite(y) && y > 0 ? Math.floor(y) : 0;
  }, [view, liunianYear]);
  const currentScopeKey = useMemo(
    () => scopeKeyOf(view, scopeDxIndex, scopeYear),
    [view, scopeDxIndex, scopeYear],
  );

  // 运限入口元信息（label/说明/解读 prompt/请求体附加字段）
  const scopeMeta = useMemo(() => {
    if (view === 'daxian' && scopeDxIndex >= 0) {
      const dx = chart.daXians[scopeDxIndex];
      const stemChar = dx.stemName || (STEMS[chart.palaces.find(p => p.branch === dx.palaceBranch)?.stem ?? 0] ?? '');
      const name = palaceFullName(dx.palaceName);
      const ganZhi = `${stemChar}${BRANCHES[dx.palaceBranch] ?? ''}`;
      return {
        key: `dx-${scopeDxIndex}`,
        label: `此大限运势 · ${name} · ${dx.startAge}–${dx.endAge}岁`,
        shortLabel: `大限 · ${name}（${dx.startAge}-${dx.endAge}岁）`,
        sub: `大限命宫叠于本命${name}（${ganZhi}）：宫职重叠 + 大限宫干四化飞布落宫（${stemChar}干）断此十年引动，免费生成`,
        extraBody: { view: 'daxian' as const, daXianIndex: scopeDxIndex },
        prompt: `请用四化飞星技法解读【当前所选大限】运势，严格按以下结构输出：

**【大限定位 · 宫职重叠】**
说明大限命宫落在本命哪一宫（以命盘上下文「=== 所选运限 ===」段为准），此宫职领域如何成为这十年的人生主题。

**【大限四化飞布】**
按命盘上下文所列的大限四化（禄权科忌）飞布落宫逐一说明：每颗化星落入本命哪宫、引动哪个领域；不得自行另算四化。化忌落宫须重点展开——它是此十年最需留意的课题，给出具体的避忌方向。

**【三方四正联动】**
结合大限命宫所在本命宫位的三方四正（对宫与两个三合宫）与本命星曜配置，说明十年间事业/财运/感情/健康等的联动起伏节奏。

**【十年分水岭】**
点出此大限内最容易出现转折的年龄段（结合各流年地支年对应宫位简要提示）。

**【实际建议】**
3-5 句具体可执行的建议：顺势领域、谨慎领域、化忌落宫相关的避坑点。`,
      };
    }
    if (view === 'liunian' && scopeYear > 0) {
      const stemChar = STEMS[((scopeYear - 4) % 10 + 10) % 10];
      const branchChar = BRANCHES[((scopeYear - 4) % 12 + 12) % 12];
      return {
        key: `ln-${scopeYear}`,
        label: `此流年运势 · ${scopeYear}年`,
        shortLabel: `流年 · ${scopeYear}`,
        sub: `流年命宫 = ${scopeYear}年地支（${stemChar}${branchChar}年）落宫；以${stemChar}干四化飞布落宫断今年引动，免费生成`,
        extraBody: { view: 'liunian' as const, liunianYear: scopeYear },
        prompt: `请用四化飞星技法解读【当前所选流年（${scopeYear}年）】运势，严格按以下结构输出：

**【流年定位 · 宫职重叠】**
说明${scopeYear}年流年命宫（流年地支宫）落在本命哪一宫（以命盘上下文「=== 所选运限 ===」段为准），此宫职领域如何成为这一年的主题。

**【流年四化飞布】**
按命盘上下文所列的流年四化（禄权科忌）飞布落宫逐一说明：每颗化星落入本命哪宫、引动哪个领域；不得自行另算四化。化忌落宫须重点展开——它是今年最需留意的课题，给出具体月份/季节的避忌提示（可参考流月干支走向简述）。

**【三方四正联动】**
结合流年命宫所在本命宫位的三方四正与本命星曜，说明今年事业/财运/感情/健康各领域的吉凶节奏。

**【实际建议】**
3-5 句具体可执行的建议：宜把握的机会窗口、宜谨慎的领域、化忌落宫相关的避坑点。`,
      };
    }
    return null;
  }, [view, scopeDxIndex, scopeYear, chart]);

  // 盘面运限切换时的内容跟随策略：
  //   - 回到本命视图 → 显示本命 13 维线程（scopeKey=null）；
  //   - 正在阅读运限解读（scopeKey 非空）且运限变了（如流年换年/换大限）→ 跟随新运限线程；
  //   - 本命阅读中切到运限视图（scopeKey 仍为 null）→ 不强切内容，只展示上方运限入口卡片。
  //   生成请求只由用户点入口触发，避免切年即自动发请求。
  useEffect(() => {
    if (view === 'mingpan' || !currentScopeKey) {
      setScopeKey(null);
      return;
    }
    setScopeKey(prev => {
      if (prev === null) return null; // 本命阅读中 → 不强切
      return prev === currentScopeKey ? prev : currentScopeKey;
    });
  }, [view, currentScopeKey]);

  // 运限解读入口点击：复用 generateAnalysis 管线（SSE/排队/渲染），plan=free 不加锁
  // 语义：无内容 → 生成；有内容且空闲 → 重新生成（清空旧线程）；有内容但生成中 → 仅切视图查看
  const handleScopeAnalyze = () => {
    const meta = scopeMeta;
    if (!meta) return;
    setActiveSection('analysis');
    const hasOld = (scopeThreadsRef.current[meta.key]?.length ?? 0) > 0;
    if (hasOld && !loadingRef.current) {
      setScopeThreads(prev => ({ ...prev, [meta.key]: [] })); // 清空旧线程
      generateAnalysis(meta.prompt, meta.key, 'free', { store: 'scope', extraBody: meta.extraBody });
      setScopeKey(meta.key);
      return;
    }
    setScopeKey(meta.key);
    if (!hasOld) {
      generateAnalysis(meta.prompt, meta.key, 'free', { store: 'scope', extraBody: meta.extraBody });
    }
  };

  // 注：宫位点击不再联动本面板 tab（点击宫位只做盘面高亮：三方四正 + 宫干四化），
  // 四化飞化徽章点击仍走下方 selectedSiHua → 专项 tab 联动。
  // 四化飞化：切到命盘分析专项
  useEffect(() => {
    if (!selectedSiHua) return;
    const palaceOfStar = chart.palaces.find(p => p.stars.some(s => s.name === selectedSiHua.starName));
    const palaceName = palaceOfStar?.name ?? '未知宫位';
    const viewLabel = selectedSiHua.view === 'daxian' ? '大限' : '流年';
    const prompt = `请分析【${viewLabel}${selectedSiHua.starName}化${selectedSiHua.siHua}】的飞化影响，按以下结构输出：

**【化${selectedSiHua.siHua}基本含义】**
化${selectedSiHua.siHua}在倪海夏体系中的核心含义，以及${selectedSiHua.starName}化${selectedSiHua.siHua}的特殊含义。

**【落宫影响】**
${selectedSiHua.starName}化${selectedSiHua.siHua}落在【${palaceName}】，该宫主管的领域受到何种影响，倪师如何解读。

**【三方四正飞化路径】**
化${selectedSiHua.siHua}入${palaceName}后，对其三方四正（对宫、两个三合宫）的联动影响。

**【当前运势影响】**
在${viewLabel}时间维度下，此化${selectedSiHua.siHua}对命主近期运势的具体影响。

**【实际建议】**
基于此四化的具体可操作建议。`;
    setActiveSection('analysis');
    setScopeKey(null); // 专项 tab 属于本命 13 维线程，退出运限视图
    if (!deepAllowed) {
      setLockedTopic('四化飞化');
      return;
    }
    setActiveTab(ADVISORY);
    if ((threadsRef.current[ADVISORY]?.length ?? 0) === 0) {
      generateAnalysis(prompt, ADVISORY, 'deep');
    }
  }, [selectedSiHua]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 命盘分析：选择维度标签 ──
  function selectAnalysisTab(topicKey: string, autoGenerate = false) {
    const topic = TOPICS.find(t => t.key === topicKey);
    if (topic?.locked && !deepAllowed) {
      setLockedTopic(topic.label);
      return;
    }
    setScopeKey(null); // 点本命维度标签 → 退出运限解读视图
    setActiveTab(topicKey);
    if (!autoGenerate) return;
    if ((threadsRef.current[topicKey]?.length ?? 0) === 0) {
      const plan = topic?.locked ? 'deep' : 'free';
      generateAnalysis(TOPIC_PROMPTS[topicKey] ?? '', topicKey, plan);
    }
  }

  const handleTabClick = (topicKey: string) => {
    setActiveSection('analysis');
    selectAnalysisTab(topicKey, true);
  };

  // ── 命盘分析：请求生成（native = 本命 13 维写 threads；scope = 运限写 scopeThreads）──
  async function generateAnalysis(
    prompt: string,
    key: string,
    plan: 'free' | 'deep',
    opts?: { store?: AnalysisStore; extraBody?: Record<string, unknown> },
  ) {
    const store = opts?.store ?? 'native';
    if (loadingRef.current) {
      // 解读进行中：暂存最后一次请求（覆盖更早的），当前解读结束后自动执行
      pendingGenerateRef.current = { prompt, key, plan, store, extraBody: opts?.extraBody };
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    setLoadingTab(key);

    // 按 store 分派线程写入（scope 线程不写回历史：onThreadsChange 只监听 threads）
    const patchThreads = (updater: (arr: Message[]) => Message[]) => {
      const patch = (prev: Record<string, Message[]>) => ({ ...prev, [key]: updater(prev[key] ?? []) });
      if (store === 'scope') setScopeThreads(patch);
      else setThreads(patch);
    };

    const userMsg: Message = { role: 'user', content: prompt, hidden: true };
    patchThreads(arr => [...arr, userMsg]);

    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart, messages: [userMsg], plan, uid, ...(opts?.extraBody ?? {}) }),
      });
      if (res.status === 402) {
        setLoading(false); setLoadingTab(null); loadingRef.current = false;
        setLockedTopic(TOPICS.find(t => t.key === key)?.label ?? (store === 'scope' ? scopeThreadTitle(key) : '专业版解读'));
        patchThreads(arr => arr.filter(m => m !== userMsg));
        return;
      }
      if (!res.ok) throw new Error('请求失败');
      if (!res.body) throw new Error('无响应流');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      patchThreads(arr => [...arr, { role: 'assistant', content: '' }]);

      let sseBuffer = ''; // 跨 chunk 拼接不完整行，避免 data 行被网络分包截断后整行丢失
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        sseBuffer += chunk;
        const parts = sseBuffer.split('\n');
        sseBuffer = parts.pop() ?? ''; // 保留最后一个不完整行，下一包拼接
        for (const line of parts) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const delta = JSON.parse(data).delta?.text ?? '';
            assistantText += delta;
            patchThreads(arr => {
              const a = [...arr];
              a[a.length - 1] = { role: 'assistant', content: assistantText };
              return a;
            });
          } catch { /* skip */ }
        }
      }
    } catch {
      patchThreads(arr => [...arr, { role: 'assistant', content: '解读失败，请稍后重试。' }]);
    } finally {
      setLoading(false);
      setLoadingTab(null);
      loadingRef.current = false;
      // 排队：执行解读期间被拦截的那次请求
      if (pendingGenerateRef.current) {
        const next = pendingGenerateRef.current;
        pendingGenerateRef.current = null;
        generateAnalysis(next.prompt, next.key, next.plan, { store: next.store, extraBody: next.extraBody });
      }
    }
  }

  // ── AI 对话：发送消息 ──
  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatLoadingRef.current) return;
    if (!deepAllowed) {
      setLockedTopic('AI 对话');
      return;
    }

    setChatInput('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);
    chatLoadingRef.current = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, chart, message: text, reset: chatNeedsReset }),
      });
      if (chatNeedsReset) setChatNeedsReset(false);

      if (res.status === 402) {
        setChatLoading(false); chatLoadingRef.current = false;
        setLockedTopic('AI 对话');
        return;
      }
      if (!res.ok) throw new Error('请求失败');
      if (!res.body) throw new Error('无响应流');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      let sseBuffer = ''; // 跨 chunk 拼接不完整行，避免 data 行被网络分包截断后整行丢失
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        sseBuffer += chunk;
        const parts = sseBuffer.split('\n');
        sseBuffer = parts.pop() ?? ''; // 保留最后一个不完整行，下一包拼接
        for (const line of parts) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const delta = JSON.parse(data).delta?.text ?? '';
            assistantText += delta;
            setChatMessages(prev => {
              const arr = [...prev];
              arr[arr.length - 1] = { role: 'assistant', content: assistantText };
              return arr;
            });
          } catch { /* skip */ }
        }
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'AI 对话失败，请稍后重试。' }]);
    } finally {
      setChatLoading(false);
      chatLoadingRef.current = false;
    }
  }

  // MVP 体验激活
  const activateDemo = async () => {
    try {
      await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }) });
      setDeepAllowed(true);
    } catch { /* ignore */ }
    setLockedTopic(null);
  };

  // 渲染辅助（thread 感知运限视图：scopeKey 非空 → 显示运限线程）
  const showAdvisory = activeTab === ADVISORY || (threads[ADVISORY]?.length ?? 0) > 0;
  const tabs = [...TOPICS, ...(showAdvisory ? [{ key: ADVISORY, label: '专项', locked: false }] : [])];
  const activeLabel = tabs.find(t => t.key === activeTab)?.label ?? '命理';
  const viewingScope = scopeKey !== null;
  // scope 模式：activeTab 通常不匹配 scopeKey（dx-3 / ln-2026），标签行高亮退化为"无"
  const thread = viewingScope
    ? (scopeThreads[scopeKey ?? ''] ?? [])
    : (threads[activeTab] ?? []);
  const threadTitle = viewingScope
    ? (scopeMeta?.key === scopeKey ? (scopeMeta.shortLabel ?? '运限解读') : scopeThreadTitle(scopeKey ?? ''))
    : activeLabel;
  const isGenerating = loadingTab === (viewingScope ? scopeKey : activeTab) && thread.length === 0;
  const radarData = useMemo(() => computeRadar(chart), [chart]);

  return (
    <div className="flex flex-col rounded-xl overflow-hidden card-glass" style={{ maxHeight: 'calc(100vh + 100px)', minHeight: 360 }}>

      {/* ── 顶部栏目切换：命盘分析 / AI 对话 ── */}
      <div className="flex-shrink-0 flex items-center px-3 pt-2.5 pb-2 gap-2" style={{ borderBottom: '1px solid var(--t-border)' }}>
        {(['analysis', 'chat'] as const).map((sec) => (
          <button
            key={sec}
            onClick={() => setActiveSection(sec)}
            className="px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all"
            style={{
              background: activeSection === sec ? 'rgba(212,168,67,0.12)' : 'transparent',
              border: `1px solid ${activeSection === sec ? 'rgba(212,168,67,0.35)' : 'var(--t-border)'}`,
              color: activeSection === sec ? 'var(--t-gold)' : 'var(--t-text2)',
            }}
          >
            {sec === 'analysis' ? '命盘分析' : 'AI 对话'}
          </button>
        ))}
      </div>

      {activeSection === 'analysis' && (
        <>
          {/* ── 雷达图 ── */}
          <div className="flex-shrink-0 px-2 pt-2.5 pb-1.5 flex flex-col items-center" style={{ borderBottom: '1px solid var(--t-border)' }}>
            <RadarChart data={radarData} size={240} />
            <p className="text-[9px] mt-1 tracking-wider" style={{ color: 'var(--t-faint)' }}>
              点维度标签查看免费解读 · 剩余维度需升级专业版
            </p>
          </div>

          {/* ── 运限解读入口卡（大限/流年视图下出现；本命视图 scopeMeta=null 不渲染）── */}
          {scopeMeta && (
            <div className="flex-shrink-0 px-2 pt-1.5 pb-1.5">
              <button
                onClick={handleScopeAnalyze}
                disabled={loading && loadingTab === scopeMeta.key}
                className="w-full rounded-lg px-3 py-2 text-left transition-all hover:scale-[1.01] disabled:opacity-60"
                style={{
                  background: scopeKey === scopeMeta.key ? 'rgba(212,168,67,0.10)' : 'rgba(212,168,67,0.05)',
                  border: `1px solid ${scopeKey === scopeMeta.key ? 'rgba(212,168,67,0.5)' : 'rgba(212,168,67,0.25)'}`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--t-gold)' }}>
                    {scopeMeta.label}
                  </span>
                  <span className="text-[9px] flex-shrink-0 px-2 py-0.5 rounded-md font-medium"
                    style={{
                      background: 'rgba(212,168,67,0.15)',
                      color: loading && loadingTab === scopeMeta.key ? 'var(--t-faint)' : 'var(--t-gold)',
                    }}
                  >
                    {loading && loadingTab === scopeMeta.key
                      ? '生成中…'
                      : (scopeThreads[scopeMeta.key]?.length ?? 0) > 0
                        ? '重新生成'
                        : '生成解读'}
                  </span>
                </div>
                <div className="text-[9px] mt-1 leading-relaxed" style={{ color: 'var(--t-faint)' }}>
                  {scopeMeta.sub}
                </div>
              </button>
            </div>
          )}

          {/* ── 维度标签 ── */}
          <div className="flex-shrink-0 px-2 pt-2 pb-2 flex flex-wrap gap-1" style={{ borderBottom: '1px solid var(--t-border)' }}>
            {tabs.map(t => {
              const isActive = activeTab === t.key;
              const isLoading = loadingTab === t.key;
              const tLocked = 'locked' in t && t.locked;
              return (
                <button
                  key={t.key}
                  onClick={() => handleTabClick(t.key)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-lg transition-all duration-150"
                  style={{
                    background: isActive ? 'rgba(212,168,67,0.12)' : 'transparent',
                    border: `1px solid ${isActive ? 'rgba(212,168,67,0.3)' : 'var(--t-border)'}`,
                    color: isActive ? 'var(--t-gold)' : 'var(--t-faint)',
                    opacity: tLocked && !isActive ? 0.55 : 1,
                    cursor: tLocked ? 'not-allowed' : 'pointer',
                  }}
                >
                  {tLocked && <span style={{ fontSize: 8, opacity: 0.6 }}>🔒</span>}
                  {t.label}
                  {isLoading && <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--t-gold)', opacity: 0.7 }} />}
                </button>
              );
            })}
          </div>

          {/* ── 维度解读内容 ── */}
          <div ref={analysisScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {thread.length === 0 ? (
              isGenerating ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="text-4xl mb-3" style={{ color: 'var(--t-gold)', opacity: 0.1 }}>✦</div>
                  <p className="text-[10px] animate-pulse" style={{ color: 'var(--t-faint)' }}>解读生成中…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="text-3xl mb-3" style={{ color: 'var(--t-gold)', opacity: 0.12 }}>✦</div>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>
                    {viewingScope
                      ? `当前为${threadTitle}解读。
点击上方卡片生成（免费），
或切换维度标签回到本命解读。`
                      : activeTab === ADVISORY
                        ? '点击命盘上的宫位或四化徽章，\n专项解读会显示在这里。'
                        : `选择上方维度标签，\n生成对应的${activeLabel}解读。`}
                  </p>
                </div>
              )
            ) : (
              <AnimatePresence initial={false}>
                {thread.map((msg, i) => {
                  if (msg.role === 'user' && msg.hidden) return null;
                  if (msg.role === 'user') {
                    return (
                      <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                        <div className="max-w-[85%] rounded-xl px-3 py-2 text-[11px]" style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.18)', color: 'var(--t-gold)' }}>
                          {msg.content}
                        </div>
                      </motion.div>
                    );
                  }
                  const isLast = i === thread.length - 1;
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="text-[9px] tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--t-faint)' }}>
                        <span style={{ color: 'var(--t-gold)', opacity: 0.4 }}>✦</span>
                        {viewingScope ? threadTitle : `${activeLabel}解读`}
                      </div>
                      <AiContent text={msg.content} streaming={loading && loadingTab === (viewingScope ? scopeKey : activeTab) && isLast} />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </>
      )}

      {activeSection === 'chat' && (
        <>
          {/* ── AI 对话消息区 ── */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {chatMessages.length === 0 && !deepAllowed && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="text-3xl mb-3" style={{ color: 'var(--t-gold)', opacity: 0.12 }}>✦</div>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--t-faint)' }}>
                  AI 对话为专业版功能。<br />
                  可与命理师 AI 就多轮问题进行深入交流，结合本命盘、大限、流年给出解答。
                </p>
                <button
                  onClick={() => setLockedTopic('AI 对话')}
                  className="px-4 py-2 rounded-lg text-[11px] font-medium transition-all"
                  style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.3)', color: 'var(--t-gold)' }}
                >
                  升级专业版
                </button>
              </div>
            )}
            {chatMessages.length === 0 && deepAllowed && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="text-3xl mb-3" style={{ color: 'var(--t-gold)', opacity: 0.12 }}>✦</div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>
                  已向 AI 命理师提供本盘数据，<br />
                  可直接提问："我 2027 年的事业运如何？" 或 "感情中需要注意什么？"
                </p>
              </div>
            )}
            <AnimatePresence initial={false}>
              {chatMessages.map((msg, i) => {
                const isLast = i === chatMessages.length - 1;
                if (msg.role === 'user') {
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                      <div className="max-w-[85%] rounded-xl px-3 py-2 text-[11px]" style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.18)', color: 'var(--t-gold)' }}>
                        {msg.content}
                      </div>
                    </motion.div>
                  );
                }
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="text-[9px] tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--t-faint)' }}>
                      <span style={{ color: 'var(--t-gold)', opacity: 0.4 }}>✦</span>
                      AI 命理师
                    </div>
                    <AiContent text={msg.content} streaming={chatLoading && isLast} />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* ── AI 对话输入框 ── */}
          <div className="flex-shrink-0 px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--t-border)' }}>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                placeholder={deepAllowed ? '输入问题，与 AI 命理师交流…' : '升级专业版后解锁 AI 对话'}
                disabled={!deepAllowed || chatLoading}
                className="flex-1 rounded-lg px-3 py-2 text-[11px] focus:outline-none transition-colors disabled:opacity-50"
                style={{ background: 'var(--t-card)', border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
              />
              <button
                onClick={sendChatMessage}
                disabled={!deepAllowed || chatLoading || !chatInput.trim()}
                className="px-3 py-2 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.25)', color: 'var(--t-gold)' }}
              >
                {chatLoading ? '…' : '发送'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── 升级 modal ── */}
      {lockedTopic && (
        <UpgradeModal topic={lockedTopic} onClose={() => setLockedTopic(null)} onActivate={activateDemo} />
      )}

    </div>
  );
}
