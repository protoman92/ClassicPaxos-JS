import { BuildableType, BuilderType, Nullable } from 'javascriptutilities';
import * as Arbiter from './Arbiter';
import * as Suggester from './Suggester';
import * as Voter from './Voter';

export function builder<T>(): Builder<T> {
  return new Builder();
}

/**
 * Represents a Paxos instance.
 * @extends {BuildableType<Builder<T>>} Buildable extension.
 * @template T Generic parameter.
 */
export interface Type<T> extends BuildableType<Builder<T>> {
  readonly arbiters: Arbiter.Type[];
  readonly suggesters: Suggester.Type[];
  readonly voters: Voter.Type<T>[];
}

/**
 * Represents a Paxos instance.
 * @implements {Type} Type implementation.
 * @template T Generic parameter.
 */
class Self<T> implements Type<T> {
  public _arbiters: Arbiter.Type[];
  public _suggesters: Suggester.Type[];
  public _voters: Voter.Type<T>[];

  public get arbiters(): Arbiter.Type[] {
    return this._arbiters;
  }

  public get suggesters(): Suggester.Type[] {
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

  public builder = (): Builder<T> => builder();
  public cloneBuilder = (): Builder<T> => this.builder().withBuildable(this);
}

export class Builder<T> implements BuilderType<Type<T>> {
  private readonly instance: Self<T>;

  public constructor() {
    this.instance = new Self();
  }

  /**
   * Add a suggester to the current Paxos instance.
   * @param {Suggester.Type} arbiter A Suggester instance.
   * @returns {this} The current Builder instance.
   */
  public addSuggester = (suggester: Suggester.Type): this => {
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
   * @param {Arbiter.Type} arbiter An Arbiter instance.
   * @returns {this} The current Builder instance.
   */
  public addArbiter = (arbiter: Arbiter.Type): this => {
    this.instance._arbiters.push(arbiter);
    return this;
  }

  /**
   * Set the arbiters for a Paxos instance.
   * @param {...Arbiter.Type[]} arbiters An Array of arbiters.
   * @returns {this} The current Builder instance.
   */
  public withArbiters = (...arbiters: Arbiter.Type[]): this => {
    this.instance._arbiters = arbiters;
    return this;
  }

  /**
   * Set the suggesters for a Paxos instance.
   * @param {...Suggester.Type[]} suggesters An Array of suggesters.
   * @returns {this} The current Builder instance.
   */
  public withSuggesters = (...suggesters: Suggester.Type[]): this => {
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

  public withBuildable = (buildable: Nullable<Type<T>>): this => {
    if (buildable !== undefined && buildable !== null) {
      return this
        .withArbiters(...buildable.arbiters)
        .withSuggesters(...buildable.suggesters)
        .withVoters(...buildable.voters);
    } else {
      return this;
    }
  }

  public build = (): Type<T> => this.instance;
}