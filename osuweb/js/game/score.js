"use strict";

import {GAME_STATE, AUDIO_MANAGER, SCENE_MANAGER} from "../main";
import {GraphicUtil} from "../util/graphicutil";
import {MathUtil} from "../util/mathutil";

export class Score {
    constructor(beatmap) {
        this.beatmap = beatmap;

        this.score = 0;
        this.accuracy = 1;
        this.combo = 0;

        this.prevScore = 0;
        this.prevAccuracy = 1;
        this.prevCombo = 0;

        this.maxCombo = 0;
        this.hits = {
            300: 0,
            100: 0,
            50: 0,
            0: 0
        };

        this.totalNumberOfHits = 0;
        this.totalValueOfHits = 0;

        this.comboWorthValues = {}; // Used to determine elite beats. A value of 0 means perfect, anything above is some sort of katu, and everything below means the player hit 50s or misses.

        this.difficultyMultiplier = (function () {
            let difficultyPoints = Math.floor(beatmap.difficulty.CS) + Math.floor(beatmap.difficulty.HP) + Math.floor(beatmap.difficulty.OD);

            if (difficultyPoints <= 5) {
                return 2;
            } else if (difficultyPoints <= 12) {
                return 3;
            } else if (difficultyPoints <= 17) {
                return 4;
            } else if (difficultyPoints <= 24) {
                return 5;
            } else {
                return 6;
            }
        })();
        this.modMultiplier = 1;
    }

    addScore(amount, comboIndependent, suppressComboIncrease, hitObject) {
        if (amount === 0) {
            this.breakCombo();
        } else {
            this.score += Math.floor(amount + ((comboIndependent) ? 0 : amount) * (Math.max(0, this.combo - 1) * this.difficultyMultiplier * this.modMultiplier) / 25);

            // Set up animation for score
            let interpolationData = SCENE_MANAGER.getScene().elements["scoreDisplayP"].interpolationData;
            let timePassed = window.performance.now() - interpolationData.startTime;
            let completion = MathUtil.clamp(timePassed / interpolationData.duration, 0, 1);
            completion = MathUtil.ease("easeOutQuart", completion);
            interpolationData.duration = Math.max(60, Math.max(interpolationData.duration - timePassed, amount * 2.2));
            interpolationData.startTime = window.performance.now();
            interpolationData.startValue = interpolationData.startValue * (1 - completion) + interpolationData.endValue * completion;
            interpolationData.endValue = this.score;
        }

        if (!suppressComboIncrease) {
            this.combo++;
            if (this.combo > this.maxCombo) {
                this.maxCombo = this.combo;
            }
        }
        if (this.combo !== this.prevCombo) {
            // Set up animation for combo
            SCENE_MANAGER.getScene().elements["comboDisplayP"].interpolationData.startTime = window.performance.now();
        }

        if (!comboIndependent) {
            this.totalNumberOfHits++;
            this.totalValueOfHits += amount;
            this.hits[amount]++;
        }

        this.accuracy = (this.totalNumberOfHits) ? this.totalValueOfHits / (this.totalNumberOfHits * 300) : 1;

        // Set up animation for accuracy
        let interpolationData = SCENE_MANAGER.getScene().elements["accuracyDisplayP"].interpolationData;
        let timePassed = window.performance.now() - interpolationData.startTime;
        let completion = MathUtil.clamp(timePassed / interpolationData.duration, 0, 1);
        completion = MathUtil.ease("easeOutCubic", completion);
        interpolationData.startTime = window.performance.now();
        interpolationData.startValue = interpolationData.startValue * (1 - completion) + interpolationData.endValue * completion;
        interpolationData.endValue = this.accuracy;
        this.prevAccuracy = this.accuracy;

        if (hitObject) {
            let comboNum = hitObject.comboInfo.comboNum;
            if (this.comboWorthValues[comboNum] === undefined) {
                this.comboWorthValues[comboNum] = 0;
            }
            if (amount < 300) {
                this.comboWorthValues[comboNum] += -10e7 + 10e5 * amount + 1;
            }

            this.createScorePopup(hitObject, amount);

            if (hitObject.comboInfo.isLast) {
                delete this.comboWorthValues[comboNum];
            }
        }
    }

