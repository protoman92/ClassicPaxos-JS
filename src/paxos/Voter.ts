import { Observable, Subscription } from 'rxjs';
import { BuildableType, BuilderType, Nullable, Try } from 'javascriptutilities';
import * as API from './API';
import * as Message from './Message';
import { Participant } from './Role';

type VoterAPI<T> = API.Voter.Type<T>;

export function builder<T>(): Builder<T> {
  return new Builder();
}

/**
 * Represents a voter. The role of voter is a purely reactive role, because it
 * only involves listening to messages and responding in kind. Basically, each
 * voter has the following responsibilities:
 * - Receive persmission requests: Based on the algorithm's requirements, a
 * voter then either sends a permission granted or a nack response.
 * - Receive suggestion requests: Based on the algorithm's requirements, a voter
 * then either sends an acceptance request or a nack response.
 * @extends {BuildableType<Builder<T>>} BuildableType extension.
 * @extends {Participant.Type} Participant extension.
 * @template T Generic parameter.
 */
export interface Type<T> extends BuildableType<Builder<T>>, Participant.Type {
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

  public builder = (): Builder<T> => builder();
  public cloneBuilder = (): Builder<T> => this.builder().withBuildable(this);

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
          if (v.isLaterThan(suggestion)) {
            return api.storeLastGrantedSuggestionId(uid, v)
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

            return Observable.of({ type: Message.Case.NACK, message: nack });
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
 * @implements {BuilderType<Type<T>>} BuilderType extension.
 * @template T Generic parameter.
 */
export class Builder<T> implements BuilderType<Type<T>> {
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

  public withBuildable = (buildable: Nullable<Type<T>>): this => {
    if (buildable !== undefined && buildable !== null) {
      return this;
    } else {
      return this;
    }
  }

  public build = (): Type<T> => {
    this.voter.setupBindings();
    return this.voter;
  }
}