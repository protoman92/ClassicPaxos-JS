import { Try, Types } from 'javascriptutilities';
import * as SuggestionId from './SuggestionId';

/**
 * Extract a message type from a generic message. This operation may fail if
 * the message type does not match.
 * @template T The message type.
 * @template R Generic parameter.
 * @param {Generic.Type<R>} msg A Generic message.
 * @param {Case} type A Case instance.
 * @param {...string[]} keys The property keys to check for type conformance.
 * @returns {Try<T>} A Try instance.
 */
function extractMessage<T, R>(msg: Generic.Type<R>, type: Case, ...keys: string[]): Try<T> {
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
    readonly suggestionId: SuggestionId.Type;
    readonly value: T;
  }

  /**
   * Find the logically highest suggestion id.
   * @template T Generics parameter.
   * @param {...Type[]} accepted Varargs of last accepted data.
   * @returns {Try<Type<T>>} A Try instance.
   */
  export function highestSuggestionId<T>(...accepted: Type<T>[]): Try<Type<T>> {
    return Try.unwrap(accepted.reduce((v1, v2) =>
      SuggestionId.isLargerThan(v1.suggestionId, v2.suggestionId) ? v1 : v2
    ));
  }
}

export namespace Permission {
  export namespace Request {
    let keys = ['senderId', 'suggestionId'];

    /**
     * Represents a permission request message.
     */
    export interface Type {
      readonly senderId: string;
      readonly suggestionId: SuggestionId.Type;
    }

    export function extract<T>(msg: Generic.Type<T>): Try<Type> {
      return extractMessage<Type, T>(msg, Case.PERMISSION_REQUEST, ...keys);
    }

    export function count<T>(...messages: Generic.Type<T>[]): number {
      return countMessage(Case.PERMISSION_REQUEST, ...messages);
    }
  }

  export namespace Granted {
    let keys = ['suggestionId', 'lastAccepted'];

    /**
     * Represents a permission granted message.
     * @template T Generic parameter.
     */
    export interface Type<T> {
      readonly suggestionId: SuggestionId.Type;
      readonly lastAccepted: Try<LastAccepted.Type<T>>;
    }

    export function extract<T>(msg: Generic.Type<T>): Try<Type<T>> {
      return extractMessage<Type<T>, T>(msg, Case.PERMISSION_GRANTED, ...keys);
    }

    export function count<T>(...messages: Generic.Type<T>[]): number {
      return countMessage(Case.PERMISSION_GRANTED, ...messages);
    }
  }
}

export namespace Suggestion {
  let keys = ['suggestionId', 'value'];

  /**
   * Represents a suggestion message.
   * @template T Generic parameter.
   */
  export interface Type<T> {
    readonly suggestionId: SuggestionId.Type;
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
  /**
   * Represents an acceptance message.
   */
  export interface Type {
    suggestionId: SuggestionId.Type;
  }
}

export namespace Nack {
  export namespace Permission {
    /**
     * Represents a Nack message for a permission request.
     */
    export interface Type {
      readonly currentSuggestionId: SuggestionId.Type;
      readonly lastAcceptedSuggestionId: SuggestionId.Type;
    }

    export function count<T>(...messages: Generic.Type<T>[]): number {
      return countMessage(Case.NACK_PERMISSION, ...messages);
    }
  }
}

/**
 * Represents the different types of messages.
 */
export enum Case {
  PERMISSION_REQUEST = 'PERMISSION_REQUEST',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  SUGGESTION = 'SUGGESTION',
  ACCEPTANCE = 'ACCEPTANCE',
  NACK_PERMISSION = 'NACK',
}

/// Represents an ambiguous message.
export type Ambiguous<T> =
  Permission.Request.Type |
  Permission.Granted.Type<T> |
  Suggestion.Type<T> |
  Acceptance.Type |
  Nack.Permission.Type;

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