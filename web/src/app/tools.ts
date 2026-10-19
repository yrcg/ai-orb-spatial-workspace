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
 * 是否请求检索智能体追加图表块。
 *
 * 默认关闭：图表协议会让知识库多生成一段结构化输出，而工具结果处在
 * 「语音模型等它才能开口」的关键路径上。只有空间工作区打开时才开启，
 * 并且可以随时用设置面板关掉——关掉后请求参数与主链路完全一致。
 */
let chartRequested = false;
export function setChartRequest(on: boolean): void { chartRequested = on; }
export function isChartRequested(): boolean { return chartRequested; }

/** 公司知识库：走本地中继代理（不让浏览器直连，避开 CORS 且 token 不出前端） */
export async function kbAsk(q: string, timeoutSec: number): Promise<{ ok: boolean; answer?: string; error?: string }> {
  const t = Math.round(timeoutSec || 30);
  const v = chartRequested ? '&v=1' : '';
  const r = await fetch(`${CONFIG.kbPath}?q=${encodeURIComponent(q)}&t=${t}${v}`, { cache: 'no-store' });
  const j = await r.json();
  if (!j || !j.ok) throw new Error((j && j.error) || 'kb_failed');
  return j;
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
