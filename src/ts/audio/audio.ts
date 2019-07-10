import { MathUtil } from "../util/math_util";

const DEFAULT_MASTER_GAIN_VALUME = 0.05;
const MEDIA_NUDGE_INTERVAL = 500; // In ms

export let audioContext = new AudioContext();

let masterGain = audioContext.createGain();
masterGain.gain.value = DEFAULT_MASTER_GAIN_VALUME;
masterGain.connect(audioContext.destination);

interface SoundEmitterOptions {
    buffer?: AudioBuffer,
    volume?: number,
    playbackRate?: number
}

export class SoundEmitter {
    private volume: number; // !???!
    private playbackRate: number = 1;
    private sourceNode: AudioBufferSourceNode = null;
    private gainNode: GainNode;
    private audioStartTime: number = null;
    private buffer: AudioBuffer = null;
    private offset: number = 0;

    constructor(options: SoundEmitterOptions = {}) {
        throw new Error("I am broken. Don't instanciate me!");

        if (options.buffer) this.setBuffer(options.buffer);
        if (options.volume) this.volume = options.volume;
        if (options.playbackRate) this.playbackRate = options.playbackRate;

        this.gainNode = audioContext.createGain();
        this.setVolume(this.volume);

        this.gainNode.connect(audioContext.destination);
    }

    setVolume(newVolume: number) {
        this.volume = newVolume;
        this.gainNode.gain.value = this.volume;
    }

    setBuffer(buffer: AudioBuffer) {
        this.buffer = buffer;
    }

    private createSourceNode() {
        if (this.buffer === null) return;

        this.sourceNode = audioContext.createBufferSource();
        this.sourceNode.buffer = this.buffer;
        this.sourceNode.playbackRate.value = this.playbackRate;
        
        this.sourceNode.connect(this.gainNode);
    }

    start(offset: number = 0) {
        if (this.buffer === null) {
            console.error("Cannot start a SoundEmitter that's lacking a buffer.");
            return;
        }

        if (this.sourceNode) {
            this.sourceNode.stop();
        }

        this.createSourceNode();

        let delay = 0;
        if (offset < 0) delay = offset * -1;

        this.offset = offset;

        this.sourceNode.start(delay, offset);
        this.audioStartTime = audioContext.currentTime;
    }

    getCurrentTime() {
        if (this.audioStartTime === null) return 0;
        return (audioContext.currentTime - this.audioStartTime + this.offset) * this.playbackRate;
    }
}

export class MediaPlayer {
    private audioElement: HTMLAudioElement;
    private audioNode: MediaElementAudioSourceNode;
    private currentUrl: string = null;
    private startTime: number = null;
    private timingDeltas: number[] = [];
    private lastNudgeTime: number;
    private offset: number;

    constructor() {
        //
    }

    private resetAudioElement() {
        if (this.audioNode) {
            this.audioNode.disconnect();
        }

        this.audioElement = new Audio();
        this.audioNode = audioContext.createMediaElementSource(this.audioElement);
        this.audioNode.connect(masterGain);
        this.timingDeltas.length = 0;
        this.lastNudgeTime = null;
    }

    loadBuffer(buffer: ArrayBuffer) {
        let url = URL.createObjectURL(new Blob([buffer]));
        return this.loadUrl(url);
    }

    loadUrl(url: string) {
        return new Promise((resolve) => {
            if (this.currentUrl) URL.revokeObjectURL(this.currentUrl);
            this.currentUrl = url;

            this.resetAudioElement();
            this.audioElement.src = url;

            // Fires once the browser thinks it can play the whole file without buffering
            this.audioElement.addEventListener('canplaythrough', () => {
                resolve();
            });
        });
    }

    // Offset in seconds: Positive = Start the sound at that time, Negative = Start in the song in -offset seconds
    start(offset: number = 0) {
        // TODO: Implement offset

        this.offset = offset;
        this.startTime = performance.now();

        if (this.offset >= 0) {
            this.audioElement.currentTime = this.offset;
            this.audioElement.play();
        } else {
            // Any inaccuracies in this timeout (+-2ms) will be ironed out by the nudging algorithm in getCurrentTime
            setTimeout(() => {
                this.audioElement.play();
            }, this.offset * -1 * 1000);
        }
    }

    getCurrentTime() {
        if (this.startTime === null) return 0;

        let now = performance.now();
        let offsetMs = this.offset * 1000;

        let calculated = now - this.startTime + offsetMs;
        let actual = this.audioElement.currentTime * 1000;

        // Only do this if the audio element has started playing, which, when its currentTime is 0, is likely not the case.
        if (actual > 0) {
            let delta = calculated - actual;
            this.timingDeltas.push(delta);

            // Keep the calculated time as close as possible to the ACTUAL time of the audio. The reason we don't use HTMLAudioElement.currentTime for getting the current time directly, is that it tends to fluctuate +-5ms. We avoid that fluctuation by using performance.now(), but that requires us to perform this synchronization:

            if (this.lastNudgeTime === null) this.lastNudgeTime = now;
            if (now - this.lastNudgeTime >= MEDIA_NUDGE_INTERVAL) {
                let average = MathUtil.getAvgInArray(this.timingDeltas); // Average of last deltas
                if (Math.abs(average) >= 5) console.warn("High average media playback delta: " + average + " - Nudging offset...");
                this.startTime += average / 2; // Nudge closer towards zero

                this.timingDeltas.length = 0;
                this.lastNudgeTime = now;
            }
        }

        return calculated / 1000; // return in seconds
    }
}

export let mainMusicMediaPlayer = new MediaPlayer();