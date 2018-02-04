import { Observable } from 'rxjs';
import * as uuid from 'uuid';
import { Nullable, Try } from 'javascriptutilities';
import * as API from './API';
import * as Message from './Message';
import { Participant } from './Role';

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
  suggesterMessageStream(): Observable<Try<Message.Generic.Type<T>>>;
}

/**
 * Represents a suggester.
 * @implements {Type<T>} Type implementation.
 * @template T Generic parameter.
 */
class Self<T> implements Type<T> {
  public _uid: string;
  public _api: Nullable<API.Suggester.Type<T>>;

  public get uid(): string {
    return this._uid;
  }

  public get api(): Try<API.Suggester.Type<T>> {
    return Try.unwrap(this._api, 'API for suggester not available');
  }

  public constructor() {
    this._uid = uuid();
  }

  public suggesterMessageStream = (): Observable<Try<Message.Generic.Type<T>>> => {
    try {
      let api = this.api.getOrThrow();

      return api.receiveMessages(this.uid)
        .filter(v => v.map(v1 => hasMessageType(v1.type)).getOrElse(false));
    } catch (e) {
      return Observable.of(Try.failure(e));
    }
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
   * Set the suggester API.
   * @param {Nullable<API.Suggester.Type<T>>} api A suggester API instance.
   * @returns {this} The current Builder instance.
   */
  public withAPI = (api: Nullable<API.Suggester.Type<T>>): this => {
    this.suggester._api = api;
    return this;
  }

  public build = (): Type<T> => this.suggester;
}