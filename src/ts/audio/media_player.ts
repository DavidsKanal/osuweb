import { audioContext, mediaAudioNode } from "./audio";
import { MathUtil } from "../util/math_util";

const MEDIA_NUDGE_INTERVAL = 333; // In ms
const OBSERVED_AUDIO_MEDIA_OFFSET = 12; // In ms. Seemed like the HTMLAudioElement.currentTime was a few AHEAD of the actual sound being heard, causing the visuals to be shifted forwards in time. By subtracting these milliseconds from the returned currentTime, we compensate for that and further synchronize the visuals and gameplay with the audio.

export class MediaPlayer {
    private audioElement: HTMLAudioElement = null;
    private audioNode: MediaElementAudioSourceNode = null;
    private currentUrl: string = null;
    private startTime: number = null;
    private timingDeltas: number[] = [];
    private lastNudgeTime: number = null;
    private offset: number;
    private playing: boolean = false;
    private timeout: any; // any 'cause it, for some reason, doesn't work with 'number'
    private pausedTime: number = null;
    private volume: number = 1;
    private gainNode: GainNode;
    private playbackRate = 1.0;

    constructor(destination: AudioNode) {
        this.gainNode = audioContext.createGain();
        this.setVolume(this.volume);

        this.gainNode.connect(destination);
    }

    setVolume(newVolume: number) {
        this.volume = newVolume;
        this.gainNode.gain.value = this.volume;
    }

    setPlaybackRate(rate: number) {
        this.playbackRate = rate;
        if (this.audioElement) this.audioElement.playbackRate = rate;
    }

    getPlaybackRate() {
        return this.playbackRate;
    }

    private resetAudioElement() {
        if (this.audioNode) {
            this.audioNode.disconnect();
        }

        this.audioElement = new Audio();
        this.audioElement.playbackRate = this.playbackRate;
        this.audioNode = audioContext.createMediaElementSource(this.audioElement);
        this.audioNode.connect(this.gainNode);
        this.timingDeltas.length = 0;
        this.lastNudgeTime = null;
        this.pausedTime = null;
        this.startTime = null;
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
            this.audioElement.preload = 'auto';   

            // Fires once the browser thinks it can play the whole file without buffering
            this.audioElement.addEventListener('canplaythrough', () => {
                resolve();
            });
        });
    }

    // Offset in seconds: Positive = Start the sound at that time, Negative = Start in the song in -offset seconds
    start(offset: number = 0) {
        audioContext.resume();

        if (!this.audioElement) {
            console.error("Cannot start MediaPlayer as it has no media to play.");
            return;
        }

        this.offset = offset;
        this.startTime = performance.now();
        this.pausedTime = null;

        if (this.offset >= 0) {
            this.audioElement.currentTime = this.offset;
            this.audioElement.play();
            this.audioElement.playbackRate = this.playbackRate;
        } else {
            // Any inaccuracies in this timeout (+-2ms) will be ironed out by the nudging algorithm in getCurrentTime
            this.timeout = setTimeout(() => {
                this.audioElement.play();
                this.audioElement.playbackRate = this.playbackRate;
            }, this.offset * -1 * 1000 / this.playbackRate);
        }

        this.playing = true;
    }

    pause() {
        if (!this.playing) return;

        let time = this.getCurrentTime();
        
        clearTimeout(this.timeout);
        this.audioElement.pause();

        this.playing = false;
        this.pausedTime = time;
    }

    unpause() {
        if (this.pausedTime === null) {
            console.error("Cannot unpause a MediaPlayer that hasn't been paused.");
            return;
        }

        this.start(this.pausedTime);
    }

    getCurrentTime() {
        if (this.startTime === null) return 0;
        if (this.pausedTime !== null) return this.pausedTime;

        let now = performance.now();
        let offsetMs = this.offset * 1000;

        let calculated = this.playbackRate * (now - this.startTime) + offsetMs;   
        let actual = this.audioElement.currentTime * 1000;

        // Only do this if the audio element has started playing, which, when its currentTime is 0, is likely not the case.
        if (actual > 0) {
            let delta = calculated - actual;
            this.timingDeltas.push(delta);

            // Keep the calculated time as close as possible to the ACTUAL time of the audio. The reason we don't use HTMLAudioElement.currentTime for getting the current time directly, is that it tends to fluctuate +-5ms. We avoid that fluctuation by using performance.now(), but that requires us to perform this synchronization:

            if (this.lastNudgeTime === null) this.lastNudgeTime = now;
            if (now - this.lastNudgeTime >= MEDIA_NUDGE_INTERVAL) {
                let average = MathUtil.getAggregateValuesFromArray(this.timingDeltas).avg; // Average of last deltas
                if (Math.abs(average) >= 5) console.warn("High average media playback delta: " + average + "ms - Nudging offset...");
                this.startTime += average / 2; // Nudge closer towards zero

                this.timingDeltas.length = 0;
                this.lastNudgeTime = now;
            }
        }

        return (calculated - OBSERVED_AUDIO_MEDIA_OFFSET) / 1000; // return in seconds
    }

    isPlaying() {
        return this.playing;
    }

    isPaused() {
        return !this.isPlaying() && this.pausedTime !== undefined;
    }
}

export let mainMusicMediaPlayer = new MediaPlayer(mediaAudioNode);