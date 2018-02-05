import { Observable, Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { Collections, Nullable, Try } from 'javascriptutilities';
import * as API from './API';
import * as Config from './Config';
import * as Message from './Message';
import * as SID from './SuggestionId';
import { Participant } from './Role';

export type PermitGrant<T> = Message.Permission.Granted.Type<T>;
export type SuggestAPI<T> = API.Suggester.Type<T>;
export type SuggestConfig = Config.Suggester.Type;

export function builder<T>(): Builder<T> {
  return new Builder();
}

/**
 * Check if a message type is supported by suggesters.
 * @param {Message.Case} type A message type instance.
 * @returns {boolean} A boolean value.
 */
export let hasMessageType = (type: Message.Case): boolean => {
  switch (type) {
    case Message.Case.PERMISSION_GRANTED:
    case Message.Case.NACK_PERMISSION:
      return true;

    default:
      return false;
  }
};

/**
 * Represents a suggester. The suggester is responsible for:
 * - Sending the original permission request to suggest a value. It will then
 * either receive a permission granted or a nack message indicating that the
 * proposal number was too low.
 * - Sending a suggested value. Depending on whether there was a previously
 * agreed-upon value, the suggester can suggest an arbitrary value or exactly
 * the same value as that which has been accepted.
 * @extends {Participant.Type} Participant extension.
 * @template T Generic parameter.
 */
export interface Type<T> extends Participant.Type {
  readonly quorumSize: number;
  calculateQuorumMajority(): number;
  suggesterMessageStream(): Observable<Try<Message.Generic.Type<T>>>;
}

/**
 * Represents a suggester.
 * @implements {Type<T>} Type implementation.
 * @template T Generic parameter.
 */
class Self<T> implements Type<T> {
  public _uid: string;
  public _api: Nullable<SuggestAPI<T>>;
  public _config: Nullable<SuggestConfig>;
  private readonly subscription: Subscription;

  public get uid(): string {
    return this._uid;
  }

  public get quorumSize(): number {
    return this.config.map(v => v.quorumSize).getOrElse(0);
  }

  public get api(): Try<SuggestAPI<T>> {
    return Try.unwrap(this._api, 'API for suggester not available');
  }

  private get config(): Try<SuggestConfig> {
    return Try.unwrap(this._config, 'Suggester config not set');
  }

  public constructor() {
    this._uid = uuid();
    this.subscription = new Subscription();
  }

  public calculateQuorumMajority = (): number => {
    let qSize = this.quorumSize;

    return this.api
      .flatMap(v => Try.unwrap(v.calculateMajority))
      .map(v => v(qSize))
      .getOrElse(() => API.MajorityCalculator.calculateDefault(qSize));
  }

  public suggesterMessageStream = (): Observable<Try<Message.Generic.Type<T>>> => {
    try {
      let api = this.api.getOrThrow();

      return api.receiveMessage(this.uid)
        .filter(v => v.map(v1 => hasMessageType(v1.type)).getOrElse(false));
    } catch (e) {
      return Observable.of(Try.failure(e));
    }
  }

  public setupBindings(): void {
    try {
      let api = this.api.getOrThrow();
      let config = this.config.getOrThrow();
      let uid = this.uid;
      let takeCutoff = config.takeCutoff;
      let subscription = this.subscription;
      let messageStream = api.receiveMessage(uid).shareReplay(1);
      let majority = this.calculateQuorumMajority();

      let grantedStream = messageStream
        .map(v => v.flatMap(v1 => Message.Permission.Granted.extract(v1)))
        .mapNonNilOrEmpty(v => v)
        .groupBy(v => SID.toString(v.suggestionId))
        .switchMap(v => v.takeUntil(Observable.timer(takeCutoff)).toArray())
        .shareReplay(1);

      let suggestStream = grantedStream
        .filter(v => v.length >= majority)
        .flatMap(v => this.onPermissionGranted(api, v))
        .shareReplay(1);

      Observable
        .merge(
          suggestStream.mapNonNilOrEmpty(v => v.error),
          messageStream.mapNonNilOrEmpty(v1 => v1.error),
        )
        .flatMap(e => api.sendErrorStack(uid, e))
        .subscribe()
        .toBeDisposedBy(subscription);
    } catch (e) {
      throw e;
    }
  }

  /**
   * Upon receipt of permission granted responses, the suggester first needs to
   * check whether, among all the responses, the majority have accepted some
   * values (they don't have to be the same value) previously. If this is the
   * case, it must propose the same value as that belonging to the last accepted
   * data with the logically highest suggestion id. Otherwise, it can suggest
   * an arbitrary value.
   * @param {SuggestAPI<T>} api A suggester API instance.
   * @param {PermitGrant<T>[]} messages An Array of PermitGrant responses.
   * @returns {Observable<Try<any>>} An Observable instance.
   */
  private onPermissionGranted(api: SuggestAPI<T>, messages: PermitGrant<T>[]) {
    let uid = this.uid;
    let majority = this.calculateQuorumMajority();

    /// All suggestion ids should be the same here since we have already grouped
    /// messages by their suggestion ids.
    let sid = Collections.first(messages).map(v => v.suggestionId);

    return Try.success(messages)
      .map(v => Collections.flatMap(v.map(v1 => v1.lastAccepted)))
      .filter(v => v.length >= majority, v => `${v} has less than ${majority}`)
      .flatMap(v => Message.LastAccepted.highestSuggestionId(...v))
      .map(v => Observable.of(Try.success(v.value)))
      .getOrElse(() => api.getFirstSuggestionValue(uid))
      .map(v => v.zipWith(sid, (a, b) => ({ suggestionId: b, value: a })))
      .map(v => v.getOrThrow())
      .map(v => ({ type: Message.Case.SUGGESTION, message: v }))
      .flatMap(v => api.broadcastMessage(v))
      .catchJustReturn(e => Try.failure(e));
  }
}

export class Builder<T> {
  private readonly suggester: Self<T>;

  public constructor() {
    this.suggester = new Self();
  }

  /**
   * Set the suggester uid.
   * @param {string} uid A string value.
   * @returns {this} The current Builder instance.
   */
  public withUID = (uid: string): this => {
    this.suggester._uid = uid;
    return this;
  }

  /**
   * Set the quorum size.
   * @param {Nullable<SuggestConfig>} config A suggester config instance.
   * @returns {this} The current Builder instance.
   */
  public withConfig(config: Nullable<SuggestConfig>): this {
    this.suggester._config = config;
    return this;
  }

  /**
   * Set the suggester API.
   * @param {Nullable<SuggestAPI<T>>} api A suggester API instance.
   * @returns {this} The current Builder instance.
   */
  public withAPI = (api: Nullable<SuggestAPI<T>>): this => {
    this.suggester._api = api;
    return this;
  }

  public build = (): Type<T> => {
    this.suggester.setupBindings();
    return this.suggester;
  }
}