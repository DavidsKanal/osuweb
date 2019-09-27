import { Slider } from "../datamodel/slider";
import { MathUtil, EaseType } from "../util/math_util";
import { Point, interpolatePointInPointArray, pointDistance } from "../util/point";
import { gameState } from "./game_state";
import { SLIDER_TICK_APPEARANCE_ANIMATION_DURATION, FOLLOW_CIRCLE_THICKNESS_FACTOR, HIT_OBJECT_FADE_OUT_TIME, CIRCLE_BORDER_WIDTH, DRAWING_MODE, DrawingMode, SHOW_APPROACH_CIRCLE_ON_FIRST_HIDDEN_OBJECT, SLIDER_SETTINGS } from "../util/constants";
import { colorToHexNumber, Colors, colorToHexString } from "../util/graphics_util";
import { PlayEvent, PlayEventType } from "./play_events";
import { assert, last } from "../util/misc_util";
import { accuracyMeter } from "./hud";
import { HeadedDrawableHitObject, SliderScoring, getDefaultSliderScoring } from "./headed_drawable_hit_object";
import { HitCirclePrimitiveFadeOutType, HitCirclePrimitive, HitCirclePrimitiveType } from "./hit_circle_primitive";
import { HitSoundInfo, AnimatedOsuSprite, DEFAULT_COLORS } from "./skin";
import { SoundEmitter } from "../audio/sound_emitter";
import { sliderBodyContainer, renderer, mainHitObjectContainer } from "../visuals/rendering";
import { ScoringValue } from "./scoring_value";
import { Mod } from "./mods";
import { createSliderBodyShader, SLIDER_BODY_MESH_STATE } from "./slider_body_shader";
import { SliderPath, SliderPathBounds } from "./slider_path";

export const FOLLOW_CIRCLE_HITBOX_CS_RATIO = 308/128; // Based on a comment on the osu website: "Max size: 308x308 (hitbox)"
const FOLLOW_CIRCLE_SCALE_IN_DURATION = 200;
const FOLLOW_CIRCLE_SCALE_OUT_DURATION = 200;
const FOLLOW_CIRCLE_PULSE_DURATION = 200;
const MAX_SLIDER_BALL_SLIDER_VELOCITY = 0.25; // In osu pixels per millisecond. This variable is used to cap the rotation speed on slider balls for very fast sliders.
const HIDDEN_TICK_FADE_OUT_DURATION = 400;

export interface SliderTimingInfo {
    msPerBeat: number,
    msPerBeatMultiplier: number,
    sliderVelocity: number
}

interface SliderBounds extends SliderPathBounds {
    width: number,
    height: number,
    screenWidth: number,
    screenHeight: number
}

export class DrawableSlider extends HeadedDrawableHitObject {
    public baseSprite: PIXI.Sprite;
    public overlayContainer: PIXI.Container;
    public sliderBall: SliderBall;
    public sliderTickContainer: PIXI.Container;
    private followCircle: PIXI.Container;
    private followCircleAnimator: AnimatedOsuSprite;
    public sliderEnds: HitCirclePrimitive[];
    public hitCirclePrimitiveContainer: PIXI.Container;
    public reverseArrowContainer: PIXI.Container;

    /** The "visual other end" of the slider. Not necessarily where the slider ends (because of repeats); for that, refer to endPoint instead. */
    public tailPoint: Point;
    public duration: number;
    public complete: boolean;
    public path: SliderPath;
    public bounds: SliderBounds;
    public timingInfo: SliderTimingInfo;
    public hitObject: Slider;
    public sliderTickCompletions: number[];
    public sliderTickElements: (PIXI.Container | null)[];
    public scoring: SliderScoring;
    public hitSounds: HitSoundInfo[];
    public tickSounds: HitSoundInfo[];
    public slideEmitters: SoundEmitter[];

    public sliderBodyMesh: PIXI.Mesh;
    public sliderBodyHasBeenRendered = false;
    public lastGeneratedSnakingCompletion = 0;

    constructor(hitObject: Slider) {
        super(hitObject);
    }

