import { Observable, Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { Collections, Nullable, Try } from 'javascriptutilities';
import * as API from './API';
import * as Config from './Config';
import * as Message from './Message';
import * as SID from './SuggestionId';
import { Participant } from './Role';

export type ArbiterAPI<T> = API.Arbiter.Type<T>;
export type ArbiterConfig = Config.Arbiter.Type;

export function builder<T>(): Builder<T> {
  return new Builder();
}

/**
 * Check if a message type is supported by arbiters.
 * @param {Message.Case} type A message type instance.
 * @returns {boolean} A boolean value.
 */
export let supportsMessageType = (type: Message.Case): boolean => {
  switch (type) {
    case Message.Case.ACCEPTANCE:
      return true;

    default:
      return false;
  }
};

/**
 * Represents an arbiter. The arbiter is responsible for:
 * - Listening to accepted requests and declare the enclosed value as the final
 * accepted value. After that, it can send messages to suggesters informing them
 * of the decision so that they may stop proposing.
 * @extends {Participant.Type} Participant extension.
 * @template T Generic parameter.
 */
export interface Type<T> extends Participant.Type {
  arbiterMessageStream(): Observable<Try<Message.Generic.Type<T>>>;
}

/**
 * Represents an arbiter.
 * @implements {Type<T>} Type implementation.
 * @template T Generic parameter.
 */
class Self<T> implements Type<T> {
  public _uid: string;
  public _api: Nullable<ArbiterAPI<T>>;
  public _config: Nullable<ArbiterConfig>;
  private readonly subscription: Subscription;

  public get uid(): string {
    return this._uid;
  }

  public get api(): Try<ArbiterAPI<T>> {
    return Try.unwrap(this._api, 'Missing arbiter API');
  }

  private get config(): Try<ArbiterConfig> {
    return Try.unwrap(this._config, 'Missing arbiter config');
  }

  private get quorumSize(): number {
    return this.config.map(v => v.quorumSize).getOrElse(0);
  }

  public constructor() {
    this._uid = uuid();
    this.subscription = new Subscription();
  }

  private calculateQuorumMajority = (): number => {
    let qSize = this.quorumSize;

    return this.api
      .flatMap(v => Try.unwrap(v.calculateMajority))
      .map(v => v(qSize))
      .getOrElse(() => API.MajorityCalculator.calculateDefault(qSize));
  }

  public arbiterMessageStream = (): Observable<Try<Message.Generic.Type<T>>> => {
    try {
      let api = this.api.getOrThrow();

      return api.receiveMessage(this.uid)
        .filter(v => v.map(v1 => supportsMessageType(v1.type)).getOrElse(false));
    } catch (e) {
      return Observable.of(Try.failure(e));
    }
  }

  public setupBindings = (): void => {
    try {
      let api = this.api.getOrThrow();
      let uid = this._uid;
      let majority = this.calculateQuorumMajority();
      let subscription = this.subscription;
      let messageStream = this.arbiterMessageStream().shareReplay(1);

      /// Only take the first accepted value.
      let declareStream = messageStream
        .map(v => v.flatMap(v1 => Message.Acceptance.extract(v1)))
        .mapNonNilOrEmpty(v => v)
        .groupBy(v => `${SID.toString(v.sid)}-${api.stringifyValue(v.value)}`)
        .flatMap(v => v.take(majority).toArray()
          .map(v1 => Collections.first(v1).map(v2 => v2.value))
          .mapNonNilOrEmpty(v1 => v1)).take(1)
        .flatMap(v => api.declareFinalValue(v).map(v1 => v1.map(() => v)))
        .shareReplay(1);

      declareStream
        .mapNonNilOrEmpty(v => v)
        .map((v): Message.Success.Type<T> => ({ value: v }))
        .map(v => ({ type: Message.Case.SUCCESS, message: v }))
        .flatMap(v => api.broadcastMessage(v))
        .subscribe()
        .toBeDisposedBy(subscription);

      Observable
        .merge<Error>(
          messageStream.mapNonNilOrEmpty(v => v.error),
          declareStream.mapNonNilOrEmpty(v => v.error),
        )
        .flatMap(e => api.sendErrorStack(uid, e))
        .subscribe()
        .toBeDisposedBy(subscription);
    } catch (e) {
      throw e;
    }
  }
}

/**
 * Builder for arbiter.
 * @template T Generic parameter.
 */
export class Builder<T> {
  private readonly arbiter: Self<T>;

  public constructor() {
    this.arbiter = new Self();
  }

  /**
   * Set the arbiter uid.
   * @param {string} uid A string value.
   * @returns {this} The current Builder instance.
   */
  public withUID = (uid: string): this => {
    this.arbiter._uid = uid;
    return this;
  }

  /**
   * Set the arbiter API.
   * @param {ArbiterAPI<T>} api An arbiter API instance.
   * @returns {this} The current Builder instance.
   */
  public withAPI = (api: ArbiterAPI<T>): this => {
    this.arbiter._api = api;
    return this;
  }

  /**
   * Set the arbiter config.
   * @param {ArbiterConfig} config An arbiter config instance.
   * @returns {this} The current Builder instance.
   */
  public withConfig = (config: ArbiterConfig): this => {
    this.arbiter._config = config;
    return this;
  }

  public build = (): Type<T> => this.arbiter;
}