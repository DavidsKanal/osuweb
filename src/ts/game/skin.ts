import { SpriteNumberTextures } from "../visuals/sprite_number";
import { VirtualDirectory } from "../file_system/virtual_directory";
import { VirtualFile } from "../file_system/virtual_file";
import { SkinConfiguration, DEFAULT_SKIN_CONFIG, parseSkinConfiguration } from "../datamodel/skin_configuration";
import { Dimensions, Color } from "../util/graphics_util";
import { charIsDigit, promiseAllSettled, assert, jsonClone, shallowObjectClone } from "../util/misc_util";
import { createAudioBuffer, soundEffectsNode } from "../audio/audio";
import { SoundEmitter } from "../audio/sound_emitter";

// This is all temp:
let baseSkinPath = "./assets/skins/yugen";
let baseSkinDirectory = new VirtualDirectory("root");
baseSkinDirectory.networkFallbackUrl = baseSkinPath;

export const IGNORE_BEATMAP_SKIN = true;
export const IGNORE_BEATMAP_HIT_SOUNDS = false;
const HIT_CIRCLE_NUMBER_SUFFIXES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const SCORE_NUMBER_SUFFIXES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "comma", "dot", "percent", "x"];
export const DEFAULT_COLORS: Color[] = [{r: 255, g: 192, b: 0}, {r: 0, g: 202, b: 0}, {r: 18, g: 124, b: 255}, {r: 242, g: 24, b: 57}];

export class OsuTexture {
    private sdBase: PIXI.Texture = null;
    private hdBase: PIXI.Texture = null;
    private sd: PIXI.Texture[] = [];
    private hd: PIXI.Texture[] = [];

    constructor() { }

    hasActualSdBase() {
        return this.sdBase !== null;
    }

    hasActualHdBase() {
        return this.hdBase !== null;
    }

    hasActualBase() {
        return this.hasActualSdBase() || this.hasActualHdBase();
    }

    getActualSdBase() {
        return this.sdBase;
    }

    getActualHdBase() {
        return this.hdBase;
    }

    /** If the texture doesn't have a base, fall back to the first frame of the animation */
    getDeFactoSdBase() {
        return this.sdBase || this.sd[0] || null;
    }

    /** If the texture doesn't have a base, fall back to the first frame of the animation */
    getDeFactoHdBase() {
        return this.hdBase || this.hd[0] || null;
    }

    getAnimationFrameCount() {
        return Math.max(this.sd.length, this.hd.length) || 1;
    }

    getSd(animationIndex?: number) {
        let sd = (animationIndex === undefined)? this.getDeFactoSdBase() : (this.sd[animationIndex] || this.sdBase);
        if (sd) return sd;
        return null;
    }

    getHd(animationIndex?: number) {
        let hd = (animationIndex === undefined)? this.getDeFactoHdBase() : (this.hd[animationIndex] || this.hdBase);
        if (hd) return hd;
        return null;
    }

    getBest(animationIndex?: number) {
        return this.getHd(animationIndex) || this.getSd(animationIndex);
    }

    getWorst(animationIndex?: number) {
        return this.getSd(animationIndex) || this.getHd(animationIndex);
    }

    getDynamic(size: number, animationIndex?: number) {
        let sd = this.getSd(animationIndex),
            hd = this.getHd(animationIndex);

        if (!sd && !hd) return null;
        if (!sd) return hd;
        if (!hd) return sd;

        if (size <= sd.width && size <= sd.height) return sd;
        else return hd;
    }

    /** Returns the width of the standard definition version. */
    getWidth(animationIndex?: number) {
        let sd = this.getSd(animationIndex);
        if (sd) return sd.width;
        let hd = this.getHd(animationIndex);
        if (hd) return hd.width/2;
        
        return null;
    }

