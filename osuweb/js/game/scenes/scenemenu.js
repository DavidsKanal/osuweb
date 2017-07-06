"use strict";

import {SceneBase} from "./scenebase";
import {AUDIO_MANAGER} from "../../main";

export class SceneMenu extends SceneBase {
    constructor() {
        super();

        this.addElement("osuInput", "osu");
        this.addElement("beatmapInput", "beatmap");
        this.addElement("snakingInput", "snaking");
        this.addElement("autoInput", "auto");
    }

    preOpen(callback) {
        callback(true);
    }

    postOpen(callback) {
        this.elements["osuInput"].style.display = "block";

        AUDIO_MANAGER.playSongByName("circles", 0, 0, true);

        callback(true);
    }
    
    preClose(callback) {
        this.hideElements(["beatmapInput", "osuInput"]);

        this.elements["snakingInput"].disabled = true;

        callback(true);
    }

    postClose(callback) {
        callback(true);
    }
}