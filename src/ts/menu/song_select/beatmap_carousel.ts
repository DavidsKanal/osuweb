import { VirtualDirectory } from "../../file_system/virtual_directory";
import { BeatmapSet } from "../../datamodel/beatmap_set";
import { stage, addRenderingTask } from "../../visuals/rendering";
import { inputEventEmitter, getCurrentMousePosition, getCurrentMouseButtonState } from "../../input/input";
import { getGlobalScalingFactor, uiEventEmitter, REFERENCE_SCREEN_HEIGHT, currentWindowDimensions } from "../../visuals/ui";
import { BeatmapSetPanel } from "./beatmap_set_panel";
import { updateDarkeningOverlay, updateBeatmapDifficultyPanelMasks, updateBeatmapSetPanelMasks, updateDifficultyColorBar } from "./beatmap_panel_components";
import { NormalizedWheelEvent, last, shallowObjectClone, EMPTY_FUNCTION, charIsDigit, compareStringsLowerCase } from "../../util/misc_util";
import { calculateRatioBasedScalingFactor } from "../../util/graphics_util";
import { EaseType, MathUtil } from "../../util/math_util";
import { InteractionGroup, Interactivity } from "../../input/interactivity";
import { BeatmapDifficultyPanel } from "./beatmap_difficulty_panel";
import { SongSelect } from "./song_select";
import { Interpolator } from "../../util/interpolation";
import { Point } from "../../util/point";

export const BEATMAP_CAROUSEL_RIGHT_MARGIN = 600;
export const BEATMAP_CAROUSEL_RADIUS_FACTOR = 3.0;
export const BEATMAP_SET_PANEL_WIDTH = 700;
export const BEATMAP_SET_PANEL_HEIGHT = 100;
export const BEATMAP_SET_PANEL_MARGIN = 10;
export const BEATMAP_SET_PANEL_SNAP_TARGET = 225;
export const BEATMAP_DIFFICULTY_PANEL_WIDTH = 650;
export const BEATMAP_DIFFICULTY_PANEL_HEIGHT = 50;
export const BEATMAP_DIFFICULTY_PANEL_MARGIN = 10;
export const BEATMAP_DIFFICULTY_PANEL_SNAP_TARGET = 300;
const CAROUSEL_END_THRESHOLD = REFERENCE_SCREEN_HEIGHT/2 - BEATMAP_SET_PANEL_HEIGHT/2; // When either the top or bottom panel of the carousel cross this line, the carousel should snap back.
const SCROLL_VELOCITY_DECAY_FACTOR = 0.04; // Per second. After one second, the scroll velocity will have fallen off by this much.

export enum BeatmapCarouselSortingType {
	None = "",
	Title = "Title",
	Artist = "Artist",
	Difficulty = "Difficulty",
	Length = "Length",
	DateAdded = "Date Added",
	Mapper = "Mapper"
}
export let beatmapCarouselSortingTypes = [BeatmapCarouselSortingType.Title, BeatmapCarouselSortingType.Artist, BeatmapCarouselSortingType.Difficulty, BeatmapCarouselSortingType.Length, BeatmapCarouselSortingType.DateAdded, BeatmapCarouselSortingType.Mapper];
export let defaultBeatmapCarouselSortingType = BeatmapCarouselSortingType.Title;
export let beatmapCarouselSortingTypeFunctions = new Map<BeatmapCarouselSortingType, (a: BeatmapSet, b: BeatmapSet) => number>();
beatmapCarouselSortingTypeFunctions.set(BeatmapCarouselSortingType.None, (a, b) => 0);
beatmapCarouselSortingTypeFunctions.set(BeatmapCarouselSortingType.Title, (a, b) => compareStringsLowerCase(a.representingBeatmap.title, b.representingBeatmap.title));
beatmapCarouselSortingTypeFunctions.set(BeatmapCarouselSortingType.Artist, (a, b) => compareStringsLowerCase(a.representingBeatmap.artist, b.representingBeatmap.artist));
beatmapCarouselSortingTypeFunctions.set(BeatmapCarouselSortingType.Difficulty, (a, b) => 0);
beatmapCarouselSortingTypeFunctions.set(BeatmapCarouselSortingType.Length, (a, b) => 0);
beatmapCarouselSortingTypeFunctions.set(BeatmapCarouselSortingType.DateAdded, (a, b) => 0);
beatmapCarouselSortingTypeFunctions.set(BeatmapCarouselSortingType.Mapper, (a, b) => compareStringsLowerCase(a.representingBeatmap.creator, b.representingBeatmap.creator));

export class BeatmapCarousel {
	public songSelect: SongSelect;
	public container: PIXI.Container;
	public interactionGroup: InteractionGroup;
	public scalingFactor: number = 1.0;

	private beatmapSetPanels: BeatmapSetPanel[] = [];
	private panelCache = new WeakMap<BeatmapSet, BeatmapSetPanel>();

