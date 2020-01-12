import { BEATMAP_SET_PANEL_WIDTH, BEATMAP_SET_PANEL_HEIGHT, BEATMAP_PANEL_HEIGHT, BEATMAP_PANEL_WIDTH, getCarouselScalingFactor } from "./beatmap_carousel";
import { renderer } from "../../visuals/rendering";

export const TEXTURE_MARGIN = 10;

let darkeningOverlay = document.createElement('canvas');
let darkeningOverlayCtx = darkeningOverlay.getContext('2d');
export function updateDarkeningOverlay() {
	let scalingFactor = getCarouselScalingFactor();

	darkeningOverlay.setAttribute('width', String(Math.ceil(BEATMAP_SET_PANEL_WIDTH * scalingFactor)));
	darkeningOverlay.setAttribute('height', String(Math.ceil(BEATMAP_SET_PANEL_HEIGHT * scalingFactor)) + 2);

	darkeningOverlayCtx.clearRect(0, 0, darkeningOverlay.width, darkeningOverlay.height);

	let gradient = darkeningOverlayCtx.createLinearGradient(200 * scalingFactor, 0, 400 * scalingFactor, 100 * scalingFactor);
	gradient.addColorStop(0, 'rgba(0,0,0,0.4)');
	gradient.addColorStop(1, 'rgba(0,0,0,0.0)');
	darkeningOverlayCtx.fillStyle = gradient;
	darkeningOverlayCtx.fillRect(0, 0, darkeningOverlay.width, darkeningOverlay.height);
}

export function getDarkeningOverlay() {
	return darkeningOverlay;
}

let beatmapSetPanelMask = document.createElement('canvas');
let beatmapSetPanelMaskInverted = document.createElement('canvas');
let beatmapSetPanelMaskCtx = beatmapSetPanelMask.getContext('2d');
let beatmapSetPanelMaskInvertedCtx = beatmapSetPanelMaskInverted.getContext('2d');
let beatmapSetPanelGlowTexture: PIXI.RenderTexture;

export function updateBeatmapSetPanelMasks() {
	let scalingFactor = getCarouselScalingFactor();

	for (let i = 0; i < 2; i++) {
		let canvas = (i === 0)? beatmapSetPanelMask : beatmapSetPanelMaskInverted;
		let ctx = (i === 0)? beatmapSetPanelMaskCtx : beatmapSetPanelMaskInvertedCtx;

		canvas.setAttribute('width', String(Math.ceil((BEATMAP_SET_PANEL_WIDTH + TEXTURE_MARGIN) * scalingFactor)));
		canvas.setAttribute('height', String(Math.ceil((BEATMAP_SET_PANEL_HEIGHT + TEXTURE_MARGIN * 2) * scalingFactor)));
	
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	
		ctx.beginPath();
		ctx.moveTo(Math.floor((BEATMAP_SET_PANEL_WIDTH + TEXTURE_MARGIN) * scalingFactor), Math.floor(TEXTURE_MARGIN * scalingFactor));
		ctx.lineTo(Math.floor(TEXTURE_MARGIN * scalingFactor), Math.floor(TEXTURE_MARGIN* scalingFactor));
		ctx.lineTo(Math.floor((BEATMAP_SET_PANEL_HEIGHT/5 + TEXTURE_MARGIN) * scalingFactor), Math.floor((BEATMAP_SET_PANEL_HEIGHT + TEXTURE_MARGIN) * scalingFactor));
		ctx.lineTo(Math.floor((BEATMAP_SET_PANEL_WIDTH + TEXTURE_MARGIN) * scalingFactor), Math.floor((BEATMAP_SET_PANEL_HEIGHT + TEXTURE_MARGIN) * scalingFactor));
		ctx.closePath();
	
		ctx.globalCompositeOperation = (i === 0)? 'destination-in' : 'destination-out';
		ctx.fill();
	}

	let glowSprite = new PIXI.Sprite(PIXI.Texture.from(beatmapSetPanelMask));
	glowSprite.texture.update();

	let glowFilter = new PIXI.filters.GlowFilter(6 * scalingFactor, 5, 0, 0xffffff, 1.0);
	glowSprite.filters = [glowFilter];

	let glowMask = new PIXI.Sprite(PIXI.Texture.from(beatmapSetPanelMaskInverted));
	glowMask.texture.update();

	let glowSpriteContainer = new PIXI.Container();
	glowSpriteContainer.addChild(glowSprite);
	glowSpriteContainer.addChild(glowMask);
	glowSpriteContainer.mask = glowMask;

	beatmapSetPanelGlowTexture = PIXI.RenderTexture.create({
		width: Math.ceil((BEATMAP_SET_PANEL_WIDTH + TEXTURE_MARGIN) * scalingFactor),
		height: Math.ceil((BEATMAP_SET_PANEL_HEIGHT + TEXTURE_MARGIN * 2) * scalingFactor)
	});
	renderer.render(glowSpriteContainer, beatmapSetPanelGlowTexture);
}

export function getBeatmapSetPanelMask() {
	return beatmapSetPanelMask;
}

export function getBeatmapSetPanelMaskInverted() {
	return beatmapSetPanelMaskInverted;
}

