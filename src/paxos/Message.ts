import { Try, Types } from 'javascriptutilities';
import * as SID from './SuggestionId';

/**
 * Extract a message type from a generic message. This operation may fail if
 * the message type does not match.
 * @template T The message type.
 * @template R Generic parameter.
 * @param {Generic.Type<R>} msg A Generic message.
 * @param {Case} type A Case instance.
 * @param {...(keyof T)[]} keys The property keys to check for type conformance.
 * @returns {Try<T>} A Try instance.
 */
function extractMessage<T, R>(msg: Generic.Type<R>, type: Case, ...keys: (keyof T)[]): Try<T> {
  // console.log(msg.type, keys);
  switch (msg.type) {
    case type:
      let message = msg.message;

      if (Types.isInstance<T>(message, ...keys)) {
        return Try.success(message);
      }

      break;

    default:
      break;
    }

  return Try.failure(`Incorrect message type: ${JSON.stringify(msg)}`);
}

/**
 * Count the number of times a message type is found in an Array of messages.
 * @param {Case} type A Case instance.
 * @param {...Generic.Type<T>[]} messages An Array of messages.
 * @returns {number} A number value.
 */
function countMessage<T>(type: Case, ...messages: Generic.Type<T>[]): number {
  return messages.filter(v => v.type === type).length;
}

export namespace LastAccepted {
  /**
   * Represents the accepted suggestionId and value.
   * @template T Generic parameter.
   */
  export interface Type<T> {
    readonly sid: SID.Type;
    readonly value: T;
  }
}

export namespace Permission {
  export namespace Request {
    let keys: (keyof Type)[] = ['senderId', 'sid'];

    /**
     * Represents a permission request message.
     */
    export interface Type {
      readonly senderId: string;
      readonly sid: SID.Type;
    }

    export function extract<T>(msg: Generic.Type<T>): Try<Type> {
      return extractMessage<Type, T>(msg, Case.PERMIT_REQUEST, ...keys);
    }

    export function count<T>(...messages: Generic.Type<T>[]): number {
      return countMessage(Case.PERMIT_REQUEST, ...messages);
    }
  }

  export namespace Granted {
    let keys: (keyof Type<any>)[] = ['sid', 'lastAccepted'];

    /**
     * Represents a permission granted message.
     * @template T Generic parameter.
     */
    export interface Type<T> {
      readonly sid: SID.Type;
      readonly lastAccepted: Try<LastAccepted.Type<T>>;
    }

    export function extract<T>(msg: Generic.Type<T>): Try<Type<T>> {
      return extractMessage<Type<T>, T>(msg, Case.PERMIT_GRANTED, ...keys);
    }

    export function count<T>(...messages: Generic.Type<T>[]): number {
      return countMessage(Case.PERMIT_GRANTED, ...messages);
    }
  }
}

export namespace Suggestion {
  let keys: (keyof Type<any>)[] = ['senderId', 'sid', 'value'];

  /**
   * Represents a suggestion message.
   * @template T Generic parameter.
   */
  export interface Type<T> {
    readonly senderId: string;
    readonly sid: SID.Type;
    readonly value: T;
  }

  export function extract<T>(msg: Generic.Type<T>): Try<Type<T>> {
    return extractMessage<Type<T>, T>(msg, Case.SUGGESTION, ...keys);
  }

  export function count<T>(...messages: Generic.Type<T>[]): number {
    return countMessage(Case.SUGGESTION, ...messages);
  }
}

export namespace Acceptance {
  let keys: (keyof Type<any>)[] = ['sid', 'value'];

  /**
   * Represents an acceptance message.
   */
  export interface Type<T> {
    sid: SID.Type;
    value: T;
  }

  export function extract<T>(msg: Generic.Type<T>): Try<Type<T>> {
    return extractMessage<Type<T>, T>(msg, Case.ACCEPTANCE, ...keys);
  }
}

export namespace Success {
  let keys: (keyof Type<any>)[] = ['value'];

  /**
   * Represents a success message that will be sent to all suggesters once a
   * final value is declared.
   * @template T Generic parameter.
   */
  export interface Type<T> {
    value: T;
  }

  export function extract<T>(msg: Generic.Type<T>): Try<Type<T>> {
    return extractMessage<Type<T>, T>(msg, Case.SUCCESS, ...keys);
  }
}

export namespace Nack {
  let keys: (keyof Type)[] = ['currentSID', 'lastGrantedSID'];

  /**
   * Represents a Nack message for a permission request.
   */
  export interface Type {
    readonly currentSID: SID.Type;
    readonly lastGrantedSID: SID.Type;
  }

  export function count<T>(...messages: Generic.Type<T>[]): number {
    return countMessage(Case.NACK, ...messages);
  }

  export function extract<T>(message: Generic.Type<T>): Try<Type> {
    return extractMessage<Type, T>(message, Case.NACK, ...keys);
  }
}

/**
 * Represents the different types of messages.
 */
export enum Case {
  PERMIT_REQUEST = 'PERMISSION_REQUEST',
  PERMIT_GRANTED = 'PERMISSION_GRANTED',
  SUGGESTION = 'SUGGESTION',
  ACCEPTANCE = 'ACCEPTANCE',
  SUCCESS = 'SUCCESS',
  NACK = 'NACK',
}

/// Represents an ambiguous message.
export type Ambiguous<T> =
  Permission.Request.Type |
  Permission.Granted.Type<T> |
  Suggestion.Type<T> |
  Acceptance.Type<T> |
  Success.Type<T> |
  Nack.Type;

export namespace Generic {
  /**
   * Represents an ambiguous message.
   * @template T Generic parameter.
   */
  export interface Type<T> {
    readonly type: Case;
    readonly message: Ambiguous<T>;
  }
}