import { Scrollbar } from "./scrollbar";
import { InteractionGroup, InteractionRegistration } from "../../input/interactivity";
import { InterpolatedValueChanger } from "../../util/interpolation";
import { EaseType, MathUtil } from "../../util/math_util";

const scrollEase = EaseType.EaseOutQuint;
const scrollDuration = 700;

export class ScrollContainer {
	public container: PIXI.Container;
	/** The container to which all the content should be added. */
	public contentContainer: PIXI.Container;
	public interactionGroup: InteractionGroup;
	/** The interaction group to which all interactivity with the content should be added. */
	public contentInteractionGroup: InteractionGroup;
	private registration: InteractionRegistration;
	private mask: PIXI.Sprite;

	/** The padding around the content */
	private padding: number = 0;
	private width: number = 100;
	private height: number = 100;

	private scrollbar: Scrollbar;
	private scrollbarScalingFactor = 1;
	private scrollInterpolator: InterpolatedValueChanger;
	private scrollScalingFactor = 1;
	/** Whether or not the container is currently being dragged. */
	private dragging = false;

	constructor() {
		this.container = new PIXI.Container();
		this.container.hitArea = new PIXI.Rectangle();
		this.interactionGroup = new InteractionGroup();

		// Set up the registration that listens to wheel and drag events
		this.registration = new InteractionRegistration(this.container);
		this.registration.setZIndex(1);
		this.registration.passThrough = true;
		this.interactionGroup.add(this.registration);

		this.contentInteractionGroup = new InteractionGroup();
		this.interactionGroup.add(this.contentInteractionGroup);

		this.contentContainer = new PIXI.Container();
		this.container.addChild(this.contentContainer);

		// Add a mask so that content cannot overflow the container
		this.mask = new PIXI.Sprite(PIXI.Texture.WHITE);
		this.container.addChild(this.mask);
		this.container.mask = this.mask;

		this.scrollbar = new Scrollbar();
		this.container.addChild(this.scrollbar.container);

		this.scrollInterpolator = new InterpolatedValueChanger({
			initial: 0,
			duration: scrollDuration,
			ease: scrollEase
		});

		this.registration.addListener('wheel', (e) => {
			if (!this.isScrollable()) return;

			let now = performance.now();

			// Set the new goal based on the scroll position far in the future, so that you can increase scrolling speed by scrolling frequently
			let newGoal = this.getCurrentScrollPosition(now + 1e6) + e.dy * 0.75;
			this.scrollInterpolator.reset(this.getCurrentScrollPosition(now));
			this.scrollInterpolator.setGoal(newGoal, now);
		});
		this.registration.makeDraggable(() => {
			this.scrollInterpolator.reset(this.getCurrentScrollPosition(performance.now()));
			this.dragging = true;
		}, (e) => {
			if (!this.isScrollable()) return;

			let now = performance.now();
			let pos = this.getCurrentScrollPosition(now);
			let overshot = 0;
			let scrollHeight = this.getScrollHeight();

			if (pos < 0) {
				overshot = 0 - pos;
			} else if (pos > scrollHeight / this.scrollScalingFactor) {
				overshot = pos - scrollHeight / this.scrollScalingFactor;
			}

			// Reduce effectiveness of the drag based on how much the container is currently overshot
			let dragEffectiveness = Math.pow(0.5, overshot / 20);
			let newGoal = this.scrollInterpolator.getCurrentValue(now) - e.movement.y / this.scrollScalingFactor * dragEffectiveness;
			this.scrollInterpolator.reset(newGoal);

			if (Math.abs(e.distanceFromStart.y) >= 5) {
				// If more than a few pixels have been dragged, cancel all ongoing presses in the content in order to prevent dragging triggering some other input action.
				this.contentInteractionGroup.releaseAllPresses();
			}
		}, (e) => {
			if (this.isScrollable()) {
				// We figure out what the next scroll goal needs to be in order for the ease to begin with the same velocity that the dragging ended with.
				let startSlope = MathUtil.easeSlope(scrollEase, 0);
				let goalDelta = e.velocity.y * (scrollDuration / 1000)  / startSlope;
				let now = performance.now();
				this.scrollInterpolator.setGoal(this.getCurrentScrollPosition(now) - goalDelta, now);
			}

			this.dragging = false;
		});
	}

	setPadding(padding: number) {
		this.padding = padding;
	}

	setWidth(width: number) {
		this.width = width;
	}

	setHeight(height: number) {
		this.height = height;
	}

	setScrollScalingFactor(factor: number) {
		this.scrollScalingFactor = factor;
	}

	setScrollbarScalingFactor(factor: number) {
		this.scrollbarScalingFactor = factor;
	}

	private getScrollHeight() {
		return this.contentContainer.height - (this.height - 2 * this.padding);
	}
	
	private isScrollable() {
		return this.getScrollHeight() > 0;
	}

	private getCurrentScrollPosition(now: number) {
		let scrollPosition = this.scrollInterpolator.getCurrentValue(now);
		let scrollHeight = this.getScrollHeight();

		block:
		if (!this.dragging) {
			// It could be that the goal lies outside the regular scrolling range, in which case we want to "rubber band" back.

			let target: number = null;
			let currentGoal = this.scrollInterpolator.getCurrentGoal();

			if (currentGoal < 0) {
				target = 0;
			} else if (currentGoal > scrollHeight / this.scrollScalingFactor) {
				target = scrollHeight / this.scrollScalingFactor;
			}

			if (target === null) break block;

			// Find the point in time where the scrolling crosses outside of the regular scrolling range
			let when = MathUtil.findRootInInterval(t => {
				return this.scrollInterpolator.getCurrentValue(this.scrollInterpolator.getStartTime() + t) - target;
			}, 0, scrollDuration);

			// Check NaN for cases where scrolling began outside of the regular scrolling range
			if (isNaN(when)) when = 0;

			// Now, we lerp between the raw scrolling position (out of bounds), and the actual correct edge of the scrolling area. This will cause a bounce-back effect.
			let lerpCompletion = (now - when - this.scrollInterpolator.getStartTime()) / (scrollDuration - when);
			lerpCompletion = MathUtil.clamp(lerpCompletion, 0, 1);
			lerpCompletion = MathUtil.ease(EaseType.EaseOutCubic, lerpCompletion);

			scrollPosition = MathUtil.lerp(scrollPosition, target, lerpCompletion);
		}

		return scrollPosition;
	}

	update(now: number) {
		this.mask.width = this.width;
		this.mask.height = this.height;
		let hitRec = this.container.hitArea as PIXI.Rectangle;
		hitRec.width = this.width;
		hitRec.height = this.height;

		this.contentContainer.x = this.padding;

		let scrollHeight = this.getScrollHeight();

		if (scrollHeight <= 0) {
			// If there container is too small to scroll, hide the scrollbar and fix the position.
			this.contentContainer.y = this.padding;
			this.scrollbar.container.visible = false;
		} else {
			let scrollPosition = this.getCurrentScrollPosition(now);
			let scaledScrollPosition = scrollPosition * this.scrollScalingFactor;
			this.contentContainer.y = this.padding + Math.floor(-scaledScrollPosition);

			this.scrollbar.setScaling(this.height, this.scrollbarScalingFactor);
			this.scrollbar.setScrollHeight(scrollHeight);
			this.scrollbar.setPageHeight(this.height - 2 * this.padding);
			this.scrollbar.setCurrentPosition(scaledScrollPosition);
			this.scrollbar.update();
			
			this.scrollbar.container.visible = true;
			this.scrollbar.container.x = this.width - this.scrollbar.container.width;
		}
	}
}