    init() {
        let { circleDiameterOsuPx, pixelRatio } = gameState.currentPlay;

        this.complete = true;
        this.endTime = this.startTime + this.hitObject.repeat * this.hitObject.length / this.timingInfo.sliderVelocity;
        this.duration = this.endTime - this.startTime;

        this.path = SliderPath.fromSlider(this.hitObject);

        this.tailPoint = this.path.getPosFromPercentage(1.0);

        if (this.hitObject.repeat % 2 === 0) {
            this.endPoint = this.startPoint;
        } else {
            this.endPoint = this.tailPoint;
        }

        let bounds = this.path.calculatePathBounds() as SliderBounds;
        bounds.width = bounds.maxX - bounds.minX + circleDiameterOsuPx;
        bounds.height = bounds.maxY - bounds.minY + circleDiameterOsuPx;
        bounds.screenWidth = bounds.width * pixelRatio;
        bounds.screenHeight = bounds.height * pixelRatio;
        this.bounds = bounds;

        this.scoring = getDefaultSliderScoring();
    }

    toRelativeCoord(pos: Point): Point {
        let { pixelRatio, circleRadius } = gameState.currentPlay;

        return {
            x: (pos.x - this.bounds.minX) * pixelRatio + circleRadius,
            y: (pos.y - this.bounds.minY) * pixelRatio + circleRadius
        };
    }

