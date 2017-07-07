"use strict";

import {GraphicUtil} from "../util/graphicutil";
import {AccMeter} from "../interface/accmeter";
import {ProgressBar} from "../interface/progressbar";
import {DrawableCircle} from "../game/drawablecircle";
import {DrawableSlider} from "../game/drawableslider";
import {DrawableSpinner} from "../game/drawablespinner";
import {GAME_STATE, AUDIO_MANAGER, SCENE_MANAGER} from "../main";
import {InputUtil, INPUT_STATE} from "../util/inpututil";
import {PRE_EMPT} from "./followpoint";
import {Score} from "./score";
import {MathUtil} from "../util/mathutil";
import {Console} from "../console";
import {DrawableHitObject} from "./drawablehitobject";
import {ProcessedBeatmap} from "../datamodel/processedbeatmap";
import {BeatmapDifficulty} from "../datamodel/beatmapdifficulty";

export class Play {
    constructor(beatmap, audio) {
        GAME_STATE.currentPlay = this;

        this.autoplay = document.getElementById("auto").checked;

        this.audio = audio;
        this.beatmap = new ProcessedBeatmap(beatmap);
        this.beatmap.process();

        // doesn't do shit yet LUL
        //ingameContainer.style.width = window.innerWidth + "px";
        //ingameContainer.style.height = window.innerHeight + "px";

        this.marginWidth = (GraphicUtil.getBaseScreenDimensions().width - GraphicUtil.getBasePlayfieldDimensions().width) / 2;
        this.marginHeight = this.marginWidth * GraphicUtil.getAspectRatio();

        // The diameter of a circle on the screen (relative to playfield area)
        this.csOsuPixel = this.beatmap.difficulty.getCirclePixelSize();
        this.csPixel = Math.round(this.csOsuPixel * GraphicUtil.getPixelRatio());
        this.halfCsPixel = this.csPixel / 2;

        this.ARMs = this.beatmap.difficulty.getApproachTime();

        for (let z = 0; z < this.beatmap.hitObjects.length; z++) {
            this.beatmap.hitObjects[z].draw();
        }

        this.accmeter = new AccMeter();
        this.progressbar = new ProgressBar();

        this.audioInterlude = 2;
        this.metronome = null;
        this.nextMetronome = null;
        this.metronomeRunning = false;
        this.audioStarted = false;

        this.currentHitObject = 0;
        this.lastAppendedHitObject = 0;
        this.currentFollowPoint = 0;
        this.onScreenHitObjects = {};
        this.onScreenFollowPoints = {};

        this.inBreak = true;
        this.startBreak = true;
        this.nextBreak = null;

        this.score = new Score(this.beatmap);

        // Debug variables
        this.lastTickClockTime = window.performance.now();
        this.recordedTickSpeeds = [];
        this.stupidClock = window.performance.now();
    }

    render() {
        if(this.audioStarted) this.gameLoop();

        if(this.progressbar) this.progressbar.render.bind(this.progressbar)();
        if(this.accmeter) this.accmeter.render.bind(this.accmeter)();

        for(let key in this.onScreenHitObjects) {
            this.onScreenHitObjects[key].render.bind(this.onScreenHitObjects[key])();
        }

        for(let key in this.onScreenFollowPoints) {
            this.onScreenFollowPoints[key].render.bind(this.onScreenFollowPoints[key])();
        }
    }

    updatePlayareaSize(callback) {
        let playAreaDimensions = GraphicUtil.getPlayAreaDimensions();

        SCENE_MANAGER.getScene().elements["playareaDiv"].style.height = playAreaDimensions.height;
        SCENE_MANAGER.getScene().elements["playareaDiv"].style.width = playAreaDimensions.width;

        setTimeout(() => {
            InputUtil.updatePlayfieldBounds();
            callback();
        });
    }

    gameLoop() {
        //this.doDebugOutput();

        let currentTime = AUDIO_MANAGER.getCurrentSongTime();

        // hitObject updates
        this.updateHitObjects(currentTime);

        // Handles breaks
        this.handleBreaks(currentTime);

        // Makes follow points show up on-screen
        this.handleFollowPoints(currentTime);
    }

