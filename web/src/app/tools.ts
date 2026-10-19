import { CONFIG } from './config';

/** 原生工具定义（Qwen-Audio Realtime 的 session.update.tools） */
export const QWEN_TOOLS = [
  {
    type: 'function',
    name: 'query_company_policy',
    description:
      '查询公司内部制度与政策。凡是涉及公司自身事务——规章制度、办事流程、报销、发票、'
      + '入职离职、考勤、请假、年假、加班、出差、补贴、薪酬绩效、培训、合同、组织与部门、'
      + '项目情况、系统账号等——都必须先调用它拿到资料再回答，绝对不允许凭印象编造公司信息。',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '要查的主题，如「笔记本补贴」「考勤制度」「年假天数」' },
      },
      required: ['topic'],
    },
  },
  {
    type: 'function',
    name: 'get_datetime',
    description:
      '获取今天的日期、星期和当前时间。当用户问到日期、时间、今天几号、今天星期几、'
      + '现在几点时调用它，不要凭记忆回答。',
    parameters: { type: 'object', properties: {} },
  },
];

/** 工具显示名 */
export const TOOL_LABEL: Record<string, string> = {
  query_company_policy: '查公司制度',
  get_datetime: '查日期时间',
};

/** 慢工具（会明显等待）→ 开场给一个「查询中」提示音 */
export const SLOW_TOOLS = new Set(['query_company_policy']);

const USER_LOCATION = '成都';

export function envFacts(): { date: string; weekday: string; time: string; location: string } {
  const n = new Date();
  const wd = '日一二三四五六'[n.getDay()];
  return {
    date: `${n.getFullYear()}年${n.getMonth() + 1}月${n.getDate()}日`,
    weekday: `星期${wd}`,
    time: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`,
    location: USER_LOCATION,
  };
}

/**
 * 是否允许旁路请求图表。
 *
 * 注意：**正文请求永远不带图表参数**。图表会显著增加知识库的输出长度，
 * 而工具结果处在「语音模型等它才能开口」的关键路径上，混在一起就等于
 * 用首声延迟换可视化。
 *
 * 正确做法是：正文先返回并开口 → 再单独发一次 /kb/chart。
 * 这个开关只控制「要不要发那次旁路请求」。
 */
let chartRequested = false;
export function setChartRequest(on: boolean): void { chartRequested = on; }
export function isChartRequested(): boolean { return chartRequested; }

/** 公司知识库：走本地中继代理（不让浏览器直连，避开 CORS 且 token 不出前端） */
export async function kbAsk(q: string, timeoutSec: number): Promise<{ ok: boolean; answer?: string; error?: string }> {
  const t = Math.round(timeoutSec || 30);
  const r = await fetch(`${CONFIG.kbPath}?q=${encodeURIComponent(q)}&t=${t}`, { cache: 'no-store' });
  const j = await r.json();
  if (!j || !j.ok) throw new Error((j && j.error) || 'kb_failed');
  return j;
}

/**
 * 旁路图表请求：只问图表，不要正文。
 *
 * 在正文已经返回、语音已经开始之后才调用，所以不会影响首声。
 * 超时给得比正文短：补不上就不补，用户已经听到回答了。
 */
export async function kbChart(
  q: string,
  timeoutSec: number,
  signal?: AbortSignal,
): Promise<{ ok: boolean; answer?: string; error?: string; ms?: number }> {
  const t = Math.round(timeoutSec || 20);
  const r = await fetch(
    `${CONFIG.kbPath}/chart?q=${encodeURIComponent(q)}&t=${t}`,
    { cache: 'no-store', signal },
  );
  const j = await r.json();
  if (!j || !j.ok) throw new Error((j && j.error) || 'kb_chart_failed');
  return j;
}

/**
 * 值不值得为这句话补一张图。
 *
 * 这是**成本门控**，不是语义理解：分类词表宁窄勿宽。
 * 误判成"该出图"的代价是白白多发一次 10 秒级的知识库请求；
 * 误判成"不该出图"只是少一张图，对话完全不受影响。
 *
 * 注意它通常作用在**问题**上（工具参数 topic），而不是答案上，
 * 所以不能要求"文本里至少有两个数字"——"各部门工单分布"就没有数字。
 */
export function shouldRequestChart(text: string): boolean {
  if (!text || text.length < 4) return false;

  // ① 明确的对比/分布语义
  if (/(分布|占比|比例|趋势|对比|统计|排名|同比|环比|各部门|各分公司|各区域|各团队|各类|各项)/.test(text)) {
    return true;
  }

  // ② 时间序列 + 量化词：避免"每年享有 5 天年假"这类制度文本被误判
  const series = /(近\S{0,4}(天|周|月|年)|逐月|逐日|逐周|月度|年度|季度)/.test(text);
  const quantity = /(工单|数量|金额|时长|次数|人数|销量|产量|完成|受理|处理量|满意度|占比)/.test(text);
  return series && quantity;
}

/** 执行一个工具，返回给模型看的文本 */
export async function runToolOnce(name: string, args: Record<string, unknown>, sounds: { tool(): void }): Promise<string> {
  if (name === 'query_company_policy') {
    sounds.tool();
    const j = await kbAsk(String(args.topic || ''), 25);
    return String(j.answer || '').slice(0, 1500) || '（知识库没有返回相关内容）';
  }
  if (name === 'get_datetime') {
    const f = envFacts();
    return `${f.date} ${f.weekday} ${f.time}`;
  }
  return `（没有名为 ${name} 的工具）`;
}