    draw() {
        let { circleDiameter, approachTime, circleRadiusOsuPx, headedHitObjectTextureFactor, activeMods } = gameState.currentPlay;

        let hasHidden = activeMods.has(Mod.Hidden);

        this.renderStartTime = this.startTime - gameState.currentPlay.approachTime;
    
        this.head = new HitCirclePrimitive({
            fadeInStart: this.startTime - approachTime,
            comboInfo: this.comboInfo,
            hasApproachCircle: !hasHidden || (this.index === 0 && SHOW_APPROACH_CIRCLE_ON_FIRST_HIDDEN_OBJECT),
            hasNumber: true,
            type: HitCirclePrimitiveType.SliderHead
        });

        let relativeStartPos = this.toRelativeCoord({x: this.startPoint.x, y: this.startPoint.y});
        let relativeEndPos = this.toRelativeCoord({x: this.tailPoint.x, y: this.tailPoint.y});

        this.head.container.x = relativeStartPos.x;
        this.head.container.y = relativeStartPos.y;

        this.hitCirclePrimitiveContainer = new PIXI.Container();
        this.hitCirclePrimitiveContainer.addChild(this.head.container);
        this.reverseArrowContainer = new PIXI.Container();

        this.path.generatePointData();
        this.path.generateBaseVertexBuffer();

        this.sliderEnds = [];
        let msPerRepeatCycle = this.hitObject.length / this.timingInfo.sliderVelocity;
        for (let i = 0; i < this.hitObject.repeat; i++) {
            let pos = (i % 2 === 0)? relativeEndPos : relativeStartPos;
            
            let fadeInStart: number;
            if (i === 0) {
                fadeInStart = this.startTime - approachTime;

                if (SLIDER_SETTINGS.snaking) {
                    fadeInStart += approachTime/3; // Snaking takes one third of approach time.
                }
            } else {
                fadeInStart = this.startTime + (i-1) * msPerRepeatCycle;
            }

            let reverseArrowAngle: number;
            if (i < this.hitObject.repeat-1) {
                if (i % 2 === 0) {
                    let angle = this.path.getAngleFromPercentage(1);
                    angle = MathUtil.constrainRadians(angle + Math.PI); // Turn it by 180°

                    reverseArrowAngle = angle;
                } else {
                    reverseArrowAngle = this.path.getAngleFromPercentage(0);
                }
            }

            let primitive = new HitCirclePrimitive({
                fadeInStart: fadeInStart,
                comboInfo: this.comboInfo,
                hasApproachCircle: false,
                hasNumber: false,
                reverseArrowAngle: reverseArrowAngle,
                type: HitCirclePrimitiveType.SliderEnd,
                baseElementsHidden: hasHidden && i > 0
            });

            primitive.container.x = pos.x;
            primitive.container.y = pos.y;

            this.sliderEnds.push(primitive);
            this.hitCirclePrimitiveContainer.addChildAt(primitive.container, 0);

            if (primitive.reverseArrow !== null) {
                primitive.reverseArrow.x = pos.x;
                primitive.reverseArrow.y = pos.y;
                this.reverseArrowContainer.addChildAt(primitive.reverseArrow, 0);
            }
        }

        let renderTex = PIXI.RenderTexture.create({width: this.bounds.screenWidth, height: this.bounds.screenHeight});
        let renderTexFramebuffer = (renderTex.baseTexture as any).framebuffer as PIXI.Framebuffer;
        renderTexFramebuffer.enableDepth();
        renderTexFramebuffer.addDepthTexture();

        // Good enough for now.
        let aaFilter = new PIXI.filters.FXAAFilter();

        this.baseSprite = new PIXI.Sprite(renderTex);
        this.baseSprite.filters = [aaFilter];

        let sliderBodyDefaultSnake = SLIDER_SETTINGS.snaking? 0.0 : 1.0;
        let sliderBodyGeometry = this.path.generateGeometry(sliderBodyDefaultSnake);
        this.lastGeneratedSnakingCompletion = sliderBodyDefaultSnake;
        let sliderBodyShader = createSliderBodyShader(this);
        let sliderBodyMesh = new PIXI.Mesh(sliderBodyGeometry, sliderBodyShader, SLIDER_BODY_MESH_STATE);
        sliderBodyMesh.size = this.path.currentVertexCount;
        this.sliderBodyMesh = sliderBodyMesh;

        this.sliderBall = new SliderBall(this);
        this.sliderBall.container.visible = false;

        if (DRAWING_MODE === DrawingMode.Procedural) {
            let followCircle = new PIXI.Graphics();
            let thickness = FOLLOW_CIRCLE_THICKNESS_FACTOR * circleDiameter;
            followCircle.lineStyle(thickness, 0xFFFFFF);
            followCircle.drawCircle(0, 0, (circleDiameter - thickness) / 2);

            this.followCircle = followCircle;
        } else if (DRAWING_MODE === DrawingMode.Skin) {
            let osuTexture = gameState.currentGameplaySkin.textures["followCircle"];
            let animator = new AnimatedOsuSprite(osuTexture, headedHitObjectTextureFactor);
            animator.setFps(gameState.currentGameplaySkin.config.general.animationFramerate);
            animator.play(this.startTime);

            let wrapper = new PIXI.Container();
            wrapper.addChild(animator.sprite);

            this.followCircle = wrapper;
            this.followCircleAnimator = animator;
        }
        this.followCircle.visible = false;

        this.sliderTickContainer = new PIXI.Container();
        this.sliderTickElements = [];

        for (let i = 0; i < this.sliderTickCompletions.length; i++) {
            let completion = this.sliderTickCompletions[i];
            if (completion >= 1) break;

            let sliderTickPos = this.path.getPosFromPercentage(MathUtil.mirror(completion));

            // Check if the tick overlaps with either slider end
            if (pointDistance(sliderTickPos, this.startPoint) <= circleRadiusOsuPx || pointDistance(sliderTickPos, this.tailPoint) <= circleRadiusOsuPx) {
                // If it does, hide it.
                this.sliderTickElements.push(null);
                continue;
            }

            let tickElement: PIXI.Container;
            if (DRAWING_MODE === DrawingMode.Procedural) {
                let graphics = new PIXI.Graphics();

                graphics.beginFill(0xFFFFFF);
                graphics.drawCircle(0, 0, circleDiameter * 0.038);
                graphics.endFill();

                tickElement = graphics;
            } else if (DRAWING_MODE === DrawingMode.Skin) {
                let osuTexture = gameState.currentGameplaySkin.textures["sliderTick"];
                let sprite = new PIXI.Sprite();
                sprite.anchor.set(0.5, 0.5);

                osuTexture.applyToSprite(sprite, headedHitObjectTextureFactor);

                let wrapper = new PIXI.Container();
                wrapper.addChild(sprite);

                tickElement = wrapper;
            }

            let ctxPos = this.toRelativeCoord(sliderTickPos);

            tickElement.x = ctxPos.x;
            tickElement.y = ctxPos.y;

            this.sliderTickContainer.addChild(tickElement);
            this.sliderTickElements.push(tickElement);
        }

        this.overlayContainer = new PIXI.Container();
        if (this.sliderTickCompletions.length > 0) this.overlayContainer.addChild(this.sliderTickContainer);
        this.overlayContainer.addChild(this.sliderBall.container);
        this.overlayContainer.addChild(this.followCircle);

        this.container.addChild(this.hitCirclePrimitiveContainer);
        this.container.addChild(this.reverseArrowContainer);
        this.container.addChild(this.overlayContainer);
    }
    