    /** Returns the height of the standard definition version. */
    getHeight(animationIndex?: number) {
        let sd = this.getSd(animationIndex);
        if (sd) return sd.height;
        let hd = this.getHd(animationIndex);
        if (hd) return hd.height/2;
        
        return null;
    }

    getBiggestDimension(animationIndex?: number) {
        return Math.max(this.getWidth(animationIndex), this.getHeight(animationIndex));
    }

    getDownsizedDimensions(maxDimension: number, animationIndex?: number): Dimensions {
        let width = this.getWidth(animationIndex), height = this.getHeight(animationIndex);
        let ratio = width/height;

        if (width > height) {
            return {
                width: maxDimension,
                height: maxDimension / ratio
            };
        } else {
            return {
                width: maxDimension * ratio,
                height: maxDimension
            };
        }
    }

    isEmpty() {
        return (this.getDeFactoSdBase() || this.getDeFactoHdBase()) === null;
    }

    static async fromFiles(directory: VirtualDirectory, name: string, extension: string, hd = false, animationName: string = null) {
        let newOsuTexture = new OsuTexture();

        let sdBaseFile = await directory.getFileByName(`${name}.${extension}`);
        let hdBaseFile: VirtualFile;
        if (hd) hdBaseFile = await directory.getFileByName(`${name}@2x.${extension}`);

        if (sdBaseFile) newOsuTexture.sdBase = PIXI.Texture.from(await sdBaseFile.readAsResourceUrl());
        if (hdBaseFile) newOsuTexture.hdBase = PIXI.Texture.from(await hdBaseFile.readAsResourceUrl());

        if (animationName) {
            let i = 0;

            while (true) {
                let name = animationName.replace("{n}", i.toString());

                let sdFile = await directory.getFileByName(`${name}.${extension}`);
                let hdFile: VirtualFile;
                if (hd) hdFile = await directory.getFileByName(`${name}@2x.${extension}`);

                if (!sdFile && !hdFile) break; // No more animation states

                if (sdFile) {
                    let tex = PIXI.Texture.from(await sdFile.readAsResourceUrl());
                    newOsuTexture.sd.push(tex);
                    //if (i === 0 && !newOsuTexture.sdBase) newOsuTexture.sdBase = tex;
                }
                if (hdFile) {
                    let tex = PIXI.Texture.from(await hdFile.readAsResourceUrl());
                    newOsuTexture.hd.push(tex);
                    //if (i === 0 && !newOsuTexture.hdBase) newOsuTexture.hdBase = tex;
                }

                i++;
            }
        }

        return newOsuTexture;
    }
}

export interface HitSoundInfo {
    base: HitSoundType,
    additions?: HitSoundType[],
    volume: number,
    index?: number
}

export function getHitSoundTypesFromSampleSetAndBitmap(sampleSet: number, bitmap: number) {
    let types: HitSoundType[] = [];

    if ((bitmap & 1) !== 0) {
        if (sampleSet === 1) types.push(HitSoundType.NormalHitNormal);
        else if (sampleSet === 2) types.push(HitSoundType.SoftHitNormal);
        else if (sampleSet === 3) types.push(HitSoundType.DrumHitNormal);
    }
    if ((bitmap & 2) !== 0) {
        if (sampleSet === 1) types.push(HitSoundType.NormalHitWhistle);
        else if (sampleSet === 2) types.push(HitSoundType.SoftHitWhistle);
        else if (sampleSet === 3) types.push(HitSoundType.DrumHitWhistle);
    }
    if ((bitmap & 4) !== 0) {
        if (sampleSet === 1) types.push(HitSoundType.NormalHitFinish);
        else if (sampleSet === 2) types.push(HitSoundType.SoftHitFinish);
        else if (sampleSet === 3) types.push(HitSoundType.DrumHitFinish);
    }
    if ((bitmap & 8) !== 0) {
        if (sampleSet === 1) types.push(HitSoundType.NormalHitClap);
        else if (sampleSet === 2) types.push(HitSoundType.SoftHitClap);
        else if (sampleSet === 3) types.push(HitSoundType.DrumHitClap);
    }

    return types;
}

