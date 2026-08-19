'use client';
import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import InsightPanel from '@/components/InsightPanel';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
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
 */
export default function ChartPage() {
  const [chart, setChart] = useState<ZiweiChart | null>(null);

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

  // ── 已起盘：react-iztro 星盘 + AI 解读 ──
  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
      <button
        type="button"
        onClick={() => setChart(null)}
        style={{
          marginBottom: 16, padding: '6px 14px', cursor: 'pointer',
          border: '1px solid #ccc', borderRadius: 8, background: 'transparent',
        }}
      >
        ← 重新起盘
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 380px)',
          gap: 20, marginTop: 16, alignItems: 'start',
        }}
      >
        <div className="iztro-theme-host">
          <Iztrolabe
            birthday={`${year}-${month}-${day}`}
            birthTime={hour}
            birthdayType="solar"
            gender={gender}
            lang="zh-CN"
            // 年柱按立春、月柱按节气（正统八字口径）；iztro 默认 normal 按春节/初一，节气边界日期会错位
            options={{ yearDivide: 'exact', horoscopeDivide: 'exact' }}
          />
        </div>
        <InsightPanel chart={chart} />
      </div>
    </main>
  );
}
