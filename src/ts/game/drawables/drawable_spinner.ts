import { DrawableHitObject } from "./drawable_hit_object";
import { Spinner } from "../../datamodel/spinner";
import { MathUtil, EaseType, TAU } from "../../util/math_util";
import { Point } from "../../util/point";
import { PLAYFIELD_DIMENSIONS, DEFAULT_HIT_OBJECT_FADE_IN_TIME } from "../../util/constants";
import { colorToHexNumber, lerpColors, Color, Colors } from "../../util/graphics_util";
import { SpriteNumber } from "../../visuals/sprite_number";
import { SoundEmitter } from "../../audio/sound_emitter";
import { HitSoundInfo, generateHitSoundInfo, OsuSoundType } from "../skin/sound";
import { ProcessedSpinner } from "../../datamodel/processed/processed_spinner";
import { CurrentTimingPointInfo } from "../../datamodel/processed/processed_beatmap";
import { currentWindowDimensions } from "../../visuals/ui";
import { Interpolator } from "../../util/interpolation";
import { DrawableBeatmap } from "../drawable_beatmap";
import { Mod } from "../../datamodel/mods";
import { ScoringValue } from "../../datamodel/score";
import { PlayEvent, PlayEventType } from "../../datamodel/play_events";

const SPINNER_FADE_IN_TIME = DEFAULT_HIT_OBJECT_FADE_IN_TIME; // In ms
const SPINNER_FADE_OUT_TIME = 200; // In ms
const SPIN_TEXT_FADE_IN_TIME = 200; // In ms
const SPIN_TEXT_FADE_OUT_TIME = 200; // In ms
const SPINNER_GLOW_TINT: Color = {r: 2, g: 170, b: 255};
const SPINNER_METER_STEPS = 10;
const SPINNER_METER_STEP_HEIGHT = 69; // ( ͡° ͜ʖ ͡°)
const SPINNER_ACCELERATION = 0.00039; // In radians/ms^2
const DELAY_UNTIL_SPINNER_DECELERATION = 20; // In ms

export class DrawableSpinner extends DrawableHitObject {
	public parent: ProcessedSpinner;

	public hitSound: HitSoundInfo;
	private container: PIXI.Container;
	private componentContainer: PIXI.Container;
	private componentContainer2: PIXI.Container; // It's like 1, but better

	private clearTextInterpolator: Interpolator;
	private bonusSpinsInterpolator: Interpolator;
	private glowInterpolator: Interpolator;

	private isNewStyle: boolean;

	// New-style elements:
	private spinnerGlow: PIXI.Sprite;
	private spinnerBottom: PIXI.Sprite;
	private spinnerTop: PIXI.Sprite;
	// The following shitty nomenclature is taken from skin file names. Despite being named "middle", they're visually above "top".
	private spinnerMiddle2: PIXI.Sprite;
	private spinnerMiddle: PIXI.Sprite
	private scalablePart: PIXI.Container;

	// Old-style elements:
	private spinnerBackground: PIXI.Sprite;
	private spinnerMeter: PIXI.Container;
	private spinnerMeterMask: PIXI.Graphics;
	private spinnerCircle: PIXI.Container;
	private spinnerApproachCircle: PIXI.Container;

	// Informative elements for both styles
	private spinnerRpm: PIXI.Sprite;
	private spinnerRpmNumber: SpriteNumber;
	private spinnerSpin: PIXI.Sprite;
	private spinnerClear: PIXI.Container;
	private spinnerBonus: SpriteNumber;
	private spinnerSpinFadeOutStart: number;

	private lastSpinPosition: Point;
	private lastInputTime: number;
	private lastAccelerationTime: number;
	private spinnerAngle: number;
	private totalRadiansSpun: number; // The sum of all absolute angles this spinner has been spun (the total "angular distance")
	private cleared: boolean;
	private bonusSpins: number;
	private angularVelocity: number;

	private spinSoundEmitter: SoundEmitter = null;
	// TODO: Clean this up. Ergh. Disgusting.
	private bonusSoundVolume: number;
	