export function getTickHitSoundTypeFromSampleSet(sampleSet: number) {
    if (sampleSet === 1) return HitSoundType.NormalSliderTick;
    else if (sampleSet === 2) return HitSoundType.SoftSliderTick;
    else if (sampleSet === 3) return HitSoundType.DrumSliderTick;
}

export function getSliderSlideTypesFromSampleSet(sampleSet: number, bitmap: number) {
    let types: HitSoundType[] = [];

    bitmap |= 1; // Normal sound is always played

    if ((bitmap & 1) !== 0) {
        if (sampleSet === 1) types.push(HitSoundType.NormalSliderSlide);
        else if (sampleSet === 2) types.push(HitSoundType.SoftSliderSlide);
        else if (sampleSet === 3) types.push(HitSoundType.DrumSliderSlide);
    }
    if ((bitmap & 2) !== 0) {
        if (sampleSet === 1) types.push(HitSoundType.NormalSliderWhistle);
        else if (sampleSet === 2) types.push(HitSoundType.SoftSliderWhistle);
        else if (sampleSet === 3) types.push(HitSoundType.DrumSliderWhistle);
    }
    // Only normal and whistle are supported, so ignore finish and clap.

    return types;
}

class HitSound {
    private files: { [index: number]: VirtualFile };
    private audioBuffers: { [index: number]: AudioBuffer };

    constructor(directory: VirtualDirectory, fileName: string) {
        this.files = {};
        this.audioBuffers = {};

        directory.forEachFile((file) => {
            if (!file.name.startsWith(fileName)) return;

            let rawName = file.getNameWithoutExtension();
            let endIndex = rawName.length;

            while (endIndex > 0) {
                let char = rawName.charAt(endIndex - 1);
                if (charIsDigit(char)) endIndex--;
                else break;
            }

            let indexString = rawName.slice(endIndex);
            let index = 1;
            if (indexString) {
                index = Number(indexString);
            }

            this.files[index] = file;
        });
    }

    isEmpty() { // TODO. Eh. Is this fine?
        return Object.keys(this.files).length === 0;
    }

    async ready() {
        let audioBufferPromises: Promise<AudioBuffer>[] = [];

        for (let key in this.files) {
            let index = Number(key);
            let file = this.files[index];
            let arrayBuffer = await file.readAsArrayBuffer();

            audioBufferPromises.push(createAudioBuffer(arrayBuffer));

            /*
            try {
                let audioBuffer = await createAudioBuffer(arrayBuffer);

                this.audioBuffers[index] = audioBuffer;
            } catch(e) {
                // Audio wasn't able to be decoded. Add no emitter.
            }*/
        }

        let audioBuffers = await promiseAllSettled(audioBufferPromises);
        for (let key in this.files) {
            let index = Number(key);
            let elem = audioBuffers.shift();

            if (elem.status === "fulfilled") {
                this.audioBuffers[index] = elem.value;
            } else {
                // Audio wasn't able to be decoded. Add no emitter.
            }
        }
    }

    getEmitter(volume: number, index = 1) {
        let buffer = this.audioBuffers[index];
        if (!buffer) buffer = this.audioBuffers[1]; // Default to the standard one
        if (!buffer) return null;

        let emitter = new SoundEmitter({
            destination: soundEffectsNode,
            buffer: buffer,
            volume: volume/100
        });

        return emitter;
    }

    play(volume: number, index = 1) {
        let emitter = this.getEmitter(volume, index);
        if (emitter) emitter.start();
    }
}

export enum HitSoundType {
    NormalHitNormal,
    NormalHitWhistle,
    NormalHitFinish,
    NormalHitClap,
    NormalSliderSlide,
    NormalSliderWhistle,
    NormalSliderTick,