    handleFollowPoints(currentTime) {
        if (this.currentFollowPoint < this.beatmap.followPoints.length) {
            while (this.beatmap.followPoints[this.currentFollowPoint].startTime - PRE_EMPT <= currentTime) {
                this.beatmap.followPoints[this.currentFollowPoint].spawn();

                this.currentFollowPoint++;

                if (this.currentFollowPoint === this.beatmap.followPoints.length) {
                    break;
                }
            }
        }
    }

    doDebugOutput() {
        let timeDif = window.performance.now() - this.lastTickClockTime;

        this.recordedTickSpeeds.push(timeDif);
        if (timeDif > 1000 / 60) {
            Console.warn("Slow clock: " + timeDif.toFixed(2) + "ms since last execution!");
        }
        this.lastTickClockTime = window.performance.now();
        if (window.performance.now() - this.stupidClock > 2000) {
            let sum = 0;
            for (let i = 0; i < this.recordedTickSpeeds.length; i++) {
                sum += this.recordedTickSpeeds[i];
            }
            Console.verbose("Current average clock tick speed: " + (sum / this.recordedTickSpeeds.length).toFixed(2) + "ms / " + (1000 / (sum / this.recordedTickSpeeds.length)).toFixed(2) + "Hz");
            this.stupidClock = window.performance.now();
        }
    }