	constructor(drawableBeatmap: DrawableBeatmap, processedSpinner: ProcessedSpinner) {
		super(drawableBeatmap, processedSpinner);

		this.reset();
		this.initSounds(processedSpinner.hitObject, processedSpinner.timingInfo);
	}

	protected initSounds(spinner: Spinner, timingInfo: CurrentTimingPointInfo) {
		let currentTimingPoint = timingInfo.timingPoint;

		this.hitSound = generateHitSoundInfo(spinner.hitSound, spinner.extras.sampleSet, spinner.extras.additionSet, spinner.extras.sampleVolume, spinner.extras.customIndex, currentTimingPoint);
	}

	reset() {
		super.reset();

		if (this.clearTextInterpolator) this.clearTextInterpolator.reset();
		if (this.bonusSoundVolume) this.bonusSpinsInterpolator.reset();
		if (this.glowInterpolator) this.glowInterpolator.reset();

		this.spinnerSpinFadeOutStart = null;
		this.lastSpinPosition = null;
		this.lastInputTime = null;
		this.lastAccelerationTime = null;
		this.spinnerAngle = 0;
		this.totalRadiansSpun = 0;
		this.cleared = false;
		this.bonusSpins = 0;
		this.angularVelocity = 0;

		this.stopSpinningSound();
	}