    SoftHitNormal,
    SoftHitWhistle,
    SoftHitFinish,
    SoftHitClap,
    SoftSliderSlide,
    SoftSliderWhistle,
    SoftSliderTick,

    DrumHitNormal,
    DrumHitWhistle,
    DrumHitFinish,
    DrumHitClap,
    DrumSliderSlide,
    DrumSliderWhistle,
    DrumSliderTick
}

let hitSoundFileNames: Map<HitSoundType, string> = new Map();
hitSoundFileNames.set(HitSoundType.NormalHitNormal, "normal-hitnormal");
hitSoundFileNames.set(HitSoundType.NormalHitWhistle, "normal-hitwhistle");
hitSoundFileNames.set(HitSoundType.NormalHitFinish, "normal-hitfinish");
hitSoundFileNames.set(HitSoundType.NormalHitClap, "normal-hitclap");
hitSoundFileNames.set(HitSoundType.NormalSliderSlide, "normal-sliderslide");
hitSoundFileNames.set(HitSoundType.NormalSliderWhistle, "normal-sliderwhistle");
hitSoundFileNames.set(HitSoundType.NormalSliderTick, "normal-slidertick");
//
hitSoundFileNames.set(HitSoundType.SoftHitNormal, "soft-hitnormal");
hitSoundFileNames.set(HitSoundType.SoftHitWhistle, "soft-hitwhistle");
hitSoundFileNames.set(HitSoundType.SoftHitFinish, "soft-hitfinish");
hitSoundFileNames.set(HitSoundType.SoftHitClap, "soft-hitclap");
hitSoundFileNames.set(HitSoundType.SoftSliderSlide, "soft-sliderslide");
hitSoundFileNames.set(HitSoundType.SoftSliderWhistle, "soft-sliderwhistle");
hitSoundFileNames.set(HitSoundType.SoftSliderTick, "soft-slidertick");
//
hitSoundFileNames.set(HitSoundType.DrumHitNormal, "drum-hitnormal");
hitSoundFileNames.set(HitSoundType.DrumHitWhistle, "drum-hitwhistle");
hitSoundFileNames.set(HitSoundType.DrumHitFinish, "drum-hitfinish");
hitSoundFileNames.set(HitSoundType.DrumHitClap, "drum-hitclap");
hitSoundFileNames.set(HitSoundType.DrumSliderSlide, "drum-sliderslide");
hitSoundFileNames.set(HitSoundType.DrumSliderWhistle, "drum-sliderwhistle");
hitSoundFileNames.set(HitSoundType.DrumSliderTick, "drum-slidertick");

export class Skin {
    private directory: VirtualDirectory;
    public config: SkinConfiguration;
    public hasDefaultConfig: boolean;
    public textures: { [name: string]: OsuTexture };
    public hitCircleNumberTextures: SpriteNumberTextures;
    public scoreNumberTextures: SpriteNumberTextures;
    public comboNumberTextures: SpriteNumberTextures;
    public colors: Color[];
    public sounds: { [key in keyof typeof HitSoundType]?: HitSound };

    constructor(directory: VirtualDirectory) {
        this.directory = directory;
        this.textures = {};
        this.hitCircleNumberTextures = null;
        this.scoreNumberTextures = null;
        this.comboNumberTextures = null;
        this.colors = [];
        this.sounds = {};
    }

