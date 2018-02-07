import { Observable, Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { Nullable, Try } from 'javascriptutilities';
import * as API from './API';
import * as Message from './Message';
import { Participant } from './Role';
import * as SID from './SuggestionId';

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
export let supportsMessageType = (type: Message.Case): boolean => {
  switch (type) {
    case Message.Case.PERMIT_REQUEST:
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

      return api.receiveMessage(this.uid).filter(v => {
        return v.map(v1 => supportsMessageType(v1.type)).getOrElse(false);
      });
    } catch (e) {
      return Observable.of(Try.failure(e));
    }
  }

  public setupBindings = (): void => {
    try {
      let api = this.api.getOrThrow();
      let uid = this.uid;
      let subscription = this.subscription;
      let messageStream = api.receiveMessage(uid).shareReplay(1);

      Observable
        .merge<Error>(
          messageStream.mapNonNilOrEmpty(v => v.error),

          messageStream
            .map(v => v.flatMap(v1 => Message.Permission.Request.extract(v1)))
            .mapNonNilOrEmpty(v => v)
            .flatMap(v => this.onPermissionRequest(api, v))
            .mapNonNilOrEmpty(v => v.error),

          messageStream
            .map(v => v.flatMap(v1 => Message.Suggestion.extract(v1)))
            .mapNonNilOrEmpty(v => v)
            .flatMap(v => this.onSuggestionRequest(api, v))
            .mapNonNilOrEmpty(v => v.error),
        )
        .flatMap(e => api.sendErrorStack(uid, e))
        .subscribe()
        .toBeDisposedBy(subscription);
    } catch (e) {
      throw e;
    }
  }

  /**
   * On permission request, we need to fetch the last accepted suggestion id
   * and compare it to the current one, then send either a granted or a nack
   * response.
   * @param {VoterAPI<T>} api VoterAPI instance.
   * @param {PermitReq} msg A Permission Request message.
   * @returns {Observable<Try<any>>} An Observable instance.
   */
  private onPermissionRequest = (api: VoterAPI<T>, msg: PermitReq) => {
    let sender = msg.senderId;
    let sid = msg.sid;
    let uid = this.uid;

    return api.getLastGrantedSuggestionId(uid)
      .flatMap((v): Observable<Message.Generic.Type<T>> => {
        /// If there was no last granted suggestion id, proceed to grant
        /// permission. Otherwise, check if the last granted id is logically
        /// less than the current suggestion id.
        if (v.map(v1 => SID.higherThan(sid, v1)).getOrElse(true)) {
          return api.storeLastGrantedSuggestionId(uid, sid)
            .map(v1 => v1.getOrThrow())
            .flatMap(() => api.getLastAcceptedData(uid))
            .map((v1): Message.Permission.Granted.Type<T> => {
              return { sid: sid, lastAccepted: v1 };
            })
            .map(v1 => ({ type: Message.Case.PERMIT_GRANTED, message: v1 }));
        } else {
          /// The use of getOrThrow here is purely out of convenience, because
          /// under no circumstances will it actually throw an error. This
          /// could certainly use some optimization at a later date.
          let lastGrantedSID = v.getOrThrow();
          let message: Message.Nack.Type = { currentSID: sid, lastGrantedSID };
          let type = Message.Case.NACK;
          return Observable.of<Message.Generic.Type<T>>({ type, message });
        }
      })
      .flatMap(v => api.sendMessage(sender, v))
      .catchJustReturn(e => Try.failure<any>(e));
  }

  private onSuggestionRequest = (api: VoterAPI<T>, msg: SuggestReq<T>) => {
    let sender = msg.senderId;
    let sid = msg.sid;
    let value = msg.value;
    let uid = this.uid;

    return api.getLastGrantedSuggestionId(uid)
      .flatMap((v): Observable<Try<any>> => {
        /// Check if the last granted id is logically less than the current
        /// suggestion id. If it is, accept the suggestion and broadcast the
        /// accepted value to all arbiters. Otherwise, send NACK to respective
        /// suggester.
        if (v.map(v1 => SID.higherThan(sid, v1)).getOrElse(true)) {
          return api.storeLastAcceptedData(uid, { sid, value })
            .map(v1 => v1.getOrThrow())
            .map((): Message.Acceptance.Type<T> => ({ sid, value }))
            .map((v1): Message.Generic.Type<T> => {
              return { type: Message.Case.ACCEPTANCE, message: v1 };
            })
            .flatMap(v1 => api.broadcastMessage(v1));
        } else {
          let lastGrantedSID = v.getOrThrow();
          let message: Message.Nack.Type = { currentSID: sid, lastGrantedSID };
          let type = Message.Case.NACK;
          let generic: Message.Generic.Type<T> = { type, message };
          return api.sendMessage(sender, generic);
        }
      })
      .catchJustReturn(e => Try.failure<any>(e));
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