	compose(updateSkin: boolean) {
		super.compose(updateSkin);
		let { screenPixelRatio, activeMods, skin } = this.drawableBeatmap.play;

		let backgroundTexture = skin.textures["spinnerBackground"];
		this.isNewStyle = backgroundTexture.isEmpty() && skin.getVersionNumber() >= 2.0;

		const createElement = (textureName: string, anchor: PIXI.Point, maxDimensionFactor = 1) => {
			let osuTexture = skin.textures[textureName];
			let sprite = new PIXI.Sprite();

			osuTexture.applyToSprite(sprite, screenPixelRatio, undefined, maxDimensionFactor);
			sprite.anchor.set(anchor.x, anchor.y);

			return sprite;
		};

		if (this.isNewStyle) {
			this.spinnerGlow = createElement("spinnerGlow", new PIXI.Point(0.5, 0.5));
			this.spinnerGlow.tint = colorToHexNumber(SPINNER_GLOW_TINT); // The default slider ball tint
			this.spinnerGlow.blendMode = PIXI.BLEND_MODES.ADD;

			this.spinnerBottom = createElement("spinnerBottom", new PIXI.Point(0.5, 0.5));
			this.spinnerTop = createElement("spinnerTop", new PIXI.Point(0.5, 0.5));
			this.spinnerMiddle2 = createElement("spinnerMiddle2", new PIXI.Point(0.5, 0.5));
			this.spinnerMiddle = createElement("spinnerMiddle", new PIXI.Point(0.5, 0.5));
		} else {
			let approachCircleSprite = createElement("spinnerApproachCircle", new PIXI.Point(0.5, 0.5), 2.0); // Since the approach circle starts out at ~2.0x the scale, use that as the reference for texture quality.
			this.spinnerApproachCircle = new PIXI.Container();
			this.spinnerApproachCircle.addChild(approachCircleSprite);
			if (activeMods.has(Mod.Hidden)) this.spinnerApproachCircle.visible = false; // With HD, all spinner approach circles are hidden

			this.spinnerBackground = createElement("spinnerBackground", new PIXI.Point(0.5, 0.5));
			this.spinnerBackground.y = 5 * screenPixelRatio; // TODO: Where does this come from?
			this.spinnerBackground.tint = colorToHexNumber(skin.config.colors.spinnerBackground);

			if (this.spinnerMeterMask) this.spinnerMeterMask.destroy();
			this.spinnerMeterMask = new PIXI.Graphics();
			this.spinnerMeter = createElement("spinnerMeter", new PIXI.Point(0.0, 0.0));
			this.spinnerMeter.position.set(currentWindowDimensions.width/2 - 512 * screenPixelRatio, 46 * screenPixelRatio);
			this.spinnerMeter.mask = this.spinnerMeterMask;

			this.spinnerCircle = createElement("spinnerCircle", new PIXI.Point(0.5, 0.5));
		}

		// Update spinner RPM display
		let rpmOsuTexture = skin.textures["spinnerRpm"];
		rpmOsuTexture.applyToSprite(this.spinnerRpm, screenPixelRatio);
		this.spinnerRpm.position.set(currentWindowDimensions.width/2 - 139 * screenPixelRatio, currentWindowDimensions.height - 56 * screenPixelRatio);

		this.spinnerRpmNumber.container.position.set(currentWindowDimensions.width/2 + 122 * screenPixelRatio, currentWindowDimensions.height - 50 * screenPixelRatio);
		this.spinnerRpmNumber.options.textures = skin.scoreNumberTextures;
		this.spinnerRpmNumber.options.scaleFactor = screenPixelRatio * 0.85;
		this.spinnerRpmNumber.options.overlap = skin.config.fonts.scoreOverlap;
		this.spinnerRpmNumber.refresh();

		// Update spinner bonus number
		this.spinnerBonus.container.y = 128 * screenPixelRatio;
		this.spinnerBonus.options.textures = skin.scoreNumberTextures;
		this.spinnerBonus.options.scaleFactor = screenPixelRatio * 2;
		this.spinnerBonus.options.overlap = skin.config.fonts.scoreOverlap;
		this.spinnerBonus.refresh();

		// Update "spin" text
		let spinOsuTexture = skin.textures["spinnerSpin"];
		spinOsuTexture.applyToSprite(this.spinnerSpin, screenPixelRatio);
		this.spinnerSpin.y = 198 * screenPixelRatio;

		// Update "clear" text
		let clearSprite = this.spinnerClear.children[0] as PIXI.Sprite;
		let clearOsuTexture = skin.textures["spinnerClear"];
		clearOsuTexture.applyToSprite(clearSprite, screenPixelRatio);
		this.spinnerClear.y = -164 * screenPixelRatio;

		/** Add all elements */
		this.container.removeChildren();
		this.componentContainer.removeChildren();
		this.componentContainer2.removeChildren();
		
		this.container.addChild(this.componentContainer);

		if (this.isNewStyle) {
			this.scalablePart = new PIXI.Container();
			this.scalablePart.addChild(this.spinnerGlow);
			this.scalablePart.addChild(this.spinnerBottom);
			this.scalablePart.addChild(this.spinnerTop);
			this.scalablePart.addChild(this.spinnerMiddle2);
			this.scalablePart.addChild(this.spinnerMiddle);

			this.componentContainer2.addChild(this.scalablePart);
		} else {
			this.componentContainer.addChild(this.spinnerBackground);
			this.container.addChild(this.spinnerMeter);
			this.container.addChild(this.spinnerMeterMask);
			this.componentContainer2.addChild(this.spinnerCircle);
			this.componentContainer2.addChild(this.spinnerApproachCircle);
		}
		
		this.componentContainer2.addChild(this.spinnerSpin);
		this.componentContainer2.addChild(this.spinnerClear);
		this.componentContainer2.addChild(this.spinnerBonus.container);
		
		this.container.addChild(this.spinnerRpm);
		this.container.addChild(this.componentContainer2);
		this.container.addChild(this.spinnerRpmNumber.container); // Above all other elements

		// Update spinning sound effect
		if (updateSkin) {
			let spinner = this.parent.hitObject;
			let currentTimingPoint = this.parent.timingInfo.timingPoint;
			let volume = spinner.extras.sampleVolume || currentTimingPoint.volume,
				index = spinner.extras.customIndex || currentTimingPoint.sampleIndex || 1;

			let emitter = this.drawableBeatmap.play.skin.sounds[OsuSoundType.SpinnerSpin].getEmitter(volume, index);
			if (emitter && !emitter.isReallyShort()) {
				this.stopSpinningSound();

				emitter.setLoopState(true);
				this.spinSoundEmitter = emitter;
			}

			this.bonusSoundVolume = volume;
		}
	}

