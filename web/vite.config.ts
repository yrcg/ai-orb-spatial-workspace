import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * 两种构建：
 *   npm run build      → 生产应用包（自包含单文件 public/dist/app.js，由 public/index.html 引用）
 *   npm run build:lib  → 可复用组件单文件（web/dist-lib/ai-orb-chat.js，供其它页面嵌入）
 *
 * 产物落到 public/dist/ 与 web/dist-lib/，由 src/server.py 静态伺服，
 * 因此运行时只需要 Python，无需 Node。
 */
export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib';
  const root = __dirname;

  if (isLib) {
    return {
      build: {
        target: 'es2022',
        outDir: resolve(root, 'dist-lib'),
        emptyOutDir: true,
        lib: {
          entry: resolve(root, 'src/orb/index.ts'),
          name: 'AiOrbChat',
          fileName: () => 'ai-orb-chat.js',
          formats: ['es'],
        },
      },
    };
  }

  return {
    base: '/dist/',
    build: {
      target: 'es2022',
      outDir: resolve(root, '..', 'public', 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(root, 'src/app/index.ts'),
        output: {
          entryFileNames: 'app.js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  };
});