    createScorePopup(hitObject, score) {
        if (score === 300) return;

        let popupElement = document.createElement("div");
        popupElement.className = "scorePopup";
        popupElement.style.left = (hitObject.endPoint.x - hitObject.stackHeight * 4 + GAME_STATE.currentPlay.marginWidth) * GraphicUtil.getPixelRatio() + "px";
        popupElement.style.top = (hitObject.endPoint.y - hitObject.stackHeight * 4 + GAME_STATE.currentPlay.marginHeight) * GraphicUtil.getPixelRatio() + "px";
        popupElement.style.fontSize = GAME_STATE.currentPlay.csPixel * 0.32 + "px";
        popupElement.style.animation = "1s scorePopup linear forwards";
        popupElement.style.webkitTransform = "transformZ(0)";
        popupElement.style.backfaceVisibility = "hidden";
        let color = (function () {
            if (score === 300) {
                return "#38b8e8";
            } else if (score === 100) {
                return "#57e11a";
            } else if (score === 50) {
                return "#d6ac52";
            }
            return "red";
        })();
        popupElement.innerHTML = (function () {
            if (this.comboWorthValues[hitObject.comboInfo.comboNum] >= 0 && hitObject.comboInfo.isLast) {
                if (this.comboWorthValues[hitObject.comboInfo.comboNum] === 0) {
                    return "激";
                } else {
                    return "喝";
                }
            }
            if (score === 0) {
                return "X";
            }
            return score;
        }).bind(this)();
        popupElement.style.color = color;
        popupElement.style.textShadow = "0px 0px 20px " + color;

        SCENE_MANAGER.getScene().elements["playareaDiv"].appendChild(popupElement);

        setTimeout(() => {
            SCENE_MANAGER.getScene().elements["playareaDiv"].removeChild(popupElement);
        }, 1000);
    }

    breakCombo() {
        if (this.combo > 20) {
            let audioObj = (GAME_STATE.currentSkin || GAME_STATE.defaultSkin).skinElements["combobreak"];

            AUDIO_MANAGER.playSound(audioObj);
        }

        this.combo = 0;
    }

    updateDisplay() {
        // Score
        let scoreInterpolationData = SCENE_MANAGER.getScene().elements["scoreDisplayP"].interpolationData;
        let scoreCompletion = MathUtil.clamp((window.performance.now() - scoreInterpolationData.startTime) / scoreInterpolationData.duration, 0, 1);
        scoreCompletion = MathUtil.ease("easeOutQuad", scoreCompletion);
        let score = scoreInterpolationData.startValue * (1 - scoreCompletion) + scoreInterpolationData.endValue * scoreCompletion;
        SCENE_MANAGER.getScene().elements["scoreDisplayP"].innerHTML = ("00000000" + Math.floor(score)).slice(Math.min(-8, -Math.floor(score).toString().length));

        // Accuracy
        let accuracyInterpolationData = SCENE_MANAGER.getScene().elements["accuracyDisplayP"].interpolationData;
        let accuracyCompletion = MathUtil.clamp((window.performance.now() - accuracyInterpolationData.startTime) / accuracyInterpolationData.duration, 0, 1);
        accuracyCompletion = MathUtil.ease("easeOutCubic", accuracyCompletion);
        let accuracy = accuracyInterpolationData.startValue * (1 - accuracyCompletion) + accuracyInterpolationData.endValue * accuracyCompletion;
        SCENE_MANAGER.getScene().elements["accuracyDisplayP"].innerHTML = (Math.floor(accuracy * 10000) / 100).toFixed(2) + "%";

        // Combo
        let comboDisplayP = SCENE_MANAGER.getScene().elements["comboDisplayP"];
        comboDisplayP.innerHTML = this.combo + "x";

        let comboInterpolationData = comboDisplayP.interpolationData;
        let pulseCompletion = MathUtil.clamp((window.performance.now() - comboInterpolationData.startTime) / comboInterpolationData.duration, 0, 1);
        pulseCompletion = MathUtil.ease("easeOutQuad", pulseCompletion);
        let pulse = comboInterpolationData.startValue * (1 - pulseCompletion) + comboInterpolationData.endValue * pulseCompletion;
        SCENE_MANAGER.getScene().elements["comboDisplayP"].style.transform = "scale(" + pulse + ")";
    }
}