	draw() {
		this.renderStartTime = this.parent.startTime - SPINNER_FADE_IN_TIME;

		this.container = new PIXI.Container();
		this.container.zIndex = -1e10; // Sliders are always behind everything

		this.componentContainer = new PIXI.Container();
		this.componentContainer2 = new PIXI.Container();
		this.clearTextInterpolator = new Interpolator({
			ease: EaseType.Linear,
			duration: 333
		});
		this.bonusSpinsInterpolator = new Interpolator({
			ease: EaseType.EaseOutQuad,
			duration: 750,
			defaultToFinished: true
		});
		this.glowInterpolator = new Interpolator({
			ease: EaseType.Linear,
			duration: 333,
			defaultToFinished: true
		});

		this.spinnerRpm = new PIXI.Sprite();

		// Add RPM number
		this.spinnerRpmNumber = new SpriteNumber({
			horizontalAlign: "right",
			verticalAlign: "top",
			overlapAtEnd: false
		});
		this.spinnerRpmNumber.setValue(0);

		// Add spinner bonus popup
		let spinnerBonus = new SpriteNumber({
			horizontalAlign: "center",
			verticalAlign: "middle"
		});
		this.spinnerBonus = spinnerBonus;

		this.spinnerSpin = new PIXI.Sprite();
		this.spinnerSpin.anchor.set(0.5, 0.5);

		let spinnerClearSprite = new PIXI.Sprite();
		spinnerClearSprite.anchor.set(0.5, 0.5);
		this.spinnerClear = new PIXI.Container();
		this.spinnerClear.addChild(spinnerClearSprite);
	}

	show() {
		let controller = this.drawableBeatmap.play.controller;

		controller.hitObjectContainer.addChild(this.container);
	}

	position() {
		let screenCoordinates = this.drawableBeatmap.play.toScreenCoordinates(this.parent.startPoint);

		// Position it in the center
		this.componentContainer.position.set(screenCoordinates.x, screenCoordinates.y);
		this.componentContainer2.position.copyFrom(this.componentContainer.position);
	}

	remove() {
		const controller = this.drawableBeatmap.play.controller;
		controller.hitObjectContainer.removeChild(this.container);
	}

	dispose() {
		if (this.spinnerMeterMask) this.spinnerMeterMask.destroy();
		this.spinnerMeter.mask = null;
	}

