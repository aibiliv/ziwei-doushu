'use client';
// 5 维雷达图：SVG 实现，对齐 Metis 紫微「事业/财运/感情/性格/健康 + 综合」
// 每维带主星标注（例：事业-太阴），五边形 + 数据多边形
import type { RadarData } from '@/lib/ziwei/radar';

interface RadarChartProps {
  data: RadarData;
  size?: number;
}

const SIZE_DEFAULT = 280;
const CX = SIZE_DEFAULT / 2;
const CY = SIZE_DEFAULT / 2;
const R = 95;            // 数据多边形最大半径
const RING_R = 95;       // 五边形外环半径

// 5 维均匀分布：上、右下、右上、左下、左上（事业-12点、其他顺时针）
const ANGLES = [
  -Math.PI / 2,                    // 事业
  -Math.PI / 2 + (2 * Math.PI / 5),
  -Math.PI / 2 + (4 * Math.PI / 5),
  -Math.PI / 2 + (6 * Math.PI / 5),
  -Math.PI / 2 + (8 * Math.PI / 5),
];

function point(angle: number, radius: number) {
  return {
    x: CX + Math.cos(angle) * radius,
    y: CY + Math.sin(angle) * radius,
  };
}

function ringPath(r: number) {
  return ANGLES.map(a => point(a, r)).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';
}

function dataPath(values: number[]) {
  return ANGLES.map((a, i) => {
    const r = (values[i] / 100) * R;
    const p = point(a, r);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(' ') + ' Z';
}

export default function RadarChart({ data, size = SIZE_DEFAULT }: RadarChartProps) {
  const { dimensions, overall } = data;
  const values = dimensions.map(d => d.score);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${SIZE_DEFAULT} ${SIZE_DEFAULT}`}
        width={size}
        height={size}
        className="block"
      >
        {/* 三层背景五边形（25% / 50% / 75% / 100%） */}
        {[0.25, 0.5, 0.75, 1].map(scale => (
          <path
            key={scale}
            d={ringPath(RING_R * scale)}
            fill="none"
            stroke="var(--t-border)"
            strokeWidth={scale === 1 ? 1 : 0.5}
            opacity={scale === 1 ? 0.5 : 0.3}
          />
        ))}

        {/* 5 条辐射轴 */}
        {ANGLES.map((a, i) => {
          const p = point(a, RING_R);
          return (
            <line
              key={i}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke="var(--t-border)"
              strokeWidth={0.5}
              opacity={0.4}
            />
          );
        })}

        {/* 数据多边形 */}
        <path
          d={dataPath(values)}
          fill="rgba(212,168,67,0.18)"
          stroke="var(--t-gold)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* 数据点 */}
        {ANGLES.map((a, i) => {
          const p = point(a, (values[i] / 100) * R);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="var(--t-gold)"
            />
          );
        })}

        {/* 维度标签 + 主星（外侧） */}
        {dimensions.map((d, i) => {
          const a = ANGLES[i];
          const labelPt = point(a, RING_R + 24);
          const starPt = point(a, RING_R + 38);
          return (
            <g key={d.key}>
              <text
                x={labelPt.x}
                y={labelPt.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={500}
                fill="var(--t-text)"
              >
                {d.label}
              </text>
              <text
                x={starPt.x}
                y={starPt.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--t-gold)"
                opacity={0.75}
              >
                {d.starName}
              </text>
            </g>
          );
        })}

        {/* 中心综合分数 */}
        <text
          x={CX}
          y={CY - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fill="var(--t-faint)"
          letterSpacing={2}
        >
          综合
        </text>
        <text
          x={CX}
          y={CY + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={18}
          fontWeight={600}
          fill="var(--t-gold)"
        >
          {overall}
        </text>
      </svg>
    </div>
  );
}
