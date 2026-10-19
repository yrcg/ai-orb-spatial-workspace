import { registerRenderer } from './base';
import { cardsRenderer, tableRenderer, textRenderer } from './basic';
import { barsRenderer, lineRenderer } from './charts';
import { htmlRenderer, scene3dRenderer } from './media';

/**
 * 内置渲染器注册。
 * 宿主或插件可以再次 registerRenderer({ kind, capabilities, create }) 覆盖或新增。
 */
registerRenderer(tableRenderer);
registerRenderer(cardsRenderer);
registerRenderer(textRenderer);
registerRenderer(barsRenderer);
registerRenderer(lineRenderer);
registerRenderer(scene3dRenderer);
registerRenderer(htmlRenderer);

export * from './base';
export { tableRenderer, cardsRenderer, textRenderer } from './basic';
export { barsRenderer, lineRenderer } from './charts';
export { scene3dRenderer, htmlRenderer } from './media';