    async init() {
        console.time("Skin init");

        let skinConfigurationFile = await this.directory.getFileByName("skin.ini") || await this.directory.getFileByName("Skin.ini");
        if (skinConfigurationFile) {
            this.config = parseSkinConfiguration(await skinConfigurationFile.readAsText());
            this.hasDefaultConfig = false;
        } else {
            this.config = jsonClone(DEFAULT_SKIN_CONFIG);
            this.config.general.version = "latest"; // If the skin.ini file is not present, latest will be used instead.
            this.hasDefaultConfig = true;
        }

        for (let i = 1; i <= 8; i++) {
            let color = this.config.colors[("combo" + i) as keyof SkinConfiguration["colors"]];
            if (color === null) break;

            this.colors.push(color);
        }

        this.textures["hitCircle"] = await OsuTexture.fromFiles(this.directory, "hitcircle", "png", true);
        this.textures["hitCircleOverlay"] = await OsuTexture.fromFiles(this.directory, "hitcircleoverlay", "png", true, "hitcircleoverlay-{n}");
        this.textures["sliderStartCircle"] = await OsuTexture.fromFiles(this.directory, "sliderstartcircle", "png", true);
        this.textures["sliderStartCircleOverlay"] = await OsuTexture.fromFiles(this.directory, "sliderstartcircleoverlay", "png", true, "sliderstartcircleoverlay-{n}");
        this.textures["sliderEndCircle"] = await OsuTexture.fromFiles(this.directory, "sliderendcircle", "png", true);
        this.textures["sliderEndCircleOverlay"] = await OsuTexture.fromFiles(this.directory, "sliderendcircleoverlay", "png", true, "sliderendcircleoverlay-{n}");
        this.textures["approachCircle"] = await OsuTexture.fromFiles(this.directory, "approachcircle", "png", true);
        this.textures["sliderBall"] = await OsuTexture.fromFiles(this.directory, "sliderb", "png", true, "sliderb{n}"); // No hyphen
        this.textures["sliderBallBg"] = await OsuTexture.fromFiles(this.directory, "sliderb-nd", "png", false);
        this.textures["sliderBallSpec"] = await OsuTexture.fromFiles(this.directory, "sliderb-spec", "png", false);
        this.textures["followCircle"] = await OsuTexture.fromFiles(this.directory, "sliderfollowcircle", "png", true, "sliderfollowcircle-{n}");
        this.textures["reverseArrow"] = await OsuTexture.fromFiles(this.directory, "reversearrow", "png", true);
        this.textures["sliderTick"] = await OsuTexture.fromFiles(this.directory, "sliderscorepoint", "png", true);
        this.textures["followPoint"] = await OsuTexture.fromFiles(this.directory, "followpoint", "png", true, "followpoint-{n}");
        this.textures["hit0"] = await OsuTexture.fromFiles(this.directory, "hit0", "png", true, "hit0-{n}");
        this.textures["hit50"] = await OsuTexture.fromFiles(this.directory, "hit50", "png", true, "hit50-{n}");
        this.textures["hit100"] = await OsuTexture.fromFiles(this.directory, "hit100", "png", true, "hit100-{n}");
        this.textures["hit100k"] = await OsuTexture.fromFiles(this.directory, "hit100k", "png", true, "hit100k-{n}");
        this.textures["hit300"] = await OsuTexture.fromFiles(this.directory, "hit300", "png", true, "hit300-{n}");
        this.textures["hit300k"] = await OsuTexture.fromFiles(this.directory, "hit300k", "png", true, "hit300k-{n}");
        this.textures["hit300g"] = await OsuTexture.fromFiles(this.directory, "hit300g", "png", true, "hit300g-{n}");

        // Hit circle numbers
        let tempObj: any = {};
        for (let suffix of HIT_CIRCLE_NUMBER_SUFFIXES) {
            tempObj[suffix as keyof SpriteNumberTextures] = await OsuTexture.fromFiles(this.directory, `${this.config.fonts.hitCirclePrefix}-${suffix}`, "png", true);
        }
        this.hitCircleNumberTextures = tempObj;

        // Score numbers
        tempObj = {};
        for (let suffix of SCORE_NUMBER_SUFFIXES) {
            tempObj[suffix as keyof SpriteNumberTextures] = await OsuTexture.fromFiles(this.directory, `${this.config.fonts.scorePrefix}-${suffix}`, "png", true);
        }
        this.scoreNumberTextures = tempObj;

        // Combo numbers
        tempObj = {};
        for (let suffix of SCORE_NUMBER_SUFFIXES) { // Combo uses the same suffixes as score
            tempObj[suffix as keyof SpriteNumberTextures] = await OsuTexture.fromFiles(this.directory, `${this.config.fonts.comboPrefix}-${suffix}`, "png", true);
        }
        this.comboNumberTextures = tempObj;

        // Sounds

        console.time("Hit sounds load");

        let hitSoundReadyPromises: Promise<void>[] = [];

        for (let key in HitSoundType) {
            if (isNaN(Number(key))) continue;

            let type = Number(key) as HitSoundType;
            let fileName = hitSoundFileNames.get(type);

            if (this.directory.networkFallbackUrl) {
                await this.directory.getFileByName(fileName + '.wav');
            }

            let hitSound = new HitSound(this.directory, fileName);
            hitSoundReadyPromises.push(hitSound.ready());

            this.sounds[key] = hitSound;
        }

        await Promise.all(hitSoundReadyPromises);

        console.timeEnd("Hit sounds load");

        console.timeEnd("Skin init");
    }

