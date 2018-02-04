import { Observable, Subscription } from 'rxjs';
import { Nullable, Try } from 'javascriptutilities';
import * as API from './API';
import * as Message from './Message';
import { Participant } from './Role';
import * as SuggestionId from './SuggestionId';

type VoterAPI<T> = API.Voter.Type<T>;

export function builder<T>(): Builder<T> {
  return new Builder();
}

/**
 * Check if a message type is supported by voters.
 * @param {Message.Case} type A message type instance.
 * @returns {boolean} A boolean value.
 */
export let hasMessageType = (type: Message.Case): boolean => {
  switch (type) {
    case Message.Case.PERMISSION_REQUEST:
    case Message.Case.SUGGESTION:
      return true;

    default:
      return false;
  }
};

/**
 * Represents a voter. The role of voter is a purely reactive role, because it
 * only involves listening to messages and responding in kind. Basically, each
 * voter has the following responsibilities:
 * - Receive persmission requests: Based on the algorithm's requirements, a
 * voter then either sends a permission granted or a nack response.
 * - Receive suggestion requests: Based on the algorithm's requirements, a voter
 * then either sends an acceptance request or a nack response.
 * @extends {Participant.Type} Participant extension.
 * @template T Generic parameter.
 */
export interface Type<T> extends Participant.Type {
  /**
   * Get a stream of messages supported by voters.
   * @returns {Observable<Try<Message.Generic.Type<T>>>} An Observable instance.
   */
  voterMessageStream(): Observable<Try<Message.Generic.Type<T>>>;
}

/**
 * Represents a voter.
 * @implements {Type<T>} Type implementation.
 * @template T Generic parameter.
 */
class Self<T> implements Type<T> {
  public _uid: string;
  public _api: Nullable<VoterAPI<T>>;
  private readonly subscription: Subscription;

  public get uid(): string {
    return this._uid;
  }

  public get api(): Try<VoterAPI<T>> {
    return Try.unwrap(this._api, 'Voter API not available');
  }

  public constructor() {
    this._uid = '';
    this.subscription = new Subscription();
  }

  public voterMessageStream = (): Observable<Try<Message.Generic.Type<T>>> => {
    try {
      let api = this.api.getOrThrow();

      return api.receiveMessages(this.uid).filter(v => {
        return v.map(v1 => hasMessageType(v1.type)).getOrElse(false);
      });
    } catch (e) {
      return Observable.of(Try.failure(e));
    }
  }

  public setupBindings = (): void => {
    let subscription = this.subscription;

    try {
      let api = this.api.getOrThrow();
      let uid = this.uid;

      let messageStream = api.receiveMessages(uid).shareReplay(1);

      messageStream
        .map(v => v.flatMap(v1 => Message.Permission.Request.extract(v1)))
        .flatMap(v => this.onPermissionRequest(api, v))
        .subscribe()
        .toBeDisposedBy(subscription);

      messageStream
        .map(v => v.flatMap(v1 => Message.Suggestion.extract(v1)))
        .flatMap(v => this.onSuggestionRequest(api, v))
        .subscribe()
        .toBeDisposedBy(subscription);
    } catch {}
  }

  private onPermissionRequest = (
    api: VoterAPI<T>,
    message: Try<Message.Permission.Request.Type>,
  ): Observable<Try<any>> => {
    try {
      let request = message.getOrThrow();
      let sender = request.senderId;
      let suggestion = request.suggestionId;
      let uid = this.uid;

      return api.getLastGrantedSuggestionId(uid)
        .map(v => v.getOrThrow())
        .flatMap((v): Observable<Message.Generic.Type<T>> => {
          if (SuggestionId.isLaterThan(suggestion, v)) {
            return api.storeLastGrantedSuggestionId(uid, suggestion)
              .map(v1 => v1.getOrThrow())
              .flatMap(() => api.getLastAcceptedData(uid))
              .map((v1): Message.Permission.Granted.Type<T> => ({
                suggestionId: suggestion,
                lastAccepted: v1,
              }))
              .map((v1): Message.Generic.Type<T> => ({
                type: Message.Case.PERMISSION_GRANTED,
                message: v1,
              }));
          } else {
            let nack: Message.Nack.Permission.Type = {
              currentSuggestionId: suggestion,
              lastAcceptedSuggestionId: v,
            };

            return Observable.of({ type: Message.Case.NACK_PERMISSION, message: nack });
          }
        })
        .flatMap(v => api.sendMessage(sender, v))
        .catchJustReturn(e => Try.failure<any>(e));
    } catch (e) {
      return Observable.of(Try.failure(e));
    }
  }

  private onSuggestionRequest = (
    _api: VoterAPI<T>,
    _message: Try<Message.Suggestion.Type<T>>,
  ): Observable<Try<any>> => {
    return Observable.empty();
  }
}

/**
 * Represents a voter Builder.
 * @template T Generic parameter.
 */
export class Builder<T> {
  private readonly voter: Self<T>;

  public constructor() {
    this.voter = new Self();
  }

  /**
   * Set the uid value.
   * @param {string} uid A string value.
   * @returns {this} The current Builder instance.
   */
  public withUID = (uid: string): this => {
    this.voter._uid = uid;
    return this;
  }

  /**
   * Set the API instance.
   * @param {VoterAPI<T>} api Voter API.
   * @returns {this} The current Builder instance.
   */
  public withAPI = (api: VoterAPI<T>): this => {
    this.voter._api = api;
    return this;
  }

  public build = (): Type<T> => {
    this.voter.setupBindings();
    return this.voter;
  }
}