/**
 * 旁路图表：请求门控测试
 *
 *   node tests/frontend/chart-side-channel.test.mjs
 *
 * 只验证「什么情况下值得发第二次知识库请求」和「图表块与正文的分离」，
 * 不涉及网络——真实时序需要知识库在线时人工验收。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const webRoot = resolve(import.meta.dirname, '..', '..', 'web');
const outDir = mkdtempSync(join(tmpdir(), 'chart-side-'));

// 用 CommonJS 编译：tools.ts 有运行时 import（./config），ESM 输出在临时目录里
// 没有扩展名会让 node 解析失败。
execFileSync('npx', [
  'tsc', 'src/app/tools.ts', 'src/app/config.ts', 'src/spatial/chartMarkdown.ts',
  '--target', 'ES2022',
  '--module', 'CommonJS',
  '--moduleResolution', 'node',
  '--skipLibCheck',
  '--outDir', outDir,
], { cwd: webRoot, stdio: 'inherit', shell: true });

writeFileSync(join(outDir, 'package.json'), '{ "type": "commonjs" }');
const require = createRequire(join(outDir, 'x.cjs'));
const tools = require(join(outDir, 'app', 'tools.js'));
const md = require(join(outDir, 'spatial', 'chartMarkdown.js'));
const { shouldRequestChart, setChartRequest, isChartRequested } = tools;
const { extractChartBlocks } = md;

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.error(`  FAIL ${name}${extra === undefined ? '' : `: ${JSON.stringify(extra)}`}`);
}

// ---- 1. 该发图的问题 ----
const want = [
  '各部门工单分别是多少',
  '近七天的处理量趋势',
  '各分公司报销占比',
  '今年每个月的加班时长统计',
  '各部门满意度排名',
];
for (const q of want) {
  check(`应请求: ${q}`, shouldRequestChart(q) === true, q);
}

// ---- 2. 不该发图的问题 ----
const avoid = [
  '',
  '年假有几天',
  '怎么报销',
  '你好',
  '这个流程要走几步',
];
for (const q of avoid) {
  check(`不该请求: ${JSON.stringify(q)}`, shouldRequestChart(q) === false, q);
}

// ---- 3. 纯制度性长文本不触发（数字多但无对比语义）----
{
  const text = '员工每年享有 5 天年假，入职满 3 年增加到 10 天，满 5 年 15 天。';
  check('数字多但无对比语义 → 不请求', shouldRequestChart(text) === false, text);
}

// ---- 4. 有数据语义的长文本触发 ----
{
  const text = '各部门工单分布如下：研发 286 件，市场 174 件，行政 232 件，客服 356 件。';
  check('有分布语义 → 请求', shouldRequestChart(text) === true);
}

// ---- 5. 开关默认关闭，可显式打开 ----
{
  check('默认关闭', isChartRequested() === false);
  setChartRequest(true);
  check('可打开', isChartRequested() === true);
  setChartRequest(false);
  check('可关闭', isChartRequested() === false);
}

// ---- 6. NO_CHART 不应产生图表块 ----
{
  const r = extractChartBlocks('NO_CHART');
  check('NO_CHART 无图表', r.charts.length === 0);
  check('NO_CHART 未闭合为 false', r.openFence === false);
}

// ---- 7. 图表块可独立于正文到达 ----
{
  const r = extractChartBlocks('```chart\ntitle: 各部门工单\ntype: bars\n| 部门 | 数量 |\n| --- | --- |\n| 研发 | 286 |\n| 客服 | 356 |\n```');
  check('仅有图表块', r.charts.length === 1);
  check('正文为空', r.text === '', r.text);
  check('数据完整', JSON.stringify(r.charts[0].data.series[0].values) === '[286,356]');
}

rmSync(outDir, { recursive: true, force: true });

console.log(`chart-side-channel: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
