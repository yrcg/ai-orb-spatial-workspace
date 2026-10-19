# AI 编排的空间工作区（探索分支）

> 分支：`feat/ai-spatial-workspace`
> 状态：**探索性实现，默认关闭，未合并主线**
> 目标：验证「AI 决定展示什么 → 系统决定放在哪、多大、球让到哪」这一交互范式在语音桌宠里的观感。

---

## 1. 它解决什么问题

传统界面是「人预先设计布局，用户去适应」。这里反过来：

- **AI 只表达意图**：展示什么、有多重要、偏好哪一侧；
- **确定性布局引擎（SLO）决定几何**：位置、尺寸、球体位姿、过渡方式；
- **空间本身成为可编排资源**：球可以移动到左下、缩小、让出整块区域，甚至进入全屏。

关键约束：**模型永远不输出 `x / y / width / height`**。一旦让模型给坐标，
同一句话两次布局就会不同，也无法复现和测试。

---

## 2. 架构

```
语音 / 文本
   │
   ├─► ① 语义路由（未接入，后续 P2）：决定是否需要视觉、用哪种展示源
   │
   └─► ② SceneSpec ──────────────┐
         规范化 / 校验            │  web/src/spatial/spec.ts
                                  ▼
                        ③ Spatial Layout Orchestrator
                          区域分配 → 尺寸收敛 → 球体让位 → 过渡
                          web/src/spatial/orchestrator.ts
                                  │
                                  ▼
                        ④ <ai-spatial-stage> 舞台
                          挂载渲染器 / FLIP 过渡 / 折叠 chip
                          web/src/spatial/stage.ts
                                  │
                   ┌──────────────┴──────────────┐
                   ▼                             ▼
          Renderer Registry               orb.setSpatialPlan()
          （怎么画）                       （球在哪、对话区在哪）
```

### 目录

| 文件 | 职责 |
|---|---|
| `web/src/spatial/types.ts` | 协议类型（SceneSpec / SurfaceSpec / LayoutPlan） |
| `web/src/spatial/spec.ts` | 不可信输入 → 安全 SceneSpec（不抛异常） |
| `web/src/spatial/orchestrator.ts` | 纯函数布局引擎（无 DOM / 无时间 / 无随机） |
| `web/src/spatial/stage.ts` | `<ai-spatial-stage>` Web Component |
| `web/src/spatial/renderers/base.ts` | RendererAdapter 接口 + 注册表 |
| `web/src/spatial/renderers/basic.ts` | table / cards / text |
| `web/src/spatial/renderers/charts.ts` | bars / line（零依赖 SVG） |
| `web/src/spatial/renderers/media.ts` | scene3d（等距园区占位）/ html（沙箱） |
| `web/src/spatial/sources.ts` | SourceAdapter 接口 + 注册表 |
| `web/src/spatial/demo.ts` | 六种模式的演示场景 |
| `web/src/spatial/index.ts` | 宿主接线（SpatialWorkspace） |

---

## 3. 场景协议

```ts
interface SceneSpec {
  rev: number;
  mode: 'companion' | 'split-left' | 'split-right' | 'stage' | 'immersive' | 'focus';
  surfaces: SurfaceSpec[];
  focusId?: string | null;
  orb?: { maxDiameterPx?: number; pinned?: boolean; hidden?: boolean };
  chat?: 'center' | 'compact' | 'hidden';
  transition?: 'gentle' | 'standard' | 'cinematic';
  provenance?: { turnId?: string; route?: string; confidence?: number };
}

interface SurfaceSpec {
  id: string;
  kind: string;                  // 必须是已注册的 renderer
  role?: 'focus' | 'support' | 'ambient' | 'control' | 'dialogue';
  priority?: 0 | 1 | 2 | 3;
  title?: string;
  prefer?: 'auto' | 'left' | 'right' | 'center' | 'corner' | 'rail';
  size?: { min?: [number, number]; pref?: [number, number]; max?: [number, number] };
  source?: string;               // 'inline' | 'mock' | 自定义 SourceAdapter
  permissions?: { maxAreaPct?: number; fullscreen?: boolean; ttlMs?: number };
  why?: string;                  // 解释与回放用
}
```

### 当前只开放两种空间形态

| mode | 什么时候用 | 空间关系 | 球的位置 |
|---|---|---|---|
| `split-right` | 只有 1 块内容 | 左边：对话列 + 球；右边：内容 | 对话列下方，**原尺寸** |
| `immersive` | 2 块及以上 | 主区 + 右侧栏铺满整屏；对话变底部字幕 | 左下，**原尺寸** |

