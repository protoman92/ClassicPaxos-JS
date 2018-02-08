import { Collections, Try } from 'javascriptutilities';
import * as Arbiter from './Arbiter';
import * as Node from './Node';
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

  /**
   * Commence the decision process. This call is optional if all participants
   * serve three roles at once, because even if it is not invoked, some other
   * participant(s) will self-elect to propose values.
   * @param {(uid: string) => boolean} [leaderSelector] Leader selector. If
   * this is not defined, select a random leader.
   */
  commenceDecisionProcess(leaderSelector?: (uid: string) => boolean): void;
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
    return this._voters;
  }

  public constructor() {
    this._arbiters = [];
    this._suggesters = [];
    this._voters = [];
  }

  public commenceDecisionProcess = (leaderFn?: (v: string) => boolean): void => {
    Try.success(this._suggesters)
      .flatMap((v): Try<Suggester.Type<T>> => {
        return leaderFn !== undefined
          ? Collections.first(v.filter(v1 => leaderFn(v1.uid)))
          : Collections.randomElement(v);
      })
      .doOnNext(v => v.sendFirstPermissionRequest());
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
   * Add a node to the current Paxos instance.
   * @param {Node.Type<T>} node A Node instance.
   * @returns {this} The current Builder instance.
   */
  public addNode(node: Node.Type<T>): this {
    return this.addArbiter(node).addSuggester(node).addVoter(node);
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

  /**
   * Set nodes for a Paxos instance. These nodes serve all roles.
   * @param {...Node.Type<T>[]} nodes An Array of nodes.
   * @returns {this} The current Builder instance.
   */
  public withNodes = (...nodes: Node.Type<T>[]): this => {
    return this
      .withArbiters(...nodes)
      .withSuggesters(...nodes)
      .withVoters(...nodes);
  }

  public build = (): Type<T> => this.instance;
}