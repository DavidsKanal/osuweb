import { DrawableHitObject } from "./drawables/drawable_hit_object";
import { Point } from "../util/point";
import { HitSoundInfo } from "./skin/sound";

export enum PlayEventType {
    SliderHead,
    SliderTick,
    SliderRepeat,
    SliderEnd,
    SliderEndCheck, // When user input is checked. Happens a bit earlier than the actual slider end. https://www.reddit.com/r/osugame/comments/9rki8o/how_are_slider_judgements_calculated/
    SliderSlide, // sustained event
    HeadHitWindowEnd,
    PerfectHeadHit,
    SpinnerEnd,
    SpinnerSpin, // sustained event
    DrawSlider,
}

export interface PlayEvent {
    type: PlayEventType,
    hitObject: DrawableHitObject,
    time: number,
    endTime?: number, // If endTime is set, it's not a singular event, but a sustained event
    position?: Point, // Where the event takes place, for example slider ticks.
    hitSound?: HitSoundInfo, // For slider ends
    i?: number // An index for general use
}