    show(currentTime: number) {
        sliderBodyContainer.addChildAt(this.baseSprite, 0);

        super.show(currentTime);
    }

    position() {
        super.position(); // Haha, superposition. Yes. This joke is funny and not funny at the same time. Until observed, of course.

        let { circleRadiusOsuPx } = gameState.currentPlay;

        let screenX = gameState.currentPlay.toScreenCoordinatesX(this.bounds.minX - circleRadiusOsuPx);
        let screenY = gameState.currentPlay.toScreenCoordinatesY(this.bounds.minY - circleRadiusOsuPx);

        this.container.position.set(screenX, screenY);
        this.baseSprite.position.set(screenX, screenY);
    }

    update(currentTime: number) {
        let { approachTime, activeMods } = gameState.currentPlay;

        if (currentTime > this.endTime + HIT_OBJECT_FADE_OUT_TIME) {
            this.renderFinished = true;
            return;
        }

        this.updateHeadElements(currentTime);
        
        let hasHidden = activeMods.has(Mod.Hidden);
        let fadeInCompletion = this.head.getFadeInCompletion(currentTime, hasHidden);
        let fadeOutCompletion = (currentTime - (this.endTime)) / HIT_OBJECT_FADE_OUT_TIME;
        fadeOutCompletion = MathUtil.clamp(fadeOutCompletion, 0, 1);
        fadeOutCompletion = MathUtil.ease(EaseType.EaseOutQuad, fadeOutCompletion);

        if (hasHidden) {
            let bodyFadeOutCompletion = (currentTime - (this.startTime - 2/3 * approachTime)) / (this.duration + 2/3 * approachTime); // Slider body fades from from the millisecond the fade in is complete to the end of the slider
            bodyFadeOutCompletion = MathUtil.clamp(bodyFadeOutCompletion, 0, 1);
            bodyFadeOutCompletion = MathUtil.ease(EaseType.EaseOutQuad, bodyFadeOutCompletion);

            this.baseSprite.alpha = fadeInCompletion * (1 - bodyFadeOutCompletion);
        } else {
            if (currentTime < this.endTime) this.baseSprite.alpha = fadeInCompletion;
            else this.baseSprite.alpha = 1 - fadeOutCompletion;
        }

        if (currentTime < this.endTime) this.overlayContainer.alpha = fadeInCompletion;
        else this.overlayContainer.alpha = 1 - fadeOutCompletion;

        this.updateSliderBody(currentTime);
        this.updateSubelements(currentTime);
    }

    remove() {
        super.remove();

        sliderBodyContainer.removeChild(this.baseSprite);

        // CLEAN UP THAT DARN VRAM! GIMME VRAM!
        this.baseSprite.texture.destroy(true);
        this.sliderBodyMesh.geometry.dispose();
        this.sliderBodyMesh.destroy();
    }

