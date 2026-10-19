/**
 * 图表协议解析器测试（零依赖，node 直接跑）
 *
 *   cd web && node ../tests/frontend/chart-markdown.test.mjs
 *
 * 覆盖：md 表格 → bars/line/table、JSON 形态、流式未闭合围栏、
 * 坏表格容错、正文与图表块的分离、数量到空间形态的映射。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const webRoot = resolve(import.meta.dirname, '..', '..', 'web');
const outDir = mkdtempSync(join(tmpdir(), 'chart-md-'));

execFileSync('npx', [
  'tsc', 'src/spatial/chartMarkdown.ts',
  '--target', 'ES2022',
  '--module', 'ESNext',
  '--moduleResolution', 'bundler',
  '--skipLibCheck',
  '--outDir', outDir,
], { cwd: webRoot, stdio: 'inherit', shell: true });

const mod = await import(pathToFileURL(join(outDir, 'chartMarkdown.js')).href);
const { extractChartBlocks, chartsToSurfaces, modeForCount } = mod;

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.error(`  FAIL ${name}${extra === undefined ? '' : `: ${JSON.stringify(extra)}`}`);
}

// 1. md 表格 → bars
{
  const raw = `本月工单 1284 件，比上月多 12.4%。

\`\`\`chart
title: 各部门工单分布
type: bars
unit: 件
| 部门 | 工单数 |
| --- | --- |
| 研发 | 286 |
| 市场 | 174 |
\`\`\`
以上是主要分布。`;
  const r = extractChartBlocks(raw);
  check('1.text 无围栏', !r.text.includes('```'), r.text);
  check('1.正文保留', r.text.includes('本月工单') && r.text.includes('以上是主要分布'));
  check('1.一个图表', r.charts.length === 1, r.charts.length);
  check('1.kind', r.charts[0].kind === 'bars');
  check('1.title', r.charts[0].title === '各部门工单分布');
  check('1.unit', r.charts[0].unit === '件');
  check('1.labels', JSON.stringify(r.charts[0].data.labels) === '["研发","市场"]');
  check('1.values', JSON.stringify(r.charts[0].data.series[0].values) === '[286,174]');
}

// 2. 多数值列 → 多系列
{
  const r = extractChartBlocks(`\`\`\`chart
type: line
| 日期 | 完成 | 新增 |
| --- | --- | --- |
| 周一 | 142 | 166 |
| 周二 | 168 | 174 |
\`\`\``);
  check('2.line', r.charts[0].kind === 'line');
  check('2.两个系列', r.charts[0].data.series.length === 2);
  check('2.正文为空', r.text === '', r.text);
}

// 3. 纯表格
{
  const r = extractChartBlocks(`\`\`\`chart
type: table
| 编号 | 事项 |
| --- | --- |
| WO-2416 | 设备报修 |
\`\`\``);
  check('3.table', r.charts[0].kind === 'table');
  check('3.columns', r.charts[0].data.columns.length === 2);
  check('3.cell', r.charts[0].data.rows[0].c0 === 'WO-2416');
}

// 4. JSON 形态
{
  const r = extractChartBlocks('先看数据。\n```chart\n{ "type": "bars", "title": "满意度", "labels": ["一月"], "series": [{"name":"满意度","values":[95.2]}] }\n```');
  check('4.json', r.charts.length === 1);
  check('4.labels', JSON.stringify(r.charts[0].data.labels) === '["一月"]');
  check('4.正文', r.text === '先看数据。', r.text);
}

// 5. 流式未闭合
{
  const r = extractChartBlocks('正在整理。\n```chart\ntitle: 未完成\ntype: bars\n| a | b |\n| --- | --- |\n| 1 | 2 |');
  check('5.标记未闭合', r.openFence === true);
  check('5.不泄露数据', !r.text.includes('| a | b |'), r.text);
  check('5.正文', r.text === '正在整理。', r.text);
}

// 6. 无图表直通
{
  const raw = '就是一句普通回答。';
  const r = extractChartBlocks(raw);
  check('6.原样返回', r.text === raw);
  check('6.无图表', r.charts.length === 0);
  check('6.未闭合为 false', r.openFence === false);
}

// 7. 坏表格只丢块，不丢正文
{
  const r = extractChartBlocks('正文。\n```chart\ntype: bars\n| 只有一行 |\n```');
  check('7.无图表', r.charts.length === 0);
  check('7.正文保留', r.text.startsWith('正文'), r.text);
}

// 8. 数量 → 形态
{
  check('8.1 → 右分栏', modeForCount(1) === 'split-right');
  check('8.2 → 全局', modeForCount(2) === 'immersive');
  check('8.4 → 全局', modeForCount(4) === 'immersive');
  const s = chartsToSurfaces([
    { kind: 'bars', title: 'A', data: {} },
    { kind: 'table', title: 'B', data: {} },
  ], 7);
  check('8.id 唯一', s[0].id !== s[1].id);
  check('8.首块为 focus', s[0].role === 'focus');
  check('8.次块为 support', s[1].role === 'support');
}

// 9. 千分位与百分号
{
  const r = extractChartBlocks('```chart\ntype: bars\n| 类别 | 数值 |\n| --- | --- |\n| A | 1,284 |\n| B | 96.8% |\n```');
  check('9.逗号', r.charts[0].data.series[0].values[0] === 1284);
  check('9.百分号', r.charts[0].data.series[0].values[1] === 96.8);
}

rmSync(outDir, { recursive: true, force: true });

console.log(`chart-markdown: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
