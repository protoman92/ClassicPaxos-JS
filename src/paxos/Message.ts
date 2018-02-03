import { Try } from 'javascriptutilities';
import * as SuggestionId from './SuggestionId';

export namespace LastAccepted {
  /**
   * Represents the accepted suggestionId and value.
   * @template T Generics parameter.
   */
  export interface Type<T> {
    readonly suggestionId: SuggestionId.Type;
    readonly value: T;
  }
}

export namespace Permission {
  export namespace Request {
    /**
     * Represents a permission request message.
     */
    export interface Type {
      readonly suggestionId: SuggestionId.Type;
    }
  }

  export namespace Granted {
    /**
     * Represents a permission granted message.
     * @template T Generics parameter.
     */
    export interface Type<T> {
      readonly suggestionId: SuggestionId.Type;
      readonly lastAccepted: Try<LastAccepted.Type<T>>;
    }
  }
}

export namespace Suggestion {
  /**
   * Represents a suggestion message.
   * @template T Generics parameter.
   */
  export interface Type<T> {
    readonly suggestionId: SuggestionId.Type;
    readonly value: T;
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
  /**
   * Represents a NACK message.
   */
  export interface Type {
    readonly suggestionId: SuggestionId.Type;
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
  NACK = 'NACK',
}

/// Represents an ambiguous message.
export type Ambiguous<T> =
  Permission.Request.Type |
  Permission.Granted.Type<T> |
  Suggestion.Type<T> |
  Acceptance.Type |
  Nack.Type;

/**
 * Represents an ambiguous message.
 * @template T Generics parameter.
 */
export interface Generic<T> {
  readonly messageType: Case;
  readonly message: Ambiguous<T>;
}