	public selectedPanel: BeatmapSetPanel = null;
	public selectedSubpanel: BeatmapDifficultyPanel = null;

	private referencePanel: BeatmapSetPanel = null;
	private referencePanelY = 0;
	private scrollVelocity = 0; // In normalized pixels per second
	private snapToSelected = false;
	private skipSnapbackNextFrame = true;
	private snapToSelectionInterpolator = new Interpolator({
		duration: 750,
		ease: EaseType.EaseOutElastic,
		p: 0.9,
		defaultToFinished: true
	});

	private dragTarget: PIXI.Container;
	private pressDownStopped = true;	

	constructor(songSelect: SongSelect) {
		this.songSelect = songSelect;
		this.container = new PIXI.Container();
		this.interactionGroup = Interactivity.createGroup();

		this.initDragging();

		inputEventEmitter.addListener('wheel', (data) => this.onWheel(data));
	}

	private initDragging() {
		this.dragTarget = new PIXI.Container();
		this.songSelect.container.addChild(this.dragTarget);

		let dragListener = Interactivity.registerDisplayObject(this.dragTarget);
		dragListener.passThrough = true;
		dragListener.setZIndex(1);
		this.interactionGroup.add(dragListener);

		dragListener.makeDraggable(() => {
			this.snapToSelected = false;
			this.scrollVelocity = 0;
			this.pressDownStopped = false;
		}, (e) => {
			if (!this.referencePanel) return;
			this.referencePanelY += e.movement.y / this.scalingFactor;
		
			if (Math.abs(e.distanceFromStart.y) > 5 && !this.pressDownStopped) {
				this.pressDownStopped = true;
				this.interactionGroup.releaseAllPresses();
			}
		}, (e) => {
			this.scrollVelocity -= e.velocity.y / this.scalingFactor;
		});
	}

	private onWheel(data: NormalizedWheelEvent) {
		if (this.beatmapSetPanels.length === 0 || !this.songSelect.visible) return;

		let wheelEvent = data as NormalizedWheelEvent;
		let effectiveness = 1.0; // How much the scroll "counts"	
	
		// Determine scroll dampening if the user is on the top/bottom of the carousel
		let firstPanel = this.beatmapSetPanels[0];
		let lastPanel = last(this.beatmapSetPanels);
		let diff: number;
	
		// Top edge
		diff = firstPanel.currentNormalizedY - CAROUSEL_END_THRESHOLD;
		effectiveness = Math.pow(0.9, Math.max(0, diff/30));
	
		// Bottom edge
		diff = CAROUSEL_END_THRESHOLD - lastPanel.currentNormalizedY;
		effectiveness = Math.min(effectiveness, Math.pow(0.9, Math.max(0, diff/30)));
	
		this.scrollVelocity += wheelEvent.dy * 4 * effectiveness;
		this.snapToSelected = false;
	}

	update(now: number, dt: number) {
		if (!this.referencePanel) return;

		let referenceIndex = this.beatmapSetPanels.indexOf(this.referencePanel);
		if (referenceIndex === -1) return;

		if (this.snapToSelected) {
			this.referencePanelY = this.snapToSelectionInterpolator.getCurrentValue(now);
		}

		/* 
		
		The function describing scrollVelocity over time is
		f(t) = v0 * d^t,
		where v0 is the starting velocity, d is the decay and t is passed time in seconds.

		Therefore, the distance traveled is that function's antiderivative,
		F(t) = v0 * d^t / ln(d).
		The distance traveled in a given interval of time [0, x] is therefore
		F(x) - F(0) = v0 * d^x / ln(d) - v0 / ln(d) = v0 * (d^x - 1) / ln(d).
		
		*/

		let distanceScrolled = this.scrollVelocity * (Math.pow(SCROLL_VELOCITY_DECAY_FACTOR, dt/1000) - 1) / Math.log(SCROLL_VELOCITY_DECAY_FACTOR);
		this.scrollVelocity = this.scrollVelocity * Math.pow(SCROLL_VELOCITY_DECAY_FACTOR, dt/1000);
		this.referencePanelY -= distanceScrolled;

		if (Math.abs(this.scrollVelocity) < 1) this.scrollVelocity = 0;

		if (!this.skipSnapbackNextFrame) {
			// Calculate snapback when user scrolls off one of the carousel edges
			let firstPanel = this.beatmapSetPanels[0];
			let lastPanel = last(this.beatmapSetPanels);
			let diff: number;

			// Top edge snapback
			diff = firstPanel.currentNormalizedY - CAROUSEL_END_THRESHOLD;
			if (diff > 0) this.referencePanelY += diff * (Math.pow(0.0015, dt/1000) - 1);

			// Bottom edge snapback
			diff = CAROUSEL_END_THRESHOLD - (lastPanel.currentNormalizedY + lastPanel.getAdditionalExpansionHeight(now));
			if (diff > 0) this.referencePanelY -= diff * (Math.pow(0.0015, dt/1000) - 1);
		}
		this.skipSnapbackNextFrame = false;

		this.referencePanel.update(now, this.referencePanelY, this.referencePanel.getTotalHeight(now));

		let currentY = this.referencePanelY;
		for (let i = referenceIndex-1; i >= 0; i--) {
			let panel = this.beatmapSetPanels[i];
			let height = panel.getTotalHeight(now);
			currentY -= height;

			panel.container.visible = true;
			panel.update(now, currentY, height);
		}

		currentY = this.referencePanelY;
		for (let i = referenceIndex+1; i < this.beatmapSetPanels.length; i++) {
			let prevPanel = this.beatmapSetPanels[i-1];
			let panel = this.beatmapSetPanels[i];
			let height = prevPanel.getTotalHeight(now);
			currentY += height;
			
			panel.container.visible = true;
			panel.update(now, currentY, panel.getTotalHeight(now));
		}
	}

