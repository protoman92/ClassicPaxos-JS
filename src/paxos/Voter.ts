import { Observable, Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { Nullable, Try } from 'javascriptutilities';
import * as API from './API';
import * as Message from './Message';
import { Participant } from './Role';
import * as SuggestionId from './SuggestionId';

type PermitReq = Message.Permission.Request.Type;
type SuggestReq<T> = Message.Suggestion.Type<T>;
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
    this._uid = uuid();
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
      let errorTrigger = api.errorTrigger(uid);

      let permissionRequestStream = messageStream
        .map(v => v.flatMap(v1 => Message.Permission.Request.extract(v1)))
        .flatMap(v => this.onPermissionRequest(api, v))
        .shareReplay(1);

      let suggestionRequestStream = messageStream
        .map(v => v.flatMap(v1 => Message.Suggestion.extract(v1)))
        .flatMap(v => this.onSuggestionRequest(api, v))
        .shareReplay(1);

      errorTrigger.map(v => permissionRequestStream
        .mapNonNilOrEmpty(v1 => v1.error)
        .subscribe(v)
        .toBeDisposedBy(subscription));

      errorTrigger.map(v => suggestionRequestStream
        .mapNonNilOrEmpty(v1 => v1.error)
        .subscribe(v)
        .toBeDisposedBy(subscription));
    } catch (e) {
      throw e;
    }
  }

  /**
   * On permission request, we need to fetch the last accepted suggestion id
   * and compare it to the current one, then send either a granted or a nack
   * response.
   * @param {VoterAPI<T>} api VoterAPI instance.
   * @param {Try<PermitReq>} msg A Permission Request message.
   * @returns {Observable<Try<any>>} An Observable instance.
   */
  private onPermissionRequest = (api: VoterAPI<T>, msg: Try<PermitReq>) => {
    try {
      let request = msg.getOrThrow();
      let sender = request.senderId;
      let sid = request.suggestionId;
      let uid = this.uid;

      return api.getLastGrantedSuggestionId(uid)
        .flatMap((v): Observable<Message.Generic.Type<T>> => {
          /// If there was no last accepted suggestion id, proceed to grant
          /// permission. Otherwise, check if the last accepted id is logically
          /// less than the current suggestion id.
          if (v.map(v1 => SuggestionId.isLargerThan(sid, v1)).getOrElse(true)) {
            return api.storeLastGrantedSuggestionId(uid, sid)
              .map(v1 => v1.getOrThrow())
              .flatMap(() => api.getLastAcceptedData(uid))
              .map((v1): Message.Permission.Granted.Type<T> => ({
                suggestionId: sid, lastAccepted: v1,
              }))
              .map((v1): Message.Generic.Type<T> => ({
                type: Message.Case.PERMISSION_GRANTED, message: v1,
              }));
          } else {
            /// The use of getOrThrow here is purely out of convenience, because
            /// under no circumstances will it actually throw an error. This
            /// could certainly use some optimization at a later date.
            let nack: Message.Nack.Permission.Type = {
              currentSuggestionId: sid,
              lastAcceptedSuggestionId: v.getOrThrow(),
            };

            return Observable.of<Message.Generic.Type<T>>({
              type: Message.Case.NACK_PERMISSION,
              message: nack,
            });
          }
        })
        .flatMap(v => api.sendMessage(sender, v))
        .catchJustReturn(e => Try.failure<any>(e));
    } catch (e) {
      return Observable.of(Try.failure(e));
    }
  }

  private onSuggestionRequest = (_api: VoterAPI<T>, _message: Try<SuggestReq<T>>) => {
    return Observable.empty<Try<any>>();
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