    addPlayEvents(playEventArray: PlayEvent[]) {
        super.addPlayEvents(playEventArray);

        /* NO!
        if (true || this.curve instanceof SliderCurveBézier) {
            playEventArray.push({
                type: PlayEventType.DrawSlider,
                hitObject: this,
                time: this.startTime - 5000
            });
        }*/
        

        let sliderEndCheckTime = this.startTime + Math.max(this.duration - 36, this.duration/2); // "Slider ends are a special case and checked exactly 36ms before the end of the slider (unless the slider is <72ms in duration, then it checks exactly halfway time wise)." https://www.reddit.com/r/osugame/comments/9rki8o/how_are_slider_judgements_calculated/
        let sliderEndCheckCompletion = (this.timingInfo.sliderVelocity * (sliderEndCheckTime - this.startTime)) / this.hitObject.length;
        sliderEndCheckCompletion = MathUtil.mirror(sliderEndCheckCompletion);
        let sliderEndCheckPosition = this.path.getPosFromPercentage(sliderEndCheckCompletion);

        playEventArray.push({
            type: PlayEventType.SliderEndCheck,
            hitObject: this,
            time: sliderEndCheckTime,
            position: sliderEndCheckPosition
        });
        
        playEventArray.push({
            type: PlayEventType.SliderEnd,
            hitObject: this,
            time: this.endTime,
            hitSound: last(this.hitSounds),
            i: this.sliderEnds.length-1
        });

        // Add repeats
        if (this.hitObject.repeat > 1) {
            let repeatCycleDuration = (this.endTime - this.startTime) / this.hitObject.repeat;

            for (let i = 1; i < this.hitObject.repeat; i++) {
                let position = (i % 2 === 0)? this.startPoint : this.endPoint;

                playEventArray.push({
                    type: PlayEventType.SliderRepeat,
                    hitObject: this,
                    time: this.startTime + i * repeatCycleDuration,
                    position: position,
                    hitSound: this.hitSounds[i],
                    i: i-1
                });
            }
        }

        // Add ticks
        for (let i = 0; i < this.sliderTickCompletions.length; i++) {
            let tickCompletion = this.sliderTickCompletions[i];

            // Time that the tick should be hit, relative to the slider start time
            let time = tickCompletion * this.hitObject.length / this.timingInfo.sliderVelocity;
            let position = this.path.getPosFromPercentage(MathUtil.mirror(tickCompletion));

            playEventArray.push({
                type: PlayEventType.SliderTick,
                hitObject: this,
                time: this.startTime + time,
                position: position,
                hitSound: this.tickSounds[i]
            });
        }
    }

    beginSliderSlideSound() {
        for (let emitter of this.slideEmitters) {
            emitter.start();
        }
    }

    stopSliderSlideSound() {
        for (let emitter of this.slideEmitters) {
            emitter.stop();
        }
    }

    score() {
        let total = 0;
        if (this.scoring.head.hit !== ScoringValue.Miss) total++;
        if (this.scoring.end) total++;
        total += this.scoring.ticks;
        total += this.scoring.repeats;

        let fraction = total / (2 + this.sliderTickCompletions.length + (this.hitObject.repeat - 1));
        assert(fraction >= 0 && fraction <= 1);

        let resultingRawScore = (() => {
            if (fraction === 1) {
                return 300;
            } else if (fraction >= 0.5) {
                return 100;
            } else if (fraction > 0) {
                return 50;
            }
            return 0;
        })();

        gameState.currentPlay.scoreCounter.add(resultingRawScore, false, false, true, this, this.endTime);
    }

    hitHead(time: number, judgementOverride?: number) {
        if (this.scoring.head.hit !== ScoringValue.NotHit) return;
        
        let { processedBeatmap, scoreCounter } = gameState.currentPlay;

        let timeInaccuracy = time - this.startTime;
        let judgement: number;

        if (judgementOverride !== undefined) {
            judgement = judgementOverride;
        } else {
            let hitDelta = Math.abs(timeInaccuracy);
            judgement = processedBeatmap.difficulty.getJudgementForHitDelta(hitDelta);
        }

        this.scoring.head.hit = judgement;
        this.scoring.head.time = time;

        let score = (judgement === ScoringValue.Miss)? 0 : ScoringValue.SliderHead;

        scoreCounter.add(score, true, true, false, this, time);
        if (judgement !== 0) {
            gameState.currentGameplaySkin.playHitSound(this.hitSounds[0]);
            accuracyMeter.addAccuracyLine(timeInaccuracy, time);
        }
        HitCirclePrimitive.fadeOutBasedOnHitState(this.head, time, judgement !== 0);
    }

    applyStackPosition() {
        super.applyStackPosition();

        if (true /* This was if(fullCalc) before */) {
            this.bounds.minX += this.stackHeight * -4;
            this.bounds.minY += this.stackHeight * -4;
            this.bounds.maxX += this.stackHeight * -4;
            this.bounds.maxY += this.stackHeight * -4;

            this.path.applyStackPosition(this.stackHeight);
        }
    }

    private getLowestTickCompletionFromCurrentRepeat(completion: number) {
        let currentRepeat = Math.floor(completion);
        for (let i = 0; i < this.sliderTickCompletions.length; i++) {
            if (this.sliderTickCompletions[i] > currentRepeat) {
                return this.sliderTickCompletions[i];
            }
        }
    }