    updateHitObjects(currentTime) {
        // Handle HitObject interaction
        let userPlayfieldCoords = InputUtil.getCursorPlayfieldCoords();
        for (let id in this.onScreenHitObjects) {
            let hitObject = this.onScreenHitObjects[id];

            if (hitObject.constructor.name === "DrawableCircle") {
                // Remove approach circle
                if (currentTime >= hitObject.startTime && hitObject.hittable) {
                    if (this.autoplay) hitObject.hit(currentTime - hitObject.startTime); // AUTO hitting
                    hitObject.approachCircleCanvas.style.visibility = "hidden";
                }
                // Fade out object when it has not been hit
                if (currentTime >= hitObject.startTime + this.beatmap.difficulty.getHitDeltaForRating(50) && hitObject.hittable) {
                    this.score.addScore(0, false, true, hitObject);
                    hitObject.containerDiv.style.animation = "0.15s fadeOut linear forwards";
                    hitObject.hittable = false;
                }
                // Remove object completely
                if (currentTime >= hitObject.startTime + 400) {
                    hitObject.remove();
                    delete this.onScreenHitObjects[id];
                    continue;
                }
            } else if (hitObject.constructor.name === "DrawableSlider") {
                // Handle scoring of slider ticks and reverses
                if ((hitObject.sliderTickCompletions[hitObject.currentSliderTick] !== undefined || hitObject.currentRepeat < hitObject.hitObject.repeat) && currentTime >= hitObject.startTime) {
                    let completion = Math.min(hitObject.hitObject.repeat, hitObject.timingInfo.sliderVelocity * (currentTime - hitObject.startTime) / hitObject.hitObject.length);
                    let completionsToEval = [];

                    while (completion >= hitObject.sliderTickCompletions[hitObject.currentSliderTick]) {
                        completionsToEval.push(hitObject.sliderTickCompletions[hitObject.currentSliderTick]);
                        hitObject.currentSliderTick++;
                    }
                    while (Math.floor(completion) > hitObject.currentRepeat) {
                        hitObject.currentRepeat++;
                        completionsToEval.push(hitObject.currentRepeat);
                    }
                    completionsToEval.sort();

                    for (let i = 0; i < completionsToEval.length; i++) {
                        let tickPosition = GraphicUtil.getCoordFromCoordArray(hitObject.curve.equalDistancePoints, MathUtil.reflect(completionsToEval[i]));

                        let dist = Math.hypot(tickPosition.x / GraphicUtil.getPixelRatio() - userPlayfieldCoords.x, tickPosition.y / GraphicUtil.getPixelRatio() - userPlayfieldCoords.y);

                        if (dist <= this.csOsuPixel && INPUT_STATE.isHolding || this.autoplay) {
                            if (completionsToEval[i] === hitObject.hitObject.repeat) {
                                hitObject.scoring.end = true;
                            } else {
                                hitObject.scoring.ticks++;
                            }

                            if (completionsToEval[i] % 1 === 0) { // if reverse
                                GAME_STATE.currentPlay.score.addScore(30, true);
                                DrawableHitObject.playHitSound(hitObject.hitSoundInfo.sliderEndHitSoundInfos[completionsToEval[i]]);
                            } else { // if tick
                                GAME_STATE.currentPlay.score.addScore(10, true);
                                hitObject.playTickSound();
                            }
                        } else if (completionsToEval[i] !== hitObject.hitObject.repeat) {
                            GAME_STATE.currentPlay.score.addScore(0, true, true);
                        }

                        if (completionsToEval[i] < hitObject.hitObject.repeat) {
                            hitObject.lastPulseTime = completionsToEval[i] * hitObject.hitObject.length / hitObject.timingInfo.sliderVelocity;
                        }
                    }
                }
                // Remove approach circle
                if (currentTime >= hitObject.startTime && hitObject.hittable) {
                    if (this.autoplay) hitObject.hit(currentTime - hitObject.startTime);
                    hitObject.approachCircleCanvas.style.display = "none";
                }
                // Fade out slider head when it has not been hit
                if (currentTime >= hitObject.startTime + this.beatmap.difficulty.getHitDeltaForRating(50) && hitObject.hittable) {
                    this.score.addScore(0, true, true);
                    hitObject.sliderHeadContainer.style.animation = "0.15s fadeOut linear forwards";
                    hitObject.hittable = false;
                }
                // On slider end
                if (currentTime >= hitObject.endTime && !hitObject.fadingOut) {
                    hitObject.score();

                    hitObject.containerDiv.style.animation = "0.175s fadeOut linear forwards";
                    hitObject.fadingOut = true;
                }
                // Remove object completely
                if (currentTime >= hitObject.endTime + 150) {
                    hitObject.remove();
                    delete this.onScreenHitObjects[id];
                    continue;
                }
            } else if (hitObject.constructor.name === "DrawableSpinner") {
                if (currentTime >= hitObject.startTime) {
                    // Activate spinner
                    if (!hitObject.active) {
                        hitObject.active = true;
                        hitObject.lastTimeSampled = window.performance.now();
                    }
                    // Spinner clear
                    if (hitObject.absoluteDegreesRotated / (Math.PI * 2) >= hitObject.requiredSpins) {
                        hitObject.clear();
                    }
                    // Spinner bonuses
                    if (hitObject.cleared) {
                        if ((hitObject.absoluteDegreesRotated - hitObject.requiredSpins * Math.PI * 2) / (Math.PI * 2) >= hitObject.completedBonusSpins + 1) {
                            hitObject.scoreBonusSpin();
                        }
                    }
                    // Count full spins
                    if (hitObject.absoluteDegreesRotated / (Math.PI * 2) >= hitObject.completedSpins + 1) {
                        hitObject.completedSpins = Math.floor(hitObject.absoluteDegreesRotated / (Math.PI * 2));
                        hitObject.readyForSound = true;
                        if (!hitObject.cleared) {
                            GAME_STATE.currentPlay.score.addScore(100, true, true);
                        }
                    }
                }

                // Spinner end
                if (currentTime >= hitObject.endTime && !hitObject.completed) {
                    hitObject.score();
                    hitObject.containerDiv.style.animation = "0.15s fadeOut linear forwards";
                    SCENE_MANAGER.getScene().elements["accmeterDiv"].style.opacity = 1;
                    hitObject.active = false;
                    hitObject.completed = true;
                }
                // Remove object completely
                if (currentTime >= hitObject.endTime + 150) {
                    hitObject.remove();
                    delete this.onScreenHitObjects[id];
                    continue;
                }
            }
        }

        // Append new HitObjects
        while (this.beatmap.hitObjects.length > this.lastAppendedHitObject && this.lastAppendedHitObject - this.currentHitObject < 1) {
            let nextTime = this.beatmap.hitObjects[this.lastAppendedHitObject].startTime;

            while (this.beatmap.hitObjects.length > this.lastAppendedHitObject && this.beatmap.hitObjects[this.lastAppendedHitObject].startTime <= nextTime) {
                //this.beatmap.hitObjects[this.lastAppendedHitObject].draw();
                this.beatmap.hitObjects[this.lastAppendedHitObject].append();
                this.lastAppendedHitObject++;
            }
        }

        // Makes HitObjects show up on-screen
        if (this.currentHitObject < this.beatmap.hitObjects.length) {
            while (this.beatmap.hitObjects[this.currentHitObject].startTime - ((this.beatmap.hitObjects[this.currentHitObject].constructor !== "DrawableSpinner") ? this.beatmap.difficulty.getApproachTime() : BeatmapDifficulty.getApproachTime(5)) <= currentTime) {
                let hitObject = this.beatmap.hitObjects[this.currentHitObject];

                hitObject.show(currentTime - (this.beatmap.hitObjects[this.currentHitObject].startTime - this.beatmap.difficulty.getApproachTime()));
                this.onScreenHitObjects[hitObject.id] = hitObject;

                if (hitObject.constructor.name === "DrawableSpinner") {
                    SCENE_MANAGER.getScene().elements["accmeterDiv"].style.opacity = 0;
                }

                this.currentHitObject++;

                if (this.currentHitObject === this.beatmap.hitObjects.length) {
                    break;
                }
            }
        }
    }