	update(currentTime: number) {
		let { screenPixelRatio, skin } = this.drawableBeatmap.play;

		if (currentTime >= this.parent.endTime + SPINNER_FADE_OUT_TIME) {
			this.renderFinished = true;
			return;
		}

		super.update(currentTime);

		if (currentTime < this.parent.startTime) {
			let fadeInCompletion = (currentTime - (this.parent.startTime - SPINNER_FADE_IN_TIME)) / SPINNER_FADE_IN_TIME;
			fadeInCompletion = MathUtil.clamp(fadeInCompletion, 0, 1);
			this.container.alpha = fadeInCompletion;

			let spinTextFadeInCompletion = (currentTime - (this.parent.startTime - SPIN_TEXT_FADE_IN_TIME)) / SPIN_TEXT_FADE_IN_TIME;
			spinTextFadeInCompletion = MathUtil.clamp(spinTextFadeInCompletion, 0, 1);
			this.spinnerSpin.alpha = spinTextFadeInCompletion;

			this.spinnerRpm.y = MathUtil.lerp(currentWindowDimensions.height, currentWindowDimensions.height - 56 * screenPixelRatio, fadeInCompletion);
		} else {
			this.container.alpha = 1;
			if (currentTime >= this.parent.endTime) {
				let fadeOutCompletion = (currentTime - this.parent.endTime) / SPINNER_FADE_OUT_TIME;
				fadeOutCompletion = MathUtil.clamp(fadeOutCompletion, 0, 1);
				this.container.alpha = 1 - fadeOutCompletion;
			}

			let spinnerSpinAlpha = 1;
			if (this.spinnerSpinFadeOutStart !== null) {
				let completion = (currentTime -  this.spinnerSpinFadeOutStart) / SPIN_TEXT_FADE_OUT_TIME;
				completion = MathUtil.clamp(completion, 0, 1);
				spinnerSpinAlpha = 1 - completion;
			}

			this.spinnerSpin.alpha = spinnerSpinAlpha;

			this.spinnerRpm.y = currentWindowDimensions.height - 56 * screenPixelRatio;
		}
	
		let completion = (currentTime - this.parent.startTime) / this.parent.duration;
		completion = MathUtil.clamp(completion, 0, 1);
		let clearCompletion = this.getSpinsSpun() / this.parent.requiredSpins;
		clearCompletion = MathUtil.clamp(clearCompletion, 0, 1);

		if (this.isNewStyle) {
			this.spinnerBottom.rotation = this.spinnerAngle * 0.2;
			this.spinnerTop.rotation = this.spinnerAngle * 0.5;
			this.spinnerMiddle2.rotation = this.spinnerAngle * 1.0;

			(this.spinnerMiddle as PIXI.Sprite).tint = colorToHexNumber(lerpColors(Colors.White, Colors.Red, completion));

			this.spinnerGlow.alpha = clearCompletion;

			let totalScale = MathUtil.lerp(0.82, 1.0, MathUtil.ease(EaseType.EaseOutQuad, clearCompletion));
			this.scalablePart.scale.set(totalScale);

			let glowCompletion = this.glowInterpolator.getCurrentValue(currentTime);
			(this.spinnerGlow as PIXI.Sprite).tint = colorToHexNumber(lerpColors(Colors.White, SPINNER_GLOW_TINT, glowCompletion));
		} else {
			this.spinnerApproachCircle.scale.set(MathUtil.lerp(1.85, 0.1, completion)); // Quote Google docs: "starts at 200% of its size and shrinks down to 10%". Changed to 185% 'cause I have eyes.

			this.spinnerCircle.rotation = this.spinnerAngle;

			// Do meter mask stuff:
			{
				let mask = this.spinnerMeterMask;

				let completedSteps = Math.floor(clearCompletion * SPINNER_METER_STEPS);
				let completion = completedSteps / SPINNER_METER_STEPS; // Quantize this shit

				// For a lack of better names:
				let a = Math.max(0, completedSteps-1);
				let b = a / SPINNER_METER_STEPS;

				// Draw all steps below the top step:
				mask.clear();
				mask.beginFill(0xFF0000);
				mask.drawRect(0, (49 + (1-b)*SPINNER_METER_STEP_HEIGHT*SPINNER_METER_STEPS) * screenPixelRatio, currentWindowDimensions.width, b*SPINNER_METER_STEP_HEIGHT*SPINNER_METER_STEPS * screenPixelRatio);
				mask.endFill();

				// Using the noise, create the 'flicker' effect.
				if (completedSteps > 0 && ((completedSteps === SPINNER_METER_STEPS && skin.config.general.spinnerNoBlink) || MathUtil.valueNoise1D(currentTime / 50) < 0.6)) {
					// Draw the top step:
					mask.beginFill(0xFF0000);
					mask.drawRect(0, (49 + (1-completion)*SPINNER_METER_STEP_HEIGHT*SPINNER_METER_STEPS) * screenPixelRatio, currentWindowDimensions.width, SPINNER_METER_STEP_HEIGHT * screenPixelRatio);
					mask.endFill();
				}
			}
		}

		let clearTextAnimationCompletion = this.clearTextInterpolator.getCurrentValue(currentTime);
		let parabola = 1.94444 * clearTextAnimationCompletion**2 - 2.69444 * clearTextAnimationCompletion + 1.75;
		this.spinnerClear.scale.set(parabola);
		this.spinnerClear.alpha = clearTextAnimationCompletion;

		let bonusSpinsCompletion = this.bonusSpinsInterpolator.getCurrentValue(currentTime);
		this.spinnerBonus.container.scale.set(MathUtil.lerp(1.0, 0.666, bonusSpinsCompletion));
		this.spinnerBonus.container.alpha = 1 - bonusSpinsCompletion;

		this.componentContainer.pivot.y = MathUtil.ease(EaseType.EaseInQuad, this.failAnimationCompletion) * -150 * screenPixelRatio;
		this.componentContainer2.pivot.y = this.componentContainer.pivot.y;
	}