    private updateSliderBody(currentTime: number) {
        let { approachTime } = gameState.currentPlay;

        let snakeCompletion: number;
        if (SLIDER_SETTINGS.snaking) {
            snakeCompletion = (currentTime - (this.startTime - approachTime)) / (approachTime/3); // Snaking takes 1/3 the approach time
            snakeCompletion = MathUtil.clamp(snakeCompletion, 0, 1);
        } else {
            snakeCompletion = 1.0;
        }

        let doRender = !this.sliderBodyHasBeenRendered;
        let renderTex = this.baseSprite.texture as PIXI.RenderTexture;
        let gl = renderer.state.gl;

        if (this.lastGeneratedSnakingCompletion < snakeCompletion) {
            this.path.updateGeometry(this.sliderBodyMesh.geometry, snakeCompletion);
            this.sliderBodyMesh.size = this.path.currentVertexCount;
            this.lastGeneratedSnakingCompletion = snakeCompletion;

            doRender = true;
        }

        if (!doRender) return;

        // Blending here needs to be done normally 'cause, well, reasons. lmao
        // INSANE hack:
        gl.disable(gl.BLEND);
        renderer.render(this.sliderBodyMesh, renderTex);
        gl.enable(gl.BLEND);

        this.sliderBodyHasBeenRendered = true;
    }

    private updateSubelements(currentTime: number) {
        let completion = 0;
        let currentSliderTime = currentTime - this.hitObject.time;

        completion = (this.timingInfo.sliderVelocity * currentSliderTime) / this.hitObject.length;
        completion = MathUtil.clamp(completion, 0, this.hitObject.repeat);

        this.updateSliderEnds(currentTime);
        this.updateSliderBall(completion, currentTime, currentSliderTime);
        if (this.sliderTickCompletions.length > 0) this.updateSliderTicks(completion, currentSliderTime);
    }

    private updateSliderEnds(currentTime: number) {
        for (let i = 0; i < this.sliderEnds.length; i++) {
            let sliderEnd = this.sliderEnds[i];
            sliderEnd.update(currentTime);
        }
    }

