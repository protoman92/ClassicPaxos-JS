import { Observable, Observer, Subject, Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { Nullable, Try } from 'javascriptutilities';
import * as Arbiter from './Arbiter';
import * as Config from './Config';
import * as Message from './Message';
import * as SID from './SuggestionId';
import * as Suggester from './Suggester';
import * as Voter from './Voter';

export function builder<T>(): Builder<T> {
  return new Builder();
}

/**
 * Represents a node that can perform all roles.
 * @extends {Arbiter.Type<T>} Arbiter extension.
 * @extends {Suggester.Type<T>} Suggester extension.
 * @extends {Voter.Type<T>} Voter extension.
 * @template T Generic parameter.
 */
export interface Type<T> extends Arbiter.Type<T>, Suggester.Type<T>, Voter.Type<T> {}

class Self<T> implements Type<T> {
  public _uid: string;
  public _config: Nullable<Config.Node.Type>;
  public _arbiter: Nullable<Arbiter.Type<T>>;
  public _suggester: Nullable<Suggester.Type<T>>;
  public _voter: Nullable<Voter.Type<T>>;
  private readonly subscription: Subscription;

  private get arbiter(): Try<Arbiter.Type<T>> {
    return Try.unwrap(this._arbiter, 'Missing arbiter');
  }

  private get suggester(): Try<Suggester.Type<T>> {
    return Try.unwrap(this._suggester, 'Missing suggester');
  }

  private get voter(): Try<Voter.Type<T>> {
    return Try.unwrap(this._voter, 'Missing voter');
  }

  private get config(): Try<Config.Node.Type> {
    return Try.unwrap(this._config, 'Missing config for node');
  }

  private get delayBeforeClaimingLeadership(): number {
    return this.config.map(v => v.delayBeforeClaimingLeadership).getOrElse(0);
  }

  public get uid(): string {
    return this._uid;
  }

  public constructor() {
    this._uid = uuid();
    this.subscription = new Subscription();
  }

  public setupBindings = (): void => {
    try {
      this.arbiter.getOrThrow().setupBindings();
      this.suggester.getOrThrow().setupBindings();
      this.voter.getOrThrow().setupBindings();
      let leadershipDelay = this.delayBeforeClaimingLeadership;

      Observable
        .merge<Try<Message.Generic.Type<T>>>(
          this.arbiterMessageStream(),
          this.voterMessageStream(),
        )
        .map((): Nullable<SID.Type> => undefined)
        .timeout(leadershipDelay)
        .ignoreElements()
        .catch(() => this.tryPermissionStream().take(1))
        .subscribe(this.tryPermissionTrigger())
        .toBeDisposedBy(this.subscription);

    } catch (e) {
      throw e;
    }
  }

  public arbiterMessageStream = (): Observable<Try<Message.Generic.Type<T>>> => {
    try {
      let arbiter = this.arbiter.getOrThrow();
      return arbiter.arbiterMessageStream();
    } catch (e) {
      return Observable.of(Try.failure(e));
    }
  }

  public sendFirstPermissionRequest = (): void => {
    this.suggester.doOnNext(v => v.sendFirstPermissionRequest());
  }

  public tryPermissionTrigger = (): Observer<any> => {
    return this.suggester
      .map(v => v.tryPermissionTrigger())
      .getOrElse(new Subject());
  }

  public tryPermissionStream = (): Observable<any> => {
    return this.suggester
      .map(v => v.tryPermissionStream())
      .getOrElse(Observable.empty());
  }

  public suggesterMessageStream = (): Observable<Try<Message.Generic.Type<T>>> => {
    try {
      let suggester = this.suggester.getOrThrow();
      return suggester.suggesterMessageStream();
    } catch (e) {
      return Observable.of(Try.failure(e));
    }
  }

  public voterMessageStream = (): Observable<Try<Message.Generic.Type<T>>> => {
    try {
      let voter = this.voter.getOrThrow();
      return voter.voterMessageStream();
    } catch (e) {
      return Observable.of(Try.failure(e));
    }
  }
}

export class Builder<T> {
  private readonly node: Self<T>;

  public constructor() {
    this.node = new Self();
  }

  /**
   * Set the uid.
   * @param {string} uid A string value.
   * @returns {this} The current Builder instance.
   */
  public withUID(uid: string): this {
    this.node._uid = uid;
    return this;
  }

  /**
   * Set the config instance for the current node.
   * @param {Nullable<Config.Node.Type>} config A node config instance.
   * @returns {this} The current Builder instance.
   */
  public withConfig = (config: Nullable<Config.Node.Type>): this => {
    this.node._config = config;
    return this;
  }

  /**
   * Set the arbiter instance.
   * @param {Nullable<Arbiter.Type<T>>} arbiter An arbiter instance.
   * @returns {this} The current Builder instance.
   */
  public withArbiter = (arbiter: Nullable<Arbiter.Type<T>>): this => {
    this.node._arbiter = arbiter;
    return this;
  }

  /**
   * Set the suggester instance.
   * @param {Nullable<Suggester.Type<T>>} suggester A suggester instance.
   * @returns {this} The current Builder instance.
   */
  public withSuggester = (suggester: Nullable<Suggester.Type<T>>): this => {
    this.node._suggester = suggester;
    return this;
  }

  /**
   * Set the voter instance.
   * @param {Nullable<Voter.Type<T>>} voter A voter instance.
   * @returns {this} The current Builder instance.
   */
  public withVoter = (voter: Nullable<Voter.Type<T>>): this => {
    this.node._voter = voter;
    return this;
  }

  public build = (): Type<T> => this.node;
}