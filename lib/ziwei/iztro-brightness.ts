import { config } from 'iztro/lib/astro';

/**
 * iztro 上游亮度数据修正（针对 iztro@2.6.0）
 *
 * 背景：iztro 内置亮度表里「太阴在酉宫」误标为「不」；主流紫微斗数口诀
 * （《紫微斗数全书》系，倪海厦体系同）应为「旺」——亥子丑庙、酉戌旺、申利、
 * 午未次暗、卯辰巳陷。iztro 其余宫位取值与主流一致，唯独酉宫写错。
 * 证据：node_modules/iztro/lib/data/stars.js 中 taiyinMaj.brightness
 * 从寅起第 8 位（酉）= 'bu'；getBrightness('太阴', 7) 实测输出「不」。
 *
 * 修复方式：iztro 官方 config({ brightness }) 全局覆盖——getBrightness 优先读
 * config.brightness，再回落内置 STARS_INFO。react-iztro 渲染 与 generateChart
 * （astro.bySolar）同走 getBrightness，本模块被 import 一次即两处生效。
 *
 * 注意：config 由 iztro/lib/astro 导出（顶层 iztro 未导出）；key 用中文星名、
 * value 用中文亮度（iztro 的 StarName/Brightness 类型即中文 value 联合，
 * 内部 kot() 会转成 i18n key）。数组从寅宫起，共 12 位。
 */
config({
  brightness: {
    // 太阴十二宫亮度（从寅起）：仅酉宫 不→旺，其余保持 iztro 原值
    太阴: ['旺', '陷', '陷', '陷', '不', '不', '利', '旺', '旺', '庙', '庙', '庙'],
  },
});