    private updateSliderBall(completion: number, currentTime: number, currentSliderTime: number) {
        if (completion === 0) return;

        let { headedHitObjectTextureFactor } = gameState.currentPlay;

        let sliderBallPos = this.toRelativeCoord(this.path.getPosFromPercentage(MathUtil.mirror(completion)));

        if (currentTime < this.endTime) {
            let baseElement = this.sliderBall.base.sprite;

            this.sliderBall.container.visible = true;
            this.sliderBall.container.x = sliderBallPos.x;
            this.sliderBall.container.y = sliderBallPos.y;
            baseElement.rotation = this.path.getAngleFromPercentage(MathUtil.mirror(completion));

            let osuTex = gameState.currentGameplaySkin.textures["sliderBall"];
            let frameCount = osuTex.getAnimationFrameCount();
            if (frameCount > 1) {
                let velocityRatio = Math.min(1, MAX_SLIDER_BALL_SLIDER_VELOCITY/this.timingInfo.sliderVelocity);
                let rolledDistance = this.hitObject.length * velocityRatio * MathUtil.mirror(completion);
                let radians = rolledDistance / 15;
                let currentFrame = Math.floor(frameCount * (radians % (Math.PI/2) / (Math.PI/2))); // TODO: Is this correct for all skins?

                this.sliderBall.base.setFrame(currentFrame);
            }

            if (gameState.currentGameplaySkin.config.general.sliderBallFlip) {
                // Flip the scale when necessary
                if      (completion % 2 <= 1 && baseElement.scale.x < 0) baseElement.scale.x *= -1;
                else if (completion % 2 > 1  && baseElement.scale.x > 0) baseElement.scale.x *= -1;
            }
        } else {
            // The slider ball disappears upon slider completion
            this.sliderBall.container.visible = false;
        }

        this.followCircle.visible = true;
        this.followCircle.x = sliderBallPos.x;
        this.followCircle.y = sliderBallPos.y;

        let enlargeCompletion = (currentTime - this.startTime) / FOLLOW_CIRCLE_SCALE_IN_DURATION;
        enlargeCompletion = MathUtil.clamp(enlargeCompletion, 0, 1);
        enlargeCompletion = MathUtil.ease(EaseType.EaseOutQuad, enlargeCompletion);

        let followCircleSizeFactor = 0;
        followCircleSizeFactor += (2 - 1) * enlargeCompletion; // Enlarge to 2 on start

        let biggestCurrentTickCompletion = -Infinity;
        let biggestCurrentRepeatCompletion = -Infinity;
        for (let c of this.sliderTickCompletions) {
            if (c > completion) break;
            biggestCurrentTickCompletion = c;
        }
        biggestCurrentRepeatCompletion = Math.floor(completion);
        if (biggestCurrentRepeatCompletion === 0 || biggestCurrentRepeatCompletion === this.hitObject.repeat)
            biggestCurrentRepeatCompletion = null; // We don't want the "pulse" on slider beginning and end, only on hitting repeats

        outer:
        if (biggestCurrentTickCompletion !== null || biggestCurrentRepeatCompletion !== null) {
            let biggestCompletion = Math.max(biggestCurrentTickCompletion, biggestCurrentRepeatCompletion);
            if (biggestCompletion === -Infinity) break outer; // Breaking ifs, yay! Tbh, it's a useful thing.

            // Time of the slider tick or the reverse, relative to the slider start time
            let time = biggestCompletion * this.hitObject.length / this.timingInfo.sliderVelocity;

            let pulseFactor = (currentSliderTime - time) / FOLLOW_CIRCLE_PULSE_DURATION;
            pulseFactor = 1 - MathUtil.ease(EaseType.EaseOutQuad, MathUtil.clamp(pulseFactor, 0, 1));
            pulseFactor *= 0.20;

            followCircleSizeFactor += pulseFactor;
        }

        let shrinkCompletion = (currentTime - this.endTime) / FOLLOW_CIRCLE_SCALE_OUT_DURATION;
        shrinkCompletion = MathUtil.clamp(shrinkCompletion, 0, 1);
        shrinkCompletion = MathUtil.ease(EaseType.EaseOutQuad, shrinkCompletion);

        followCircleSizeFactor *= 1 * (1 - shrinkCompletion) + 0.75 * shrinkCompletion; // Shrink on end, to 1.5x
        followCircleSizeFactor += 1; // Base. Never get smaller than this.

        this.followCircle.scale.set(followCircleSizeFactor / 2);

        if (this.followCircleAnimator) this.followCircleAnimator.update(currentTime);
    }

