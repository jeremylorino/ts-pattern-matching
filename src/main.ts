export type Fun<a, b> = (_: a) => b;

export type ListUpperBound<a, b> = b extends a ? b : a extends b ? a : never;

export type ListLowerBound<a, b> = any extends a ? never : a extends b ? never : a;

export type Dictionary<T = any> = {
    [index: string]: T;
};
export type KeyValuePair<V> = { name: string | (() => string); value: V | (() => V) };
function isKeyValuePair<V = any>(value: any): value is KeyValuePair<V> {
    return Reflect.has(value, "name") && Reflect.has(value, "value");
}
function isArrayOfKeyValuePair<V = any>(value: any): value is KeyValuePair<V>[] {
    return Array.isArray(value) && value.every(isKeyValuePair);
}

export type DictionaryRecord<T> = {
    [P in keyof T]?: T[P] extends (name: string) => infer U
        ? U extends KeyValuePair<infer V>
            ? { [key: string]: V }
            : U
        : never;
};

export type Pattern<a> = a extends number
    ? a | NumberConstructor
    : a extends string
    ? a | StringConstructor
    : a extends boolean
    ? a | BooleanConstructor
    : a extends object
    ? DictionaryRecord<a> | ObjectConstructor
    : a extends Array<infer aa>
    ? [Pattern<aa>]
    : { [k in keyof a]?: Pattern<a[k]> };

export type InvertPattern<p> = p extends NumberConstructor
    ? number
    : p extends StringConstructor
    ? string
    : p extends BooleanConstructor
    ? boolean
    : p extends ObjectConstructor
    ? object
    : p extends Array<infer pp>
    ? InvertPattern<pp>[]
    : { [k in keyof p]: InvertPattern<p[k]> };
type ArrayOrNot<T> = T extends (infer U)[] ? Partial<U>[] : T;
type ArrayType<T> = T extends (infer U)[] ? U : T;
type MatchArrayOrNot<T> = T extends (infer U)[] ? U[] : T;

type PatternDefinition<T1, T2 = any> = [Pattern<T1>, Fun<T1, boolean>, Fun<T1, T2>, "default" | "negated"];

class Matcher<a, b, c = null> {
    constructor(
        private value: a,
        private _otherwise: () => c = () => null,
        private patterns: PatternDefinition<a>[] = []
    ) {}

    /**
     * Adds a pattern
     * @param pattern   the pattern to test with
     * @param expr      the function to create the result with
     */
    with<R>(pattern: Pattern<a>, expr: Fun<ListUpperBound<a, InvertPattern<typeof pattern>>, R>) {
        return builder<a, R, c>(this.value)(this._otherwise, [
            ...this.patterns,
            [pattern, () => true, expr, "default"],
        ]);
    }

    /**
     * Adds a pattern with an additional predicate
     * @param pattern   the pattern to test with
     * @param when      a predicate that has to be true, outside the mathing of the pattern
     * @param expr      the function to create the result with
     */
    withWhen<R>(
        pattern: Pattern<a>,
        when: Fun<ListUpperBound<a, InvertPattern<typeof pattern>>, boolean>,
        expr: Fun<ListUpperBound<a, InvertPattern<typeof pattern>>, R>
    ) {
        return builder<a, R, c>(this.value)(this._otherwise, [...this.patterns, [pattern, when, expr, "default"]]);
    }

    /**
     * Adds a negated pattern. Negated patterns don't work with `any` as input
     * @param pattern   the pattern to test with
     * @param expr      the function to create the result with
     */
    withNot<R>(pattern: Pattern<a>, expr: Fun<ListLowerBound<a, InvertPattern<typeof pattern>>, R>) {
        return builder<a, R, c>(this.value)(this._otherwise, [
            ...this.patterns,
            [pattern, () => true, expr, "negated"],
        ]);
    }

    /**
     * Adds a negated pattern with an additional predicate. Negated patterns don't work with `any` as input
     * @param pattern   the pattern to test with
     * @param when      a predicate that has to be true, outside the mathing of the pattern
     * @param expr      the function to create the result with
     */
    withNotWhen<R>(
        pattern: Pattern<a>,
        when: Fun<ListLowerBound<a, InvertPattern<typeof pattern>>, boolean>,
        expr: Fun<ListLowerBound<a, InvertPattern<typeof pattern>>, R>
    ) {
        return builder<a, R, c>(this.value)(this._otherwise, [...this.patterns, [pattern, when, expr, "negated"]]);
    }

    /**
     * Sets the faalback value for when no pattern matches
     * @param otherwise   a function to create the result
     */
    otherwise<R>(otherwise: () => R) {
        return builder<a, b, R>(this.value)(otherwise, this.patterns);
    }

    /**
     * Runs the match and return the result of the first matching pattern
     */
    run(): b | c {
        const p = this.patterns.find(p => {
            if (p[1](this.value) === false) return false;
            if (p[3] === "default") return match_pattern(this.value, p[0]);
            return !match_pattern(this.value, p[0]);
        });
        if (p === undefined) return this._otherwise();
        return p[2](this.value);
    }
}

/**
 * Constructs the builder API
 * @param value       the input value
 * @param otherwise   optional - a function that creates the fallback value
 * @param patterns    optional - an array with the patterns
 */
export const match = <a, b = any>(value: a) => builder<a, b>(value)();

export const builder = <a, b, c = null>(value: a) => (
    otherwise: () => c = () => null,
    patterns: PatternDefinition<a>[] = []
) => new Matcher<a, b, c>(value, otherwise, patterns);

export const match_pattern = <a>(value: a, pattern: Pattern<a>, context?: any): boolean => {
    if (pattern === String) {
        return typeof value === "string";
    }
    if (pattern === Boolean) {
        return typeof value === "boolean";
    }
    if (pattern === Number) {
        return typeof value === "number" && Number.isNaN(value) === false;
    }

    if (isArrayOfKeyValuePair(value) && isArrayOfKeyValuePair(pattern)) {
        return value.some(v => {
            return pattern.some(v2 => match_pattern(v.name, v2.name) && match_pattern(v.value, v2.value));
        });
    }

    if (Array.isArray(pattern)) {
        if (!Array.isArray(value)) return false;

        return value.every(v => match_pattern(v, pattern[0]));
    }
    if (typeof value !== "object" && typeof value !== "function") {
        return value === pattern;
    }
    if (typeof value === "function" && typeof pattern === "function") {
        const valueResult = Reflect.apply(value, context, []);
        const patternResult = Reflect.apply(pattern as Function, undefined, []);
        return match_pattern(valueResult, patternResult);
    }
    return Object.keys(pattern).every(k => {
        if (pattern[k] === undefined) {
            return false;
        }

        if (typeof value[k] === "function") {
            return match_pattern(value[k], pattern[k], value);
        }

        if (typeof value === "function") {
            const valueFunction = context ? Reflect.apply(value, context, [k]) : value(k);
            if (isKeyValuePair(valueFunction)) {
                return match_pattern(valueFunction.value(), pattern[k]);
            }

            return match_pattern(valueFunction, pattern[k]);
        }

        return match_pattern(value[k], pattern[k]);
    });
};
