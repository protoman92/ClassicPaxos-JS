import * as Arbiter from './Arbiter';
import * as Suggester from './Suggester';
import * as Voter from './Voter';

export function builder<T>(): Builder<T> {
  return new Builder();
}

/**
 * Represents a Paxos instance.
 * @template T Generic parameter.
 */
export interface Type<T> {
  readonly arbiters: Arbiter.Type<T>[];
  readonly suggesters: Suggester.Type<T>[];
  readonly voters: Voter.Type<T>[];
}

/**
 * Represents a Paxos instance.
 * @implements {Type<T>} Type implementation.
 * @template T Generic parameter.
 */
class Self<T> implements Type<T> {
  public _arbiters: Arbiter.Type<T>[];
  public _suggesters: Suggester.Type<T>[];
  public _voters: Voter.Type<T>[];

  public get arbiters(): Arbiter.Type<T>[] {
    return this._arbiters;
  }

  public get suggesters(): Suggester.Type<T>[] {
    return this._suggesters;
  }

  public get voters(): Voter.Type<T>[] {
    return this.voters;
  }

  public constructor() {
    this._arbiters = [];
    this._suggesters = [];
    this._voters = [];
  }
}

export class Builder<T> {
  private readonly instance: Self<T>;

  public constructor() {
    this.instance = new Self();
  }

  /**
   * Add a suggester to the current Paxos instance.
   * @param {Suggester.Type<T>} arbiter A Suggester instance.
   * @returns {this} The current Builder instance.
   */
  public addSuggester = (suggester: Suggester.Type<T>): this => {
    this.instance._suggesters.push(suggester);
    return this;
  }

  /**
   * Add a voter to the current Paxos instance.
   * @param {Voter.Type<T>} voter A Voter instance.
   * @returns {this} The current Builder instance.
   */
  public addVoter = (voter: Voter.Type<T>): this => {
    this.instance._voters.push(voter);
    return this;
  }

  /**
   * Add an arbiter to the current Paxos instance.
   * @param {Arbiter.Type<T>} arbiter An Arbiter instance.
   * @returns {this} The current Builder instance.
   */
  public addArbiter = (arbiter: Arbiter.Type<T>): this => {
    this.instance._arbiters.push(arbiter);
    return this;
  }

  /**
   * Set the arbiters for a Paxos instance.
   * @param {...Arbiter.Type<T>[]} arbiters An Array of arbiters.
   * @returns {this} The current Builder instance.
   */
  public withArbiters = (...arbiters: Arbiter.Type<T>[]): this => {
    this.instance._arbiters = arbiters;
    return this;
  }

  /**
   * Set the suggesters for a Paxos instance.
   * @param {...Suggester.Type<T>[]} suggesters An Array of suggesters.
   * @returns {this} The current Builder instance.
   */
  public withSuggesters = (...suggesters: Suggester.Type<T>[]): this => {
    this.instance._suggesters = suggesters;
    return this;
  }

  /**
   * Set the voters for a Paxos instance.
   * @param {...Voter.Type<T>[]} voters An Array of voters.
   * @returns {this} The current Builder instance.
   */
  public withVoters = (...voters: Voter.Type<T>[]): this => {
    this.instance._voters = voters;
    return this;
  }

  public build = (): Type<T> => this.instance;
}