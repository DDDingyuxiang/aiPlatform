/**
 * 响应式断点 —— 权威定义（单位 px，min-width 语义）。
 *
 * CSS 媒体查询无法引用 CSS 变量，样式文件中的断点字面量必须与此保持一致：
 *   sm: 640   md: 768   lg: 1024   xl: 1280
 * 修改本文件时必须同步修改使用断点的样式（tokens/base.css 顶部有索引注释）。
 *
 * 语义约定：
 *   < md (768)        移动端：侧边栏收进抽屉，表格转卡片
 *   md ~ lg (768-1023) 平板：侧边栏保持完整（不强制折叠，保证导航可读性）
 *   >= lg (1024)      桌面：完整侧边栏，用户可手动折叠为图标栏
 *   >= xl (1280)      宽屏：内容区可展示更宽的多列布局
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const

export type BreakpointName = keyof typeof BREAKPOINTS