**球体不缩小。** 早期版本会在 stage/immersive 把球缩到 55–66px，观感上"主角消失了"，
所以改成保持活跃态原尺寸（`vh × 0.224`），只通过移动让位。
右分栏空间不够时，球心会被推到该列左边缘——这就是"左移让位"。

`split-left / stage / focus` 的实现仍保留在编排器里（有需要可以重新开放），
但不作为入口暴露，避免模式过多导致选择困难。

`companion` 若带了 surfaces，会自动升级为 `split-right`，避免"有内容却没槽位"。

---

## 4. 布局引擎的关键决策

1. **离散区域优先，不做全局约束求解。**
   「放哪一侧」是离散决策，用连续求解会产生小数坐标和跨轮漂移。
   区域内再按 first-fit + 尺寸收敛，亚毫秒级且可复现。

2. **球体安全区是硬禁区，但不废掉整个槽位。**
   球停在左下时，`avoidOrb()` 从矩形里切掉相交部分，保留面积最大的可行方案。
   早期版本直接判整个槽位不可用，导致主表格被挤进 400px 侧栏——这是同类系统最常见的布局 bug。

3. **focus 铺满，support 高度铺满。**
   宽度按 pref 收敛避免"一张小卡片漂在大空场"，高度必须铺满，
   否则 4 条指标会被裁成 2 条，看起来像故障而不是留白。

4. **折叠而不是消失。**
   空间不足时 surface 进入 `collapsed`，渲染成底部 chip；点击 chip 会把它提为 focus。

5. **内容晚到不改布局。**
   异步 SourceAdapter 返回时只更新内容，不重新规划几何。

---

## 5. 视觉语言：无边界漂浮

探索期的第一版是"卡片化仪表盘"，被否掉了——那是烂大街的后台形态。
现行规则：

- **没有卡片底、没有描边、没有投影**；
- 边框用 `mask-image` 双向羽化，内容像从模糊背景里浮出来；
- 只保留一条极淡的色雾（左上蓝、右下更淡）制造体积感；
- 标题是 10–12px、大字距的细字，不抢数据；
- 表格没有表头色带，只有一条细线；行分隔极淡；
- 图表没有整张网格，只留基线与首/中/尾刻度；
- **每张图只强调一个峰值**（圆环 + 数值），其余数据用低对比度；
- 3D 场景用等距建筑群而不是 wireframe 立方体，才有纵深。

主题 token 与球体一致：`--sp-text / --sp-dim / --sp-faint / --sp-accent / --sp-series-1..4`。

---

## 6. 图表从哪里来：Markdown 捕获

### 为什么不用「视觉路由模型」

原本的设计是独立一次视觉路由调用（分类 → 选渲染器 → 生成 SceneSpec）。
它更灵活，但代价是：多一次模型调用、多一套提示词与 schema、以及**必须在语音回答之后并行跑**，
否则会拖慢第一声。

现在的做法（用户提议，已实现）更简单：

1. **只在检索工具上启用**。空间工作区打开时，`/kb?…&v=1` 给知识库智能体追加一段图表协议；
   关闭时请求参数与主线完全一致。
2. **智能体在正文之后追加一个 `chart` 围栏**：

   ```
   本月工单 1284 件，比上月增长 12.4%。

   ```chart
   title: 各部门工单分布
   type: bars
   unit: 件
   | 部门 | 工单数 |
   | --- | --- |
   | 研发 | 286 |
   | 市场 | 174 |
   ```
   ```

3. **中继在回灌语音模型之前剥离图表块**。
   这是整个方案的关键：语音模型只拿到正文，不会念出 JSON 或表格，
   也不会因为数据占满上下文而把回答说散。
4. **前端捕获并渲染**。`web/src/spatial/chartMarkdown.ts` 负责解析，
   1 块 → 右分栏，2 块及以上 → 全局。

### 支持的格式

- `type: bars | line | table`，配 key-value 头（`title / type / unit / subtitle`）；
- 也可以直接给 JSON：`{ "type": "line", "labels": [...], "series": [...] }`；
- 表格首列作标签，其余数值列自动成为系列；
- 千分位、百分号会被清理成数字；
- **未闭合围栏**（流式输出中途）会被识别并截断，数据不会漏进正文；
- 格式不合法时只丢这一块，正文照常保留。

