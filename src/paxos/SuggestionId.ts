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
    return lhs.id > rhs.id;
  } else {
    return false;
  }
};