	score() {
		let play = this.drawableBeatmap.play;

		let spinsSpun = this.getSpinsSpun();
		let progress = spinsSpun / this.parent.requiredSpins;
		let judgement = (() => {
			if (progress >= 1.0) {
				return ScoringValue.Hit300;
			} else if (progress > 0.9) {
				return ScoringValue.Hit100;
			} else if (progress > 0.75) {
				return ScoringValue.Hit50;
			}
			return ScoringValue.Miss;
		})();

		play.scoreCounter.add(judgement, false, true, true, this, this.parent.endTime);
		if (judgement !== 0) {
			play.playHitSound(this.hitSound);
		}

		this.stopSpinningSound();
	}

	getSpinsSpun() {
		return this.totalRadiansSpun / TAU;
	}

	handleMouseMove(osuMouseCoordinates: Point, currentTime: number, pressed: boolean) {
		if (currentTime < this.parent.startTime || currentTime >= this.parent.endTime) return;

		if (!pressed) {
			if (this.lastSpinPosition !== null) {
				this.lastSpinPosition = null;
			}
			
			return;
		}

		if (this.lastSpinPosition === null) {
			this.lastSpinPosition = osuMouseCoordinates;
			this.lastInputTime = currentTime;
			return;
		}

		let p1 = osuMouseCoordinates,
			p2 = this.lastSpinPosition;
		let angle1 = Math.atan2(p2.y - PLAYFIELD_DIMENSIONS.height/2, p2.x - PLAYFIELD_DIMENSIONS.width/2),
			angle2 = Math.atan2(p1.y - PLAYFIELD_DIMENSIONS.height/2, p1.x - PLAYFIELD_DIMENSIONS.width/2);
		let theta = MathUtil.getNormalizedAngleDelta(angle1, angle2);
		
		let timeDelta = currentTime - this.lastInputTime; // In ms
		if (timeDelta <= 0) return;

		this.spin(theta, currentTime, timeDelta);

		this.lastSpinPosition = osuMouseCoordinates;
	}

	/** Spins the spinner by a certain amount in a certain timeframe. */
	spin(radians: number, currentTime: number, dt: number) {
		if (currentTime < this.parent.startTime || currentTime >= this.parent.endTime) return;
		if (!dt) return;

		const hud = this.drawableBeatmap.play.controller.hud;
		hud.accuracyMeter.fadeOutNow(currentTime);

		let radiansAbs = Math.abs(radians);
		let velocityAbs = Math.abs(this.angularVelocity);
		let radiansPerMs = radiansAbs/dt;

		if (radiansPerMs >= velocityAbs && (Math.sign(radians) === Math.sign(this.angularVelocity) || this.angularVelocity === 0)) {
			let vel = Math.min(radiansPerMs, velocityAbs + SPINNER_ACCELERATION * dt);
			this.angularVelocity = vel * Math.sign(radians);
			this.lastAccelerationTime = currentTime;
		} else {
			this.tryDecelerate(currentTime, dt, (Math.sign(radians) === Math.sign(this.angularVelocity))? radiansPerMs : 0);
		}

		// Limit angular velocity to 0.05 radians/ms, because of the 477 RPM limit!
		this.angularVelocity = Math.sign(this.angularVelocity) * Math.min(Math.abs(this.angularVelocity), 0.05);

		this.lastInputTime = currentTime;
	}

