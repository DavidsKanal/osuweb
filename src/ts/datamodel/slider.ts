import { HitObject, Samplings } from "./hit_object";
import { Point } from "../util/point";

// Use enum here?
type SliderCurveSectionType = 'unknown' | 'passthrough' | 'linear' | 'bezier';

export interface SliderCurveSection {
    type: SliderCurveSectionType,
    values: Point[]
}

export class Slider extends HitObject {
    public repeat: number;
    public length: number;
    public sections: SliderCurveSection[];
    public additions: number[] = [];
    public edgeSamplings: Samplings[] = [];
    public bodySamplings: Samplings;

    constructor(data: string[]) {
        super(data);

        this.sections = this.parseSections(data);
        this.repeat = parseInt(data[6]);
        this.length = parseFloat(data[7]);

        //region edgeAdditions
        if (data[8] !== null && data[8] !== undefined) {
            let additionsValuesRaw = data[8].split('|');

            let additions = [];

            for (let j = 0; j < additionsValuesRaw.length; j++) {
                additions.push(parseInt(additionsValuesRaw[j], 10));
            }

            this.additions = additions;
        }
        else {
            let additions = [];

            for (let j = 0; j < this.repeat + 1; j++) {
                additions.push(0);
            }

            this.additions = additions;
        }
        //endregion

        //region edgeSamplings
        if (data[9] !== null && data[9] !== undefined) {
            let edgeSamplings: Samplings[] = [];

            let splitEdgeSampleSetsRaw = data[9].split('|');

            for (let j = 0; j < splitEdgeSampleSetsRaw.length; j++) {
                let val = splitEdgeSampleSetsRaw[j].split(':');

                edgeSamplings.push({
                    sampleSet: parseInt(val[0], 10),
                    sampleSetAddition: parseInt(val[1], 10)
                });
            }
            this.edgeSamplings = edgeSamplings;
        }
        else {
            let edgeSamplings: Samplings[] = [];

            let splitEdgeSampleSetsRaw = [];

            for (let j = 0; j < this.repeat + 1; j++) splitEdgeSampleSetsRaw.push("0:0");

            for (let j = 0; j < splitEdgeSampleSetsRaw.length; j++) {
                let val = splitEdgeSampleSetsRaw[j].split(':');

                edgeSamplings.push({
                    sampleSet: parseInt(val[0], 10),
                    sampleSetAddition: parseInt(val[1], 10)
                });
            }

            this.edgeSamplings = edgeSamplings;
        }
        //endregion

        //region bodySamplings
        if (data[10] !== null && data[10] !== undefined) {
            let sliderBodySamplingValues = ["0", "0"];

            if (data[10] !== undefined) {
                sliderBodySamplingValues = data[10].split(':');
            }
            else {

            }

            this.bodySamplings = {
                sampleSet: parseInt(sliderBodySamplingValues[0], 10),
                sampleSetAddition: parseInt(sliderBodySamplingValues[1], 10)
            };
        }
        else {
            this.bodySamplings = {sampleSet: 0, sampleSetAddition: 0};
        }
        //endregion
    }

    parseSections(data: string[]) {
        let sliderPoints = data[5].split("|");

        let sliderType = sliderPoints[0];

        let sliderSections: SliderCurveSection[] = [];

        let sliderSectionPoints: Point[] = [{
            x: parseInt(data[0], 10),
            y: parseInt(data[1], 10)
        }];

        let lastPoint = null;

        for (let j = 1; j < sliderPoints.length; j++) {
            let coords = sliderPoints[j].split(':');

            let nextPoint: Point = {
                x: parseInt(coords[0], 10),
                y: parseInt(coords[1], 10)
            };

            // end section if same point appears twice and start a new one if end is not reached
            if (JSON.stringify(lastPoint) === JSON.stringify(nextPoint)) {
                this.finishSection(sliderSectionPoints, sliderType, sliderSections);

                // Don't make a new section in case this is the last point
                if (j + 1 !== sliderPoints.length) sliderSectionPoints = [];
            }

            sliderSectionPoints.push(nextPoint);

            if(j + 1 === sliderPoints.length) this.finishSection(sliderSectionPoints, sliderType, sliderSections);

            lastPoint = nextPoint;
        }

        return sliderSections;
    }

    finishSection(sliderSectionPoints: Point[], sliderType: string, sliderSections: SliderCurveSection[]) {
        let sectionType: SliderCurveSectionType = "unknown";

        if (sliderSectionPoints.length === 3 && sliderType === "P") {
            sectionType = "passthrough";
        }
        else if (sliderSectionPoints.length === 2) {
            sectionType = "linear";
        }
        else {
            sectionType = "bezier";
        }

        if (sliderSectionPoints.length > 1) sliderSections.push({
            type: sectionType,
            values: sliderSectionPoints
        });
    }
}