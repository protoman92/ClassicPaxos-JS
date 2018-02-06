import { Try } from 'javascriptutilities';

/**
 * Convert a suggestion id to a string value. This could be used for grouping
 * unique ids.
 * @param {Type} type A Type instance.
 * @returns {string} A string value.
 */
export let toString = (type: Type): string => {
  return `${type.id}-${type.integer}`;
};

/**
 * Increment a suggestion id's integer value while keeping the same id.
 * @param {Type} sid A Type instance.
 * @param {number} [byValue=1] A number value, defaults to 1.
 * @returns {Type} A Type instance.
 */
export let increment = (sid: Type, byValue: number = 1): Type => {
  return { id: sid.id, integer: sid.integer + byValue };
};

/**
 * Represents a suggestion id.
 */
export interface Type {
  readonly id: string;
  readonly integer: number;
}

/**
 * Represents a suggestion id.
 * @implements {Type} Type implementation.
 */
export class Self implements Type {
  private readonly _id: string;
  private readonly _integer: number;

  public get id(): string {
    return this._id;
  }

  public get integer(): number {
    return this._integer;
  }

  public constructor(id: string, integer: number) {
    this._id = id;
    this._integer = integer;
  }
}

/**
 * Check if the left-hand suggestion id is later than the right-hand one.
 * @param {Type} lhs A Type instance.
 * @param {Type} rhs A Type instance.
 * @returns {boolean} A boolean value.
 */
export let isLargerThan = (lhs: Type, rhs: Type): boolean => {
  if (lhs.integer > rhs.integer) {
    return true;
  } else if (lhs.integer === rhs.integer) {
    return lhs.id >= rhs.id;
  } else {
    return false;
  }
};

/**
 * Take the logically higher suggestion id.
 * @param {Type} lhs A Type instance.
 * @param {Type} rhs A Type instance.
 * @returns {Type} A Type instance.
 */
export let takeHigher = (lhs: Type, rhs: Type): Type => {
  return isLargerThan(lhs, rhs) ? lhs : rhs;
};

/**
 * Find the logically highest suggestion id.
 * @template T Generics parameter.
 * @param {T[]} obj Array of data, each of which contains a suggestionId.
 * @param {(v: T) => Type} selector SuggestionId selector.
 * @returns {Try<T>} A Try instance.
 */
export function highestSID<T>(obj: T[], selector: (v: T) => Type): Try<T> {
  try {
    return Try.unwrap(obj.reduce((v1, v2) => {
      return isLargerThan(selector(v1), selector(v2)) ? v1 : v2;
    }));
  } catch (e) {
    return Try.failure(e);
  }
}