import { MathUtil, EaseType } from "./math_util";

export interface Dimensions {
	width: number,
	height: number
}

export interface Color {
	r: number, // 0-255
	g: number, // 0-255
	b: number, // 0-255
	a?: number // 0.0-1.0
}

export function colorToHexNumber(color: Color) {
	return (color.r | 0) * 0x10000 + (color.g | 0) * 0x100 + (color.b | 0) * 0x1;
}

export function colorToHexString(color: Color) {
	return '#' + ('000000' + colorToHexNumber(color).toString(16)).slice(-6);
}

export function hexNumberToColor(hexNumber: number): Color {
	let r = (hexNumber & 0xFF0000) >> 16;
	let g = (hexNumber & 0x00FF00) >> 8;
	let b = (hexNumber & 0x0000FF) >> 0;

	return {r, g, b};
}

export function lerpColors(c1: Color, c2: Color, t: number): Color {
	return {
		r: MathUtil.lerp(c1.r, c2.r, t),
		g: MathUtil.lerp(c1.g, c2.g, t),
		b: MathUtil.lerp(c1.b, c2.b, t)
	};
}

export function parseColor(parts: string[], startIndex: number): Color {
	return {
		r: parseInt(parts[startIndex + 0]),
		g: parseInt(parts[startIndex + 1]),
		b: parseInt(parts[startIndex + 2])
	};
}

export const Colors = {
	White: {r: 255, g: 255, b: 255} as Color,
	Black: {r: 0, g: 0, b: 0} as Color,
	Red: {r: 255, g: 0, b: 0} as Color,
	Green: {r: 0, g: 255, b: 0} as Color,
	Blue: {r: 0, g: 0, b: 255} as Color,
	Yellow: {r: 255, g: 255, b: 0} as Color
} as const;

/**
 * @param actualWidth The actual width of the container for which the scaling factor is to be calculated
 * @param actualHeight The actual height of the container for which the scaling factor is to be calculated
 * @param criticalRatio If the actual width/height-ratio of the container exceeds this number, the scaling factor will be calculated in reference to the height; otherwise, it will be calculated in reference to width.
 * @param unitHeight The height at which the scaling factor will be exactly 1.0, if the scaling factor is currently calculated in reference to height.
 */
export function calculateRatioBasedScalingFactor(actualWidth: number, actualHeight: number, criticalRatio: number, unitHeight: number) {
	let ratio = actualWidth / actualHeight;

	if (ratio >= criticalRatio) {
		return actualHeight / unitHeight;
	} else {
		return actualWidth / criticalRatio / unitHeight;
	}
}