export function getBeatmapSetPanelGlowTexture() {
	return beatmapSetPanelGlowTexture;
}

let beatmapDifficultyPanelMask = document.createElement('canvas');
let beatmapDifficultyPanelMaskInverted = document.createElement('canvas');
let beatmapDifficultyPanelMaskCtx = beatmapDifficultyPanelMask.getContext('2d');
let beatmapDifficultyPanelMaskInvertedCtx = beatmapDifficultyPanelMaskInverted.getContext('2d');
let beatmapDifficultyPanelGlowTexture: PIXI.RenderTexture;

export function updateBeatmapDifficultyPanelMasks() {
	let scalingFactor = getCarouselScalingFactor();

	for (let i = 0; i < 2; i++) {
		let canvas = (i === 0)? beatmapDifficultyPanelMask : beatmapDifficultyPanelMaskInverted;
		let ctx = (i === 0)? beatmapDifficultyPanelMaskCtx : beatmapDifficultyPanelMaskInvertedCtx;

		canvas.setAttribute('width', String(Math.ceil((BEATMAP_PANEL_WIDTH + TEXTURE_MARGIN) * scalingFactor)));
		canvas.setAttribute('height', String(Math.ceil((BEATMAP_PANEL_HEIGHT + TEXTURE_MARGIN * 2) * scalingFactor)));
	
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	
		ctx.beginPath();
		ctx.moveTo(Math.floor((BEATMAP_PANEL_WIDTH + TEXTURE_MARGIN) * scalingFactor), Math.floor(TEXTURE_MARGIN * scalingFactor));
		ctx.lineTo(Math.floor(TEXTURE_MARGIN * scalingFactor), Math.floor(TEXTURE_MARGIN* scalingFactor));
		ctx.lineTo(Math.floor((BEATMAP_PANEL_HEIGHT/5 + TEXTURE_MARGIN) * scalingFactor), Math.floor((BEATMAP_PANEL_HEIGHT + TEXTURE_MARGIN) * scalingFactor));
		ctx.lineTo(Math.floor((BEATMAP_PANEL_WIDTH + TEXTURE_MARGIN) * scalingFactor), Math.floor((BEATMAP_PANEL_HEIGHT + TEXTURE_MARGIN) * scalingFactor));
		ctx.closePath();
	
		ctx.globalCompositeOperation = (i === 0)? 'destination-in' : 'destination-out';
		ctx.fill();
	}

	let glowSprite = new PIXI.Sprite(PIXI.Texture.from(beatmapDifficultyPanelMask));
	glowSprite.texture.update();

	let glowFilter = new PIXI.filters.GlowFilter(5 * scalingFactor, 5, 0, 0xffffff, 1.0);
	glowSprite.filters = [glowFilter];

	let glowMask = new PIXI.Sprite(PIXI.Texture.from(beatmapDifficultyPanelMaskInverted));
	glowMask.texture.update();

	let glowSpriteContainer = new PIXI.Container();
	glowSpriteContainer.addChild(glowSprite);
	glowSpriteContainer.addChild(glowMask);
	glowSpriteContainer.mask = glowMask;

	beatmapDifficultyPanelGlowTexture = PIXI.RenderTexture.create({
		width: Math.ceil((BEATMAP_PANEL_WIDTH + TEXTURE_MARGIN) * scalingFactor),
		height: Math.ceil((BEATMAP_PANEL_HEIGHT + TEXTURE_MARGIN * 2) * scalingFactor)
	});
	renderer.render(glowSpriteContainer, beatmapDifficultyPanelGlowTexture);
}

export function getBeatmapDifficultyPanelMask() {
	return beatmapDifficultyPanelMask;
}

export function getBeatmapDifficultyPanelMaskInverted() {
	return beatmapDifficultyPanelMaskInverted;
}

export function getBeatmapDifficultyPanelGlowTexture() {
	return beatmapDifficultyPanelGlowTexture;
}

let difficultyColorBar = document.createElement('canvas');
let difficultyColorBarCtx = difficultyColorBar.getContext('2d');

export function updateDifficultyColorBar() {
	let scalingFactor = getCarouselScalingFactor();

	difficultyColorBar.setAttribute('width', String(Math.ceil(BEATMAP_PANEL_WIDTH * scalingFactor)));
	difficultyColorBar.setAttribute('height', String(Math.ceil(BEATMAP_PANEL_HEIGHT * scalingFactor * 0.02)));

	difficultyColorBarCtx.clearRect(0, 0, difficultyColorBar.width, difficultyColorBar.height);

	let gradient = difficultyColorBarCtx.createLinearGradient(0, 0, Math.ceil(BEATMAP_PANEL_WIDTH * scalingFactor), 0);
	gradient.addColorStop(0, 'rgba(255,255,255,1.0)');
	gradient.addColorStop(1, 'rgba(255,255,255,0.0)');
	difficultyColorBarCtx.fillStyle = gradient;
	difficultyColorBarCtx.fillRect(0, 0, difficultyColorBar.width, difficultyColorBar.height)
}

export function getDifficultyColorBar() {
	return difficultyColorBar;
}