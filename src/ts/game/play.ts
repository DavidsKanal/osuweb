import { ProcessedBeatmap } from "./processed_beatmap";
import { Beatmap } from "../datamodel/beatmap";
import { DrawableCircle } from "./drawable_circle";
import { DrawableSlider } from "./drawable_slider";
import { mainMusicSoundEmitter, audioContext } from "../audio/audio";
import { mainRender } from "../visuals/rendering";
import { gameState } from "./game_state";
import { DrawableHitObject } from "./drawable_hit_object";
import { PLAYFIELD_DIMENSIONS } from "../util/constants";

export class Play {
    public processedBeatmap: ProcessedBeatmap;
    public audioStartTime: number;
    public currentHitObjectId: number;
    public onscreenObjects: { [s: string]: DrawableHitObject };
    public pixelRatio: number;
    public circleDiameterOsuPx: number;
    public circleDiameter: number;
    public ARMs: number;

    constructor(beatmap: Beatmap) {
        this.processedBeatmap = new ProcessedBeatmap(beatmap);

        this.audioStartTime = null;
        this.currentHitObjectId = 0;
        this.onscreenObjects = {};

        this.pixelRatio = null;
        this.circleDiameter = null;
        this.ARMs = this.processedBeatmap.beatmap.difficulty.getApproachTime();
    }
    
    init() {
        let screenHeight = window.innerHeight * 0.95;
        let screenWidth = screenHeight * (640 / 480);
        this.pixelRatio = screenHeight / 480;

        this.circleDiameterOsuPx = this.processedBeatmap.beatmap.difficulty.getCirclePixelSize();
        this.circleDiameter = Math.round(this.circleDiameterOsuPx * this.pixelRatio);

        console.time("Beatmap init");
        this.processedBeatmap.init();
        console.timeEnd("Beatmap init");

        console.time("Beatmap draw");
        this.processedBeatmap.draw();
        console.timeEnd("Beatmap draw");
    }

    async start() {
        let audioBuffer = await this.getSongAudioBuffer();
        mainMusicSoundEmitter.setBuffer(audioBuffer);
        mainMusicSoundEmitter.start();

        this.render();
    }

    getSongAudioBuffer() {
        let songFile = this.processedBeatmap.beatmap.getAudioFile();

        return new Promise<AudioBuffer>((resolve) => {
            let reader = new FileReader();
            reader.onload = (result) => {
                let arrayBuffer = reader.result as ArrayBuffer;

                audioContext.decodeAudioData(arrayBuffer, (buffer) => {
                    resolve(buffer);
                });
            };
            reader.readAsArrayBuffer(songFile);
        });
    }

    render() {
        //console.time("Render");

        let currentTime = this.getCurrentSongTime();

        for (let id in this.onscreenObjects) {
            let hitObject = this.onscreenObjects[id];
    
            hitObject.update(currentTime);

            if (hitObject instanceof DrawableCircle) {
                if (currentTime >= hitObject.startTime) {
                    hitObject.remove(); 
                    delete this.onscreenObjects[id];
                }
            } else if (hitObject instanceof DrawableSlider) {
                if (currentTime >= hitObject.endTime) {
                    hitObject.remove();
                    delete this.onscreenObjects[id];
                }
            }        
        }
    
        let hitObject = this.processedBeatmap.hitObjects[this.currentHitObjectId];
        while (hitObject && currentTime >= hitObject.startTime - this.ARMs) {
            this.onscreenObjects[this.currentHitObjectId] = hitObject;
            hitObject.show(currentTime);
    
            hitObject = this.processedBeatmap.hitObjects[++this.currentHitObjectId];
        }
    
        mainRender();

        requestAnimationFrame(this.render.bind(this));

       // console.timeEnd("Render");
    }

    getCurrentSongTime() {
        return mainMusicSoundEmitter.getCurrentTime() * 1000;
    }

    toScreenCoordinatesX(osuCoordinateX: number) {
        return window.innerWidth / 2 + (osuCoordinateX - PLAYFIELD_DIMENSIONS.width/2) * this.pixelRatio;
    }

    toScreenCoordinatesY(osuCoordinateY: number) {
        return window.innerHeight / 2 + (osuCoordinateY - PLAYFIELD_DIMENSIONS.height/2) * this.pixelRatio;
    }
}

export function startPlay(beatmap: Beatmap) {
    let newPlay = new Play(beatmap);
    gameState.currentPlay = newPlay;

    newPlay.init();
    newPlay.start();
}