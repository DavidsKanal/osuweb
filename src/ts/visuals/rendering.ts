import { MathUtil } from "../util/math_util";

let logRenderTimeInfo = false;

const LOG_RENDER_INFO_INTERVAL = 5000; // In ms

export const mainCanvas = document.querySelector('#mainCanvas') as HTMLCanvasElement;

const gl = mainCanvas.getContext('webgl2', {
    stencil: true,
    alpha: true,
    powerPreference: 'high-performance',
    desynchronized: true // Tells browser to send canvas data directly to the GPU. Breaks the FPS meter ;)
}) as WebGLRenderingContext; // Technically WebGL2, but idk. Rollup is complaining :S

export const MAX_TEXTURE_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE);

PIXI.settings.CREATE_IMAGE_BITMAP = false; // ehh? good or not? OKAY actually it seems like having this on false reduces GC work. Could be some weird placebo shit, tho
PIXI.settings.GC_MODE = PIXI.GC_MODES.MANUAL; // TODO! So... what actually needs to be done manually? Just Texture.destroy()?

export let renderer = new PIXI.Renderer({
    width: window.innerWidth,
    height: window.innerHeight,
    context: gl,
    antialias: true
});
export let stage = new PIXI.Container();

(renderer.framebuffer as any).writeDepthTexture = true; // OKAY SO. WHAT THE FUCK. WHY IS THIS FALSE IN THE FIRST PLACE. Absolute hack. Don't know if this has any side-effects. Maybe it's how the renderer is created?

export function enableRenderTimeInfoLog() {
    logRenderTimeInfo = true;
}

export function disableRenderTimeInfoLog() {
    logRenderTimeInfo = false;
}

let renderingTasks: Function[] = [];
let frameTimes: number[] = [];
let inbetweenFrameTimes: number[] = [];
let lastFrameTime: number = null;
let lastRenderInfoLogTime: number = null;

export function mainRenderingLoop() {
    let startTime = performance.now();

    requestAnimationFrame(mainRenderingLoop);

    for (let i = 0; i < renderingTasks.length; i++) {
        renderingTasks[i]();
    }

    renderer.render(stage);

    if (!logRenderTimeInfo) return;

    // Frame time logger:
    let now = performance.now();
    let elapsedTime = now - startTime;
    frameTimes.push(elapsedTime);
    if (lastFrameTime !== null) {
        inbetweenFrameTimes.push(now - lastFrameTime);
    }
    lastFrameTime = now;

    if ((now - lastRenderInfoLogTime) >= LOG_RENDER_INFO_INTERVAL && frameTimes.length > 0 && inbetweenFrameTimes.length > 0) {
        let data1 = MathUtil.getAggregateValuesFromArray(frameTimes),
            data2 = MathUtil.getAggregateValuesFromArray(inbetweenFrameTimes);
            
        console.log("---");
        console.log(`Frame time info: Average: ${data1.avg.toFixed(3)}ms, Shortest: ${data1.min.toFixed(3)}ms, Longest: ${data1.max.toFixed(3)}ms`);
        console.log(`Frame period info: Average: ${data2.avg.toFixed(3)}ms, Shortest: ${data2.min.toFixed(3)}ms, Longest: ${data2.max.toFixed(3)}ms`);

        frameTimes.length = 0;
        inbetweenFrameTimes.length = 0;
        lastRenderInfoLogTime = now;
    }

    if (lastRenderInfoLogTime === null) lastRenderInfoLogTime = now;
}
requestAnimationFrame(mainRenderingLoop);

export function addRenderingTask(task: Function) {
    let index = renderingTasks.findIndex((a) => a === task);
    if (index !== -1) return;

    renderingTasks.push(task);
}

export function removeRenderingTask(task: Function) {
    let index = renderingTasks.findIndex((a) => a === task);
    if (index === -1) return;

    renderingTasks.splice(index, 1);
}

// TODO: Maybe disable PIXI GC?
export function uploadTexture(tex: PIXI.Texture) {
    renderer.texture.bind(tex, 15); // Use slot 15 for all texture uploaded in this way. While that means that only the last uploaded texture will still be bound, all uploaded textures still remain in video memory.
}

export let softwareCursor = new PIXI.Sprite(PIXI.Texture.from("./assets/img/cursor.png"));
softwareCursor.anchor.set(0.5, 0.5);
softwareCursor.scale.set(1.0, 1.0);
softwareCursor.visible = false;

let softwareCursorContainer = new PIXI.Container();
softwareCursorContainer.addChild(softwareCursor);

export let mainHitObjectContainer = new PIXI.Container();
mainHitObjectContainer.sortableChildren = true;
export let approachCircleContainer = new PIXI.Container();
export let followPointContainer = new PIXI.Container();
export let scorePopupContainer = new PIXI.Container();
/** Every score popup is momentarily shown ontop of all hit objects, using an additive blending mode. This container holds those. */
export let secondScorePopupContainer = new PIXI.Container();
export let hudContainer = new PIXI.Container();
export let cursorRippleGraphics = new PIXI.Graphics();

// The order of these is important, 'cause z-index 'n' stuff.
stage.addChild(scorePopupContainer);
stage.addChild(followPointContainer);
stage.addChild(mainHitObjectContainer);
stage.addChild(approachCircleContainer);
stage.addChild(secondScorePopupContainer);
stage.addChild(hudContainer);
stage.addChild(cursorRippleGraphics);
stage.addChild(softwareCursorContainer);