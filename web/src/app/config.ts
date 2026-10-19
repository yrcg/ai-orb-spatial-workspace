/**
 * 宿主配置（Q11：悬浮球渲染体的选择入口）。
 *
 * 换一种悬浮球效果：实现 OrbRenderer → registerOrb('名字', factory) →
 * 把这里的 orb 改成 '名字'。
 */
export interface AppConfig {
  /** 悬浮球渲染体名：'liquid' | 自定义（见 registerOrb） */
  orb: string;
  /** 液态球形态预设（见 src/orb/liquid/seeds.ts）：
   *  'custom'    原始悬浮球：对话球参数.txt 导出件（默认，流场 12）
   *  'voiceWave' 声纹薄膜（备选，流场 19）
   *  'chromatic' 对话球参数2.txt 调校形态（备选，流场 22）
   *  运行时可 orb.setOptions({ orbPreset: 'xxx' }) 即时切换 */
  orbPreset: string;
  /** 球所在人设（系统提示词）用的称呼 */
  brand: string;
  /** 知识库代理地址（由中继提供，相对路径即可） */
  kbPath: string;
  /** 通话上行分片（ms） */
  chunkMs: number;
  /** 是否默认开启回声消除 */
  aec: boolean;
  /** 播放期上行静音（外放回声大时才开） */
  upGate: boolean;
  /** 是否写日志 */
  log: boolean;
  /** 主题：本次先按白底管理后台调（后续再补深色） */
  theme: 'light' | 'dark';
  /** 声场表现：'native' 用球体自带辉光；'ring' 旧的线条环；'off' 关闭 */
  auraMode: 'native' | 'ring' | 'off';
}

export const CONFIG: AppConfig = {
  orb: 'liquid',
  orbPreset: 'custom',
  brand: '瀚涛百事通',
  kbPath: '/kb',
  chunkMs: 1000,
  aec: true,
  upGate: false,
  log: true,
  theme: 'light',
  auraMode: 'native',
};
