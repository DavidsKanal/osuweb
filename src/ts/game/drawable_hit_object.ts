import { HitObject } from "../datamodel/hit_object";
import { ComboInfo } from "./processed_beatmap";
import { Point } from "../util/point";
import { PlayEvent } from "./play_events";

export abstract class DrawableHitObject {
    public id: number = 0;
    public comboInfo: ComboInfo;
    public hitObject: HitObject;
    public container: PIXI.Container;

    public x: number;
    public y: number;
    public startPoint: Point;
    public endPoint: Point;
    public startTime: number;
    public endTime: number;

    /** Specifies the timeframe is which the object is visible and needs to be rendered. */
    public renderStartTime: number;
    /** When true, the hit object has ended its short life as a graphical element and need not be rendered anymore. */
    public renderFinished: boolean;

    constructor(hitObject: HitObject) {
        this.hitObject = hitObject;
        this.container = new PIXI.Container();

        this.startPoint = {
            x: this.hitObject.x,
            y: this.hitObject.y
        };
        this.startTime = this.hitObject.time;

        this.x = this.hitObject.x;
        this.y = this.hitObject.y;
    }

    abstract init(): void;

    abstract draw(): void;

    abstract show(currentTime: number): void;

    abstract position(): void;

    abstract update(currentTime: number): void;

    abstract remove(): void;

    abstract addPlayEvents(playEventArray: PlayEvent[]): void;

    /** @returns A boolean, indicating whether or not the object was handled by the button press. It could be false, for example, if the mouse wasn't over it or the object was already hit. */
    abstract handleButtonPress(osuMouseCoordinates: Point, currentTime: number): boolean;
}