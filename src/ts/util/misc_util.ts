export function padNumberWithZeroes(num: number, zeroes: number) {
    let str = String(num);
    let dotIndex = str.indexOf('.');
    let neededZeroes: number;

    if (dotIndex === -1) {
        neededZeroes = zeroes - str.length;
    } else {
        neededZeroes = zeroes - dotIndex;
    }

    return "0000000000000000000000000000".slice(0, neededZeroes) + str;
}

export function toPercentageString(num: number, decimals?: number) {
    if (decimals === undefined) {
        return (num * 100) + '%';
    } else {
        return (num * 100).toFixed(decimals) + '%'
    }
}

/** Throws if the passed value is falsey. */
export function assert(value: any) {
    if (!value) {
        throw new Error("Assertion failed!");
    }
}