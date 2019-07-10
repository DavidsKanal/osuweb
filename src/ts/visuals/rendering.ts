export const mainCanvas = document.querySelector('#mainCanvas') as HTMLCanvasElement;

const mainContext = mainCanvas.getContext('webgl2', {
    stencil: true,
    alpha: true,
    powerPreference: 'high-performance',
    desynchronized: true // Tells browser to send canvas data directly to the GPU. Breaks the FPS meter ;)
});

export let renderer = new PIXI.Renderer({
    width: window.innerWidth,
    height: window.innerHeight,
    context: mainContext
});
export let stage = new PIXI.Container();

export let mainHitObjectContainer = new PIXI.Container();
export let approachCircleContainer = new PIXI.Container();

export function mainRender() {
    renderer.render(stage);
}

stage.addChild(mainHitObjectContainer);
stage.addChild(approachCircleContainer);