	resize() {
		this.scalingFactor = calculateRatioBasedScalingFactor(currentWindowDimensions.width, currentWindowDimensions.height, 16/9, REFERENCE_SCREEN_HEIGHT);	
		this.container.x = Math.floor(currentWindowDimensions.width - BEATMAP_CAROUSEL_RIGHT_MARGIN * this.scalingFactor);
	
		updateDarkeningOverlay(this.scalingFactor);
		updateBeatmapSetPanelMasks(this.scalingFactor);
		updateBeatmapDifficultyPanelMasks(this.scalingFactor);
		updateDifficultyColorBar(this.scalingFactor);
		
		this.dragTarget.hitArea = new PIXI.Rectangle(0, 0, currentWindowDimensions.width, currentWindowDimensions.height);
	
		for (let i = 0; i < this.beatmapSetPanels.length; i++) {
			let panel = this.beatmapSetPanels[i];
			panel.needsResize = true;
		}
	}

	setReferencePanel(panel: BeatmapSetPanel, currentYPosition: number) {
		this.referencePanel = panel;
		this.referencePanelY = currentYPosition;
	
		this.snapToReferencePanel(currentYPosition, BEATMAP_SET_PANEL_SNAP_TARGET);
	}

	snapToReferencePanel(from: number, to: number) {
		let now = performance.now();
	
		// It could be that we snap to a position that's off the end of the carousel, where the carousel would normally snap back. Here, we catch this case and only snap as far as we should.
		let lastPanel = last(this.beatmapSetPanels);
		let projectedY = lastPanel.currentNormalizedY - (from - to);
		let diff = CAROUSEL_END_THRESHOLD - (projectedY + lastPanel.getAdditionalExpansionHeight(now));
		if (diff > 0) to += diff;
	
		this.snapToSelectionInterpolator.setValueRange(from, to);
		this.snapToSelectionInterpolator.start(now);
		this.snapToSelected = true;
		this.scrollVelocity = 0;
	}

	showBeatmapSets(beatmapSets: BeatmapSet[], sortingType: BeatmapCarouselSortingType) {
		for (let panel of this.beatmapSetPanels) {
			this.container.removeChild(panel.container);
			panel.interactionGroup.disable();
		}
		this.beatmapSetPanels.length = 0;
	
		beatmapSets = beatmapSets.slice();
		beatmapSets.sort(beatmapCarouselSortingTypeFunctions.get(sortingType));
	
		for (let i = 0; i < beatmapSets.length; i++) {
			let set = beatmapSets[i];
			let cachedPanel = this.panelCache.get(set);
			let panel: BeatmapSetPanel;
	
			if (cachedPanel) {
				panel = cachedPanel;
				panel.interactionGroup.enable();
			} else {
				panel = new BeatmapSetPanel(this, set);
				this.panelCache.set(set, panel);
			}
	
			this.container.addChild(panel.container);
			this.beatmapSetPanels.push(panel);
		}
	
		if (!this.beatmapSetPanels.includes(this.referencePanel)) {
			this.referencePanel = this.beatmapSetPanels[0] || null;
			this.referencePanelY = 200;
			this.scrollVelocity = 100; // For sick effect hehe
		}
	
		this.skipSnapbackNextFrame = true;
		this.snapToSelected = false;
	}
}

export function getNormalizedOffsetOnCarousel(yPosition: number) {
	// -1.0 for top of the screen, 0.0 for middle, 1.0 for bottom
	let normalizedDistanceToCenter = (yPosition - currentWindowDimensions.height/2) / (currentWindowDimensions.height/2);
	let circleHeight = MathUtil.unitCircleContour(normalizedDistanceToCenter / BEATMAP_CAROUSEL_RADIUS_FACTOR);
	if (isNaN(circleHeight)) circleHeight = 1.0;

	return circleHeight * (REFERENCE_SCREEN_HEIGHT/2 * BEATMAP_CAROUSEL_RADIUS_FACTOR);
}