    async load() {
        await this.directory.loadShallow();
    }

    playHitSound(info: HitSoundInfo) {
        let baseSound = this.sounds[info.base];
        baseSound.play(info.volume, info.index);

        if (info.additions) {
            for (let i = 0; i < info.additions.length; i++) {
                let additionSound = this.sounds[info.additions[i]];
                additionSound.play(info.volume, info.index);
            }
        }
    }

    clone() {
        let newSkin = new Skin(this.directory);

        newSkin.config = this.config;
        newSkin.textures = shallowObjectClone(this.textures);
        newSkin.hitCircleNumberTextures = shallowObjectClone(this.hitCircleNumberTextures);
        newSkin.scoreNumberTextures = shallowObjectClone(this.scoreNumberTextures);
        newSkin.comboNumberTextures = shallowObjectClone(this.comboNumberTextures);
        newSkin.colors = this.colors.slice(0);
        newSkin.sounds = shallowObjectClone(this.sounds);

        return newSkin;
    }
}

export let baseSkin = new Skin(baseSkinDirectory);

export function joinSkins(skins: Skin[], joinTextures = true, joinHitsounds = true) {
    assert(skins.length > 0);

    let baseSkin = skins[0].clone();

    for (let i = 1; i < skins.length; i++) {
        let skin = skins[i];

        if (joinTextures) {
            for (let key in skin.textures) {
                let tex = skin.textures[key];
                if (tex.isEmpty()) continue;
    
                baseSkin.textures[key] = tex;
            }
            for (let k in skin.hitCircleNumberTextures) {
                let key = k as keyof SpriteNumberTextures;
    
                let tex = skin.hitCircleNumberTextures[key];
                if (tex.isEmpty()) continue;
    
                baseSkin.hitCircleNumberTextures[key] = tex;
            }
            for (let k in skin.scoreNumberTextures) {
                let key = k as keyof SpriteNumberTextures;
    
                let tex = skin.scoreNumberTextures[key];
                if (tex.isEmpty()) continue;
    
                baseSkin.scoreNumberTextures[key] = tex;
            }
            for (let k in skin.comboNumberTextures) {
                let key = k as keyof SpriteNumberTextures;
    
                let tex = skin.comboNumberTextures[key];
                if (tex.isEmpty()) continue;
    
                baseSkin.comboNumberTextures[key] = tex;
            }
    
            if (!skin.hasDefaultConfig) baseSkin.colors = skin.colors.slice(0);
        }

        if (joinHitsounds) {
            for (let key in skin.sounds) {
                let sound = skin.sounds[key];
                if (sound.isEmpty()) continue;
    
                baseSkin.sounds[key] = sound;
            }
        }
    }

    return baseSkin;
}