    private updateSliderTicks(completion: number, currentSliderTime: number) {
        let { approachTime, activeMods } = gameState.currentPlay;

        let lowestTickCompletionFromCurrentRepeat = this.getLowestTickCompletionFromCurrentRepeat(completion);
        let currentCycle = Math.floor(completion);
        let hasHidden = activeMods.has(Mod.Hidden);

        for (let i = 0; i < this.sliderTickElements.length; i++) {
            let tickElement = this.sliderTickElements[i];
            if (tickElement === null) continue; // Meaning: The tick is hidden

            let tickCompletionIndex = this.sliderTickElements.length * currentCycle;
            if (currentCycle % 2 === 0) {
                tickCompletionIndex += i;
            } else {
                tickCompletionIndex += this.sliderTickElements.length - 1 - i;
            }
            let tickCompletion = this.sliderTickCompletions[tickCompletionIndex];
            if (tickCompletion === undefined) continue;

            if (tickCompletion <= completion) {
                tickElement.visible = false;
                continue;
            } else {
                tickElement.visible = true;
            }
            
            // The currentSliderTime at the beginning of the current repeat cycle
            let msPerRepeatCycle = this.hitObject.length / this.timingInfo.sliderVelocity;
            let currentRepeatTime = currentCycle * msPerRepeatCycle;
            // The time the tick should have fully appeared (animation complete), relative to the current repeat cycle
            // Slider velocity here is doubled, meaning the ticks appear twice as fast as the slider ball moves.
            let relativeTickTime = ((tickCompletion - lowestTickCompletionFromCurrentRepeat) * this.hitObject.length / (this.timingInfo.sliderVelocity * 2)) + SLIDER_TICK_APPEARANCE_ANIMATION_DURATION;
            // Sum both up to get the timing of the tick relative to the beginning of the whole slider:
            let tickTime = currentRepeatTime + relativeTickTime;
            
            // If we're in the first cycle, slider ticks appear a certain duration earlier. Experiments have lead to the value being subtracted here:
            if (currentCycle === 0) {
                tickTime -= approachTime * 2/3 - 100;
            }

            let animationStart = tickTime - SLIDER_TICK_APPEARANCE_ANIMATION_DURATION;
            let animationCompletion = (currentSliderTime - animationStart) / SLIDER_TICK_APPEARANCE_ANIMATION_DURATION;
            animationCompletion = MathUtil.clamp(animationCompletion, 0, 1);

            // Creates a bouncing scaling effect.
            let parabola = (-1.875 * animationCompletion*animationCompletion + 2.875 * animationCompletion);

            if (animationCompletion === 0) parabola = 0;
            if (animationCompletion >= 1) parabola = 1;

            tickElement.scale.set(parabola);

            // With HD, ticks start fading out shortly before they're supposed to be picked up. By the time they are picked up, they will have reached opacity 0.
            if (hasHidden) {
                let tickPickUpTime = tickCompletion * this.hitObject.length / this.timingInfo.sliderVelocity;
                let fadeOutCompletion = (currentSliderTime - (tickPickUpTime - HIDDEN_TICK_FADE_OUT_DURATION)) / HIDDEN_TICK_FADE_OUT_DURATION;
                fadeOutCompletion = MathUtil.clamp(fadeOutCompletion, 0, 1);

                tickElement.alpha = 1 - fadeOutCompletion;
            }
        }
    }
}

class SliderBall {
    public container: PIXI.Container;
    public base: AnimatedOsuSprite;
    public background: PIXI.Container;
    public spec: PIXI.Container;

    constructor(slider: DrawableSlider) {
        let { headedHitObjectTextureFactor } = gameState.currentPlay;

        this.container = new PIXI.Container();
        let baseElement: PIXI.Container;

        if (DRAWING_MODE === DrawingMode.Procedural) {
            let sliderBall = new PIXI.Graphics();
            sliderBall = new PIXI.Graphics();
            sliderBall.beginFill(colorToHexNumber(slider.comboInfo.color));
            sliderBall.lineStyle(0);
            //sliderBall.drawCircle(0, 0, slider.sliderBodyRadius);
            sliderBall.endFill();

            baseElement = sliderBall;
        } else if (DRAWING_MODE === DrawingMode.Skin) {
            let osuTexture = gameState.currentGameplaySkin.textures["sliderBall"];

            this.base = new AnimatedOsuSprite(osuTexture, headedHitObjectTextureFactor);
            let baseSprite = this.base.sprite;
            baseElement = baseSprite;

            if (gameState.currentGameplaySkin.config.general.allowSliderBallTint) baseSprite.tint = colorToHexNumber(slider.comboInfo.color);
            else baseSprite.tint = colorToHexNumber(gameState.currentGameplaySkin.config.colors.sliderBall);

            if (!osuTexture.hasActualBase()) {
                let bgTexture = gameState.currentGameplaySkin.textures["sliderBallBg"];

                if (!bgTexture.isEmpty()) {
                    let sprite = new PIXI.Sprite();
                    sprite.anchor.set(0.5, 0.5);
                    sprite.tint = 0x000000; // Always tinted black.

                    bgTexture.applyToSprite(sprite, headedHitObjectTextureFactor);

                    this.background = sprite;
                }
            }

            let specTexture = gameState.currentGameplaySkin.textures["sliderBallSpec"];
            if (!specTexture.isEmpty()) {
                let sprite = new PIXI.Sprite();
                sprite.anchor.set(0.5, 0.5);
                sprite.blendMode = PIXI.BLEND_MODES.ADD;

                specTexture.applyToSprite(sprite, headedHitObjectTextureFactor);

                this.spec = sprite;
            }
        }

        if (this.background) this.container.addChild(this.background);
        this.container.addChild(baseElement);
        if (this.spec) this.container.addChild(this.spec);
    }
}