### 已知代价

知识库结果处在「语音模型等它才能开口」的路径上。让检索智能体多输出一段表格
会略微增加等待，所以：

- 只有工作区打开时才请求图表；
- 提示词明确要求"正文保持简洁、图表块只放数据"；
- 后续可以改成**旁路**：正文照常返回，图表用第二次调用异步补齐（见路线图 P2）。

## 7. 扩展点

### 新增展示源（怎么画）

```ts
import { registerRenderer } from './spatial/renderers';

registerRenderer({
  kind: 'timeline',
  capabilities: {
    min: [320, 160],
    pref: [640, 300],
    interaction: 'hover',
    cost: 'low',
    fullscreen: true,
  },
  create: () => ({
    el: document.createElement('div'),
    update(spec, size) { /* 按 size 重绘 */ },
    dispose() { /* 清理 */ },
  }),
});
```

`capabilities` 同时用于：SLO 判断放不放得下，以及未来生成提示词时告诉模型"当前有哪些能力"。

### 新增内容来源（从哪来）

```ts
import { registerSource } from './spatial/sources';

registerSource({
  type: 'mcp-chart',
  resolve: async (spec, signal) => {
    const res = await fetch('/api/chart', { method: 'POST', body: JSON.stringify(spec.data), signal });
    return res.json();
  },
});
```

首批建议接入：MCP 图表服务、Flint（语义图表 → Vega-Lite/ECharts）、visualise 的沙箱 HTML。

### 3D 场景

`scene3d` 目前是等距园区的**占位实现**（纯 SVG，用于验证全屏空间感）。
接 three.js 时只需替换 RendererAdapter，协议不变；模型仍只传场景描述，不传可执行代码。

### HTML 沙箱

`html` 渲染器使用 `srcdoc` + `sandbox="allow-scripts"`（**不给** `allow-same-origin`），
无外部 URL、无 top navigation、无弹窗。默认不用于主路径。

---

## 8. 如何试用

1. 打开 `http://127.0.0.1:8770/`
2. 右上角 `⋯` → **空间工作区** 打开
3. **空间模式** 依次切换六种形态
4. 关闭开关即回到原有两态布局，无残留

代码侧：

```ts
import { SpatialWorkspace } from './spatial';

const workspace = new SpatialWorkspace({ orb, enabled: true, theme: 'light' });
workspace.setMode('stage');
workspace.applyScene({ rev: 1, mode: 'split-right', surfaces: [/* ... */] });
```

`<ai-spatial-stage>` 必须作为 `slot="stage"` 子节点放进 `<ai-orb-chat>`，
才能处在正确的层叠顺序（遮罩之上、球与对话层之下）。

---

## 9. 回滚

这一功能被刻意做成**可整体拔除**，且不依赖语音/中继代码。

| 粒度 | 操作 |
|---|---|
| 运行时 | 设置面板关闭「空间工作区」→ 立即回到默认布局，且 `/kb` 不再附带图表协议 |
| 代码级 | 删除 `web/src/spatial/`、`index.ts` 里的 workspace 块、两处 HTML 的 stage/settings 片段 |
| 分支级 | `git checkout main` 即可；main 上不存在这些提交 |
| 单次提交 | `git revert <sha>` |

---

## 10. 后续计划

P1 内容能力 → P2 语义路由与场景契约 → P3 空间智能 → P4 生态与生产化，
每阶段的通过标准与指标见 [spatial-workspace-roadmap.md](spatial-workspace-roadmap.md)。

## 11. 已知边界（探索阶段）

- **图表依赖知识库智能体配合**：提示词已写好，但知识库服务当前不可用（502），未做真实联调。
- **仅检索工具出图**：普通对话不会产出图表；智能体主动闲聊时也没有可视化。
- **无多轮图表记忆**：新回复会替换上一轮图表，尚未做"保留上一张 + 新增一张"。
- **未接 three.js**：`scene3d` 是等距 SVG 占位。
- **无空间记忆**：刷新后回到 `companion`，尚未持久化上次布局。
- **单标签同步**：场景尚未通过 BroadcastChannel 同步（球体位置本就应各端自算）。
- **性能**：背景 `backdrop-filter` + 面板羽化在低端机较重；生产环境建议按设备降级。
- **节流环境**：被遮挡的窗口里 `setTimeout` 可能被压到约 1s，动画会跳步（既有问题，已在编排层用定时器缓解）。