	private tryDecelerate(currentTime: number, dt: number, minVelocity: number) {
		if (this.lastAccelerationTime !== null && currentTime - this.lastAccelerationTime >= DELAY_UNTIL_SPINNER_DECELERATION) {
			let previousTime = currentTime-dt;
			let adjustedDt = currentTime - Math.max(previousTime, this.lastAccelerationTime + DELAY_UNTIL_SPINNER_DECELERATION); // We need to adjust here to be tick-frequency independent

			let abs = Math.abs(this.angularVelocity);
			let thing = Math.max(0, abs - SPINNER_ACCELERATION * adjustedDt);
			this.angularVelocity = Math.max(thing, minVelocity) * Math.sign(this.angularVelocity);
		}
	}

	tick(currentTime: number, dt: number) {
		if (!dt) return;

		let { scoreCounter, skin } = this.drawableBeatmap.play;

		this.tryDecelerate(currentTime, dt, 0);

		let angle = this.angularVelocity * dt;
		let spinsPerMinute = Math.abs(this.angularVelocity) * 1000 * 60 / TAU;
		this.spinnerRpmNumber.setValue(Math.floor(spinsPerMinute));
		scoreCounter.addSpinRpm(spinsPerMinute);

		let prevSpinsSpun = this.getSpinsSpun();

		this.spinnerAngle += angle;
		this.totalRadiansSpun += Math.abs(angle);

		let spinsSpunNow = this.getSpinsSpun();
		let wholeDif = Math.floor(spinsSpunNow) - Math.floor(prevSpinsSpun);
		if (wholeDif > 0) {
			// Give 100 raw score for every spin
			scoreCounter.add(wholeDif * 100, true, false, false, this, currentTime);
		}
		if (spinsSpunNow >= this.parent.requiredSpins && !this.cleared) {
			this.cleared = true;
			this.clearTextInterpolator.start(currentTime);
		}
		let bonusSpins = Math.floor(spinsSpunNow - this.parent.requiredSpins);
		if (bonusSpins > 0 && bonusSpins > this.bonusSpins) {
			let dif = bonusSpins - this.bonusSpins;
			scoreCounter.add(dif * 1000, true, false, false, this, currentTime);

			this.bonusSpins = bonusSpins;
			this.spinnerBonus.setValue(this.bonusSpins * 1000);
			this.bonusSpinsInterpolator.start(currentTime);
			this.glowInterpolator.start(currentTime);

			skin.sounds[OsuSoundType.SpinnerBonus].play(this.bonusSoundVolume);
		}

		let spinCompletion = spinsSpunNow / this.parent.requiredSpins;
		if (spinCompletion >= 0.25 && this.spinnerSpinFadeOutStart === null) {
			this.spinnerSpinFadeOutStart = currentTime;
		}

		if (this.spinSoundEmitter) {
			if (!this.spinSoundEmitter.isPlaying() && this.angularVelocity !== 0) this.spinSoundEmitter.start();
			if (this.angularVelocity === 0) this.stopSpinningSound();

			if (skin.config.general.spinnerFrequencyModulate) this.spinSoundEmitter.setPlaybackRate(Math.min(2, spinCompletion*0.85 + 0.5));
		}
	}

	stopSpinningSound() {
		if (this.spinSoundEmitter) this.spinSoundEmitter.stop();
	}

	handleButtonDown() {
		return false;
	}

	handlePlayEvent(event: PlayEvent, osuMouseCoordinates: Point, buttonPressed: boolean, currentTime: number, dt: number) {
		let play = this.drawableBeatmap.play;

		switch (event.type) {
			case PlayEventType.SpinnerEnd: {
				this.score();
			}; break;
			// Sustained event:
			case PlayEventType.SpinnerSpin: {
				this.tick(currentTime, dt);

				// Spin counter-clockwise as fast as possible. Clockwise just looks shit.
				if (play.hasAutohit() || play.activeMods.has(Mod.SpunOut)) this.spin(-1e9, currentTime, 1);
			}; break;
		}
	}
}