    handleBreaks(currentTime) {
        if (currentTime > this.beatmap.hitObjects[0].startTime - 1500 && this.startBreak) {
            document.getElementById("background-dim").style.opacity = "0.90";
            this.inBreak = false;
            this.startBreak = false;
        }
        else if (this.beatmap.hitObjects[this.beatmap.hitObjects.length - 1].endTime - currentTime < -300) {
            document.getElementById("background-dim").style.opacity = "0";
            this.inBreak = true;
        }
        else {
            if (this.nextBreak === null) {
                for (let ii = 0; ii < this.beatmap.events.length; ii++) {
                    if (this.beatmap.events[ii].type !== "break") continue;

                    if (this.beatmap.events[ii].start > currentTime) {
                        if (this.nextBreak !== null && this.nextBreak.start > this.beatmap.events[ii].start) {
                            this.nextBreak = this.beatmap.events[ii];
                        }
                        else {
                            this.nextBreak = this.beatmap.events[ii];
                        }
                    }
                }
            }

            if (this.inBreak && this.nextBreak !== null && currentTime > this.nextBreak.end) {
                document.getElementById("background-dim").style.opacity = "0.90";
                this.inBreak = false;
                this.nextBreak = null;
            }
            else if (!this.inBreak && this.nextBreak !== null && currentTime > this.nextBreak.start) {
                document.getElementById("background-dim").style.opacity = "0";
                this.inBreak = true;
            }
        }
    }

    registerClick() {
        let userPlayfieldCoords = InputUtil.getCursorPlayfieldCoords();

        for (let id in this.onScreenHitObjects) {
            let hitObject = this.onScreenHitObjects[id];

            if (hitObject.hittable) {
                let dist = Math.hypot(userPlayfieldCoords.x - hitObject.x, userPlayfieldCoords.y - hitObject.y);

                if (dist <= this.csOsuPixel / 2) {
                    hitObject.hit(AUDIO_MANAGER.getCurrentSongTime() - hitObject.startTime);
                }
                break;
            }
        }
    }

    start() {
        // stop running song
        AUDIO_MANAGER.stopSong();

        // Starts the song
        if (!this.audioStarted) {
            AUDIO_MANAGER.playSongByName(this.audio, this.audioInterlude, 0, false);
            console.log("Audio start offset: " + AUDIO_MANAGER.getCurrentSongTime().toFixed(2) + "ms");

            this.audioStarted = true;
        }

        this.gameLoop();
    }
}