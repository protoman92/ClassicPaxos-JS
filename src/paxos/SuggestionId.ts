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