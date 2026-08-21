'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart, Palace } from '@/lib/ziwei/types';
import type { TimeView } from './TimeNav';
import RadarChart from './RadarChart';
import { computeRadar } from '@/lib/ziwei/radar';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  hidden?: boolean; // don't show user bubble for auto/topic messages
}

interface SelectedSiHua {
  starName: string;
  siHua: string;
  view: TimeView;
}

interface InsightPanelProps {
  chart: ZiweiChart;
  selectedPalace?: Palace | null;
  selectedSiHua?: SelectedSiHua | null;
  /** 历史回载时注入已保存的解读线程（挂载时初始化，仅生效一次） */
  initialThreads?: Record<string, Message[]>;
  /** 线程变化上报（防抖后调用，供父级持久化到历史） */
  onThreadsChange?: (threads: Record<string, Message[]>) => void;
}

/** 专项解读（宫位 / 四化飞化）独立线程，不与 13 个维度混淆 */
const ADVISORY = 'advisory';

/** 13 个主题标签（对齐 Metis 紫微官方：命格总览 + 12 生活主题） */
const TOPICS = [
  { key: 'overview',         label: '命格总览',  locked: false },
  { key: 'wealth',           label: '财运',      locked: false },
  { key: 'career',           label: '事业',      locked: false },
  { key: 'love',             label: '感情',      locked: false },
  { key: 'personality',      label: '性格',      locked: false },
  { key: 'health',           label: '健康',      locked: false },
  // 7 个 LOCKED（专业版才解锁，免费版不可点）
  { key: 'siblings',         label: '兄弟合伙',  locked: true },
  { key: 'children',         label: '子女',      locked: true },
  { key: 'migration',        label: '迁移外出',  locked: true },
  { key: 'interpersonal',    label: '人际贵人',  locked: true },
  { key: 'property',         label: '田宅',      locked: true },
  { key: 'mentality',        label: '福德',      locked: true },
  { key: 'parents',          label: '父母长辈',  locked: true },
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

  // ── 7 个 LOCKED 主题的 prompt 模板（复用现有 6 套的多块结构）──

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

const PALACE_ROLES: Record<string, string> = {
  '命宫':   '自我、性格、先天格局',
  '兄弟宫': '兄弟关系、合伙人',
  '夫妻宫': '感情关系、婚姻状态',
  '子女宫': '子女缘分、下属关系',
  '财帛宫': '财运来源、收入方式',
  '疾厄宫': '身体健康、意外',
  '迁移宫': '外出机遇、人际格局',
  '交友宫': '朋友圈、贵人、小人',
  '官禄宫': '事业成就、社会地位',
  '田宅宫': '不动产、家庭环境',
  '福德宫': '精神享受、内心福分',
  '父母宫': '父母关系、文书契约',
};

/** 升级专业版提示 modal（LOCKED 主题点击触发） */
// 开发期开关：true = LOCKED 主题点击直接进入(不弹窗); 后期做付费时改为 false
const DEV_BYPASS_LOCKED = true;

function UpgradeModal({ topic, onClose }: { topic: string; onClose: () => void }) {
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
            {topic} · 专业版解读
          </h3>
          <p className="text-[11px] leading-relaxed mb-4" style={{ color: 'var(--t-text2)' }}>
            「{topic}」属于专业版解读，需升级后查看完整内容。<br />
            升级后可解锁：十三宫全维解读 · 倪师批注 · 大限流年流月流日时辰多层对照。
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg text-[11px] font-medium transition-all"
              style={{
                background: 'transparent',
                border: '1px solid var(--t-border)',
                color: 'var(--t-text2)',
              }}
            >
              稍后
            </button>
            <button
              onClick={() => {
                window.location.href = '/pricing';
                onClose();
              }}
              className="flex-1 px-4 py-2 rounded-lg text-[11px] font-medium transition-all"
              style={{
                background: 'rgba(212,168,67,0.18)',
                border: '1px solid rgba(212,168,67,0.4)',
                color: 'var(--t-gold)',
              }}
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
              <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--t-gold)' }}>
                【{sectionMatch[1]}】
              </span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>
            {parts.map((part, j) =>
              j % 2 === 0
                ? part
                : <strong key={j} className="font-medium" style={{ color: 'var(--t-text)' }}>{part}</strong>
            )}
          </div>
        );
      })}
      {streaming && (
        <span
          className="inline-block w-1.5 h-3 ml-0.5 animate-pulse rounded-sm align-middle"
          style={{ background: 'var(--t-gold)', opacity: 0.6 }}
        />
      )}
    </div>
  );
}

