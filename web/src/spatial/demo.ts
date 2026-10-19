import type { SceneMode, SceneSpec } from './types';

/**
 * 探索期演示场景：不接模型、不接中继，用固定数据验证空间关系与观感。
 *
 * 这些场景刻意覆盖四类内容：
 * - 高信息密度表格（split）
 * - 图表 + 指标卡（stage）
 * - 3D 场景挂载（immersive）
 * - 单主面板 + 侧栏辅助（focus）
 */

const workOrders = [
  { id: 'WO-2418', title: '笔记本补贴申领', owner: '李工', status: { text: '处理中', tone: 'warn' }, age: '10 分钟前' },
  { id: 'WO-2417', title: '差旅报销复核', owner: '王敏', status: { text: '已完成', tone: 'ok' }, age: '32 分钟前' },
  { id: 'WO-2416', title: '会议室设备报修', owner: '陈琦', status: { text: '待审批', tone: 'warn' }, age: '1 小时前' },
  { id: 'WO-2415', title: '权限变更申请', owner: '赵磊', status: { text: '已完成', tone: 'ok' }, age: '2 小时前' },
  { id: 'WO-2414', title: '供应商资料归档', owner: '周宁', status: { text: '已退回', tone: 'bad' }, age: '3 小时前' },
  { id: 'WO-2413', title: '月度考勤核对', owner: '孙悦', status: { text: '处理中', tone: 'warn' }, age: '4 小时前' },
];

const tableSurface = {
  id: 'orders',
  kind: 'table',
  role: 'focus' as const,
  priority: 0,
  title: '最近工单',
  subtitle: '6 条 · 2 条待审批',
  why: '逐条核对',
  size: { min: [360, 240] as [number, number], pref: [560, 420] as [number, number], max: [1000, 900] as [number, number] },
  data: {
    columns: [
      { key: 'id', label: '编号' },
      { key: 'title', label: '事项' },
      { key: 'owner', label: '申请人' },
      { key: 'status', label: '状态' },
      { key: 'age', label: '更新' },
    ],
    rows: workOrders,
  },
};

const kpiSurface = {
  id: 'kpis',
  kind: 'cards',
  role: 'support' as const,
  priority: 1,
  title: '本月指标',
  size: { min: [220, 150] as [number, number], pref: [300, 220] as [number, number] },
  data: {
    items: [
      { label: '工单量', value: '1,284', delta: '+12.4%', tone: 'up' as const },
      { label: '处理时长', value: '3.2 天', delta: '−8.1%', tone: 'up' as const },
      { label: '待审批', value: '17', delta: '3 项超时', tone: 'down' as const },
      { label: '满意度', value: '96.8%', delta: '+1.2%', tone: 'up' as const },
    ],
  },
};

const trendSurface = {
  id: 'trend',
  kind: 'line',
  role: 'support' as const,
  priority: 2,
  title: '近七日处理量',
  subtitle: '单位：件',
  size: { min: [300, 200] as [number, number], pref: [520, 300] as [number, number] },
  data: {
    labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    series: [
      { name: '处理完成', values: [142, 168, 156, 201, 188, 96, 74] },
      { name: '新受理', values: [166, 174, 182, 196, 211, 88, 62] },
    ],
  },
};

const deptSurface = {
  id: 'dept',
  kind: 'bars',
  role: 'support' as const,
  priority: 2,
  title: '各部门工单分布',
  size: { min: [300, 200] as [number, number], pref: [520, 300] as [number, number] },
  data: {
    labels: ['研发', '市场', '行政', '财务', '客服', '运维'],
    series: [{ name: '工单数', values: [286, 174, 232, 118, 356, 118] }],
  },
};

const scene3dSurface = {
  id: 'map3d',
  kind: 'scene3d',
  role: 'focus' as const,
  priority: 0,
  title: '园区资产空间分布',
  subtitle: '3D 场景 · 只读',
  why: '空间关系',
  size: { min: [480, 320] as [number, number], pref: [1100, 640] as [number, number] },
  data: {
    caption: '楼层 1–6 · 设备 214 台',
    layers: ['楼宇体块', '设备点位', '巡检路径'],
  },
};

const noteSurface = {
  id: 'note',
  kind: 'text',
  role: 'support' as const,
  priority: 2,
  title: '结论',
  size: { min: [220, 140] as [number, number], pref: [300, 240] as [number, number] },
  data: {
    paragraphs: [
      '待审批工单集中在设备报修，平均等待 1.8 天。',
      '建议今天优先处理 3 条超时记录。',
    ],
    bullets: ['WO-2416 等待最久', 'WO-2418 缺附件', '权限变更需二次确认'],
  },
};

export function demoScene(mode: SceneMode): SceneSpec {
  const base = { rev: Date.now() % 100000, transition: 'standard' as const };

  switch (mode) {
    case 'split-left':
      return { ...base, mode, label: 'split-left', surfaces: [tableSurface] };
    case 'split-right':
      return { ...base, mode, label: 'split-right', surfaces: [tableSurface] };
    case 'stage':
      return {
        ...base,
        mode,
        label: 'stage',
        surfaces: [
          { ...trendSurface, role: 'focus', priority: 0 },
          kpiSurface,
          deptSurface,
        ],
      };
    case 'immersive':
      return {
        ...base,
        mode,
        label: 'immersive',
        chat: 'compact',
        surfaces: [
          { ...scene3dSurface, role: 'focus', priority: 0, prefer: 'center' },
          { ...kpiSurface, role: 'support', priority: 1, prefer: 'left' },
          { ...deptSurface, role: 'support', priority: 2, prefer: 'right' },
        ],
      };
    case 'focus':
      return {
        ...base,
        mode,
        label: 'focus',
        surfaces: [tableSurface, kpiSurface, noteSurface],
      };
    case 'companion':
    default:
      return { ...base, mode: 'companion', label: 'companion', surfaces: [] };
  }
}

/**
 * 目前只保留两种空间形态（2026-10-19 用户决定）：
 * - 右分栏：展示少（1 块）时用，左边留给球和对话
 * - 全局：展示多（2 块以上）时用，内容铺满，球保持原尺寸停左下
 *
 * split-left / stage / focus 的实现仍保留在编排器里，但不作为入口暴露。
 */
export const DEMO_MODES: Array<{ value: SceneMode; label: string }> = [
  { value: 'split-right', label: '右分栏' },
  { value: 'immersive', label: '全局' },
];