export default function InsightPanel({ chart, selectedPalace, selectedSiHua, initialThreads, onThreadsChange }: InsightPanelProps) {
  // 每维度独立线程：key 为维度 key（6 个主题 + 专项）。历史回载时用已存线程初始化
  const [threads, setThreads] = useState<Record<string, Message[]>>(() => initialThreads ?? {});
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTab, setLoadingTab] = useState<string | null>(null);

  const threadsRef = useRef<Record<string, Message[]>>(initialThreads ?? {}); // always-current copy for closures
  const loadingRef = useRef(false);
  const pendingRef = useRef<{ tab: string; text: string } | null>(null); // loading 期间排队
  const lastPalaceBranch = useRef<number | undefined>(undefined);
  const lastSiHuaKey = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep refs in sync
  useEffect(() => { threadsRef.current = threads; }, [threads]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // 线程变化上报（400ms 防抖：流式期间每帧都在 setThreads，直接写会刷爆 localStorage）
  useEffect(() => {
    if (!onThreadsChange) return;
    const t = setTimeout(() => onThreadsChange(threads), 400);
    return () => clearTimeout(t);
  }, [threads, onThreadsChange]);

  // Auto-scroll（只在当前维度的线程内滚动，不撑长整页）
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [threads, activeTab]);

  // 不再挂载即自动生成解读（历史回载/首屏都只显示盘面 + 空面板，由用户点维度触发）

  // 盘面宫位 → 主题 tab 映射（对齐 Metis 紫微官方行为：点宫位切到对应主题）
  const PALACE_TO_TOPIC: Record<string, string> = {
    '命宫':   'personality',
    '兄弟宫': 'siblings',
    '夫妻宫': 'love',
    '子女宫': 'children',
    '财帛宫': 'wealth',
    '疾厄宫': 'health',
    '迁移宫': 'migration',
    '交友宫': 'interpersonal',
    '官禄宫': 'career',
    '田宅宫': 'property',
    '福德宫': 'mentality',
    '父母宫': 'parents',
  };

  // Inject palace analysis when palace selected → 切到对应主题 tab（不占专项）
  useEffect(() => {
    if (!selectedPalace || selectedPalace.branch === lastPalaceBranch.current) return;
    lastPalaceBranch.current = selectedPalace.branch;

    const topicKey = PALACE_TO_TOPIC[selectedPalace.name] ?? 'overview';
    const topic = TOPICS.find(t => t.key === topicKey);
    if (topic?.locked && !DEV_BYPASS_LOCKED) {
      setLockedTopic(topic.label);
      return;
    }
    setActiveTab(topicKey);
    // 如果该主题还没 thread,触发首次生成
    const has = (threadsRef.current[topicKey]?.length ?? 0) > 0;
    if (!has) sendMessage(TOPIC_PROMPTS[topicKey] ?? '', true, topicKey);
  }, [selectedPalace]); // eslint-disable-line react-hooks/exhaustive-deps

  // 注入四化飞化分析 → 归入「专项」线程
  useEffect(() => {
    if (!selectedSiHua) return;
    const key = `${selectedSiHua.starName}-${selectedSiHua.siHua}-${selectedSiHua.view}`;
    if (key === lastSiHuaKey.current) return;
    lastSiHuaKey.current = key;

    const palaceOfStar = chart.palaces.find(p =>
      p.stars.some(s => s.name === selectedSiHua.starName)
    );
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

    setActiveTab(ADVISORY);
    sendMessage(prompt, true, ADVISORY);
  }, [selectedSiHua]); // eslint-disable-line react-hooks/exhaustive-deps

  const streamResponse = async (
    apiMessages: { role: 'user' | 'assistant'; content: string }[],
    tabKey: string,
  ) => {
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart, messages: apiMessages }),
      });
      if (!res.ok) throw new Error('请求失败');
      if (!res.body) throw new Error('无响应流');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      setThreads(prev => ({ ...prev, [tabKey]: [...(prev[tabKey] ?? []), { role: 'assistant', content: '' }] }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const delta = JSON.parse(data).delta?.text ?? '';
            assistantText += delta;
            setThreads(prev => {
              const arr = [...(prev[tabKey] ?? [])];
              arr[arr.length - 1] = { role: 'assistant', content: assistantText };
              return { ...prev, [tabKey]: arr };
            });
          } catch { /* skip */ }
        }
      }
    } catch {
      setThreads(prev => ({
        ...prev,
        [tabKey]: [...(prev[tabKey] ?? []), { role: 'assistant', content: '解读失败，请稍后重试。' }],
      }));
    } finally {
      setLoading(false);
      setLoadingTab(null);
      loadingRef.current = false;
      // 发送排队中的消息（用户在 loading 期间输入的问题）
      if (pendingRef.current) {
        const next = pendingRef.current;
        pendingRef.current = null;
        sendMessage(next.text, false, next.tab);
      }
    }
  };

  const sendMessage = (text: string, hidden = false, tabKey: string = activeTab) => {
    if (!text.trim()) return;
    // loading 期间不丢弃：排队，等当前流式结束后自动发送
    if (loadingRef.current) {
      pendingRef.current = { tab: tabKey, text };
      setInput('');
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    setLoadingTab(tabKey);

    const userMsg: Message = { role: 'user', content: text, hidden };
    // Capture current messages of this tab synchronously via ref (avoids stale closure)
    const cur = threadsRef.current[tabKey] ?? [];
    const apiMessages = [...cur, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    setThreads(prev => ({ ...prev, [tabKey]: [...(prev[tabKey] ?? []), userMsg] }));
    setInput('');
    streamResponse(apiMessages, tabKey);
  };

  // 点击维度标签：切换并显示该维度；若尚未生成则触发生成；LOCKED 弹升级提示(开发期直通)
  const [lockedTopic, setLockedTopic] = useState<string | null>(null);

  const handleTabClick = (topicKey: string) => {
    const topic = TOPICS.find(t => t.key === topicKey);
    if (topic?.locked && !DEV_BYPASS_LOCKED) {
      setLockedTopic(topic.label);
      return;
    }
    setActiveTab(topicKey);
    if (topicKey === ADVISORY) return; // 专项标签只在有内容时出现，不主动生成
    const has = (threads[topicKey]?.length ?? 0) > 0;
    if (!has) sendMessage(TOPIC_PROMPTS[topicKey] ?? '', true, topicKey);
  };

  const handleSend = () => {
    sendMessage(input, false, activeTab);
  };

  // 标签集合：6 个免费维度 + 7 个 LOCKED + 专项（有内容或当前激活时显示）
  const showAdvisory = activeTab === ADVISORY || (threads[ADVISORY]?.length ?? 0) > 0;
  const tabs = [...TOPICS, ...(showAdvisory ? [{ key: ADVISORY, label: '专项', locked: false }] : [])];
  const activeLabel = tabs.find(t => t.key === activeTab)?.label ?? '命理';
  const thread = threads[activeTab] ?? [];
  const isGenerating = loadingTab === activeTab && thread.length === 0;

  // 雷达图数据：从本盘主星庙旺与格局推算 5 维 + 综合
  const radarData = useMemo(() => computeRadar(chart), [chart]);

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden card-glass"
      style={{ maxHeight: 'calc(100vh - 170px)', minHeight: 360 }}
    >

      {/* ── 5 维雷达图（命盘分析顶部固定显示） ── */}
      <div className="flex-shrink-0 px-2 pt-2.5 pb-1.5 flex flex-col items-center" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <RadarChart data={radarData} size={240} />
        <p className="text-[9px] mt-1 tracking-wider" style={{ color: 'var(--t-faint)' }}>
          点维度标签可查看对应解读 · 六维强度依本盘星曜庙旺与格局推算，仅供参考
        </p>
      </div>

      {/* ── 维度标签（切换独立面板） ── */}
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
                color: isActive ? 'var(--t-gold)' : (tLocked ? 'var(--t-faint)' : 'var(--t-faint)'),
                opacity: tLocked && !isActive ? 0.55 : 1,
                cursor: tLocked ? 'not-allowed' : 'pointer',
              }}
            >
              {tLocked && <span style={{ fontSize: 8, opacity: 0.6 }}>🔒</span>}
              {t.label}
              {isLoading && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: 'var(--t-gold)', opacity: 0.7 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── 当前维度线程（内部滚动，不撑长整页） ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">

        {/* 空 / 生成中 状态 */}
        {thread.length === 0 && (
          isGenerating ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-4xl mb-3" style={{ color: 'var(--t-gold)', opacity: 0.1 }}>✦</div>
              <p className="text-[10px] animate-pulse" style={{ color: 'var(--t-faint)' }}>解读生成中…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="text-3xl mb-3" style={{ color: 'var(--t-gold)', opacity: 0.12 }}>✦</div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>
                {activeTab === ADVISORY
                  ? '点击命盘上的宫位或四化徽章，\n专项解读会显示在这里。'
                  : `选择上方维度标签，\n生成对应的${activeLabel}解读。`}
              </p>
            </div>
          )
        )}

        <AnimatePresence initial={false}>
          {thread.map((msg, i) => {
            if (msg.role === 'user' && msg.hidden) return null;

            if (msg.role === 'user') {
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <div
                    className="max-w-[85%] rounded-xl px-3 py-2 text-[11px]"
                    style={{
                      background: 'rgba(212,168,67,0.08)',
                      border: '1px solid rgba(212,168,67,0.18)',
                      color: 'var(--t-gold)',
                    }}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              );
            }

            // Assistant message
            const isLastMsg = i === thread.length - 1;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div
                  className="text-[9px] tracking-widest mb-2 flex items-center gap-1.5"
                  style={{ color: 'var(--t-faint)' }}
                >
                  <span style={{ color: 'var(--t-gold)', opacity: 0.4 }}>✦</span>
                  {activeLabel}解读
                </div>
                <AiContent text={msg.content} streaming={loading && loadingTab === activeTab && isLastMsg} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--t-border)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={loading ? '正在解读中，输入后自动排队…' : `向「${activeLabel}」继续追问…`}
            className="flex-1 rounded-lg px-3 py-2 text-[11px] focus:outline-none transition-colors"
            style={{
              background: 'var(--t-card)',
              border: '1px solid var(--t-border)',
              color: 'var(--t-text)',
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(212,168,67,0.15)',
              border: '1px solid rgba(212,168,67,0.25)',
              color: 'var(--t-gold)',
            }}
          >
            {loading ? '…' : '追问'}
          </button>
        </div>
      </div>

      {/* ── 升级专业版 modal（LOCKED 主题点击触发） ── */}
      {lockedTopic && (
        <UpgradeModal topic={lockedTopic} onClose={() => setLockedTopic(null)} />
      )}

    </div>
  );
}
