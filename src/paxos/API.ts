import { Observable } from 'rxjs';
import { Nullable, Numbers, Try } from 'javascriptutilities';
import * as Message from './Message';
import * as SId from './SuggestionId';

export namespace Participant {
  /**
   * Represents common APIs used by participants in a Paxos instance.
   * @template T Generic parameter.
   */
  export interface Type<T> {
    /**
     * Listen to message. For e.g., this can be a remote persistent connection.
     * @param {string} uid The participant's id.
     * @returns {Observable<Try<Message.Generic.Type<T>>>} An Observable instance.
     */
    receiveMessage(uid: string): Observable<Try<Message.Generic.Type<T>>>;

    /**
     * Send a message to a target.
     * @param {string} target A string value denoting the target's uid.
     * @param {Message.Generic.Type<T>} msg A generic message instance.
     * @returns {Observable<Try<any>>} An Observable instance.
     */
    sendMessage(target: string, msg: Message.Generic.Type<T>): Observable<Try<any>>;

    /**
     * Broadcast a message to all listeners. This is useful, for e.g., when a
     * suggester tries to send a permission/suggestion request - this way, the
     * suggester does not need to know who the voters are.
     * @param {Message.Generic.Type<T>} msg A generic message instance.
     * @returns {Observable<Try<any>>} An Observable instance.
     */
    broadcastMessage(msg: Message.Generic.Type<T>): Observable<Try<any>>;

    /**
     * The error stream that relays errors for a particular participant.
     * @param {string} uid The participant's uid.
     * @param {Error} error An Error instance.
     * @returns {Observable<Try<Error>>} An Observable instance.
     */
    sendErrorStack(uid: string, error: Error): Observable<Try<Error>>;
  }
}

export namespace MajorityCalculator {
  /**
   * Represents the APIs to decide the majority count from a quorum size. By
   * default, classical Paxos requires only a simple majority (i.e. > 50%). If
   * this is not defined, use that rule.
   */
  export interface Type {
    calculateMajority?(quorumSize: number): number;
  }

  /**
   * If no majority calculation mechanism is provided, use the default simple
   * majority.
   * @param {number} quorumSize A number value.
   * @returns {number} A number value.
   */
  export let calculateDefault = (quorumSize: number): number => {
    return (Numbers.isOdd(quorumSize) ? quorumSize - 1 : quorumSize) / 2 + 1;
  };
}

export namespace RetryHandler {
  /**
   * Represents the APIs used to coordinate retry attempts.
   */
  export interface Type {
    /**
     * Listen to retry events and coordinate attempts using certain strategies.
     * @template T Generic parameter.
     * @param {Observable<T>} trigger An Observable instance.
     * @returns {Observable<T>} An Observable instance.
     */
    coordinateRetries<T>(trigger: Observable<T>): Observable<T>;
  }

  export namespace Noop {
    /**
     * No-op retry coordinator that does nothing.
     * @implements {Type} Type implementation.
     */
    export class Self implements Type {
      public coordinateRetries<T>(trigger: Observable<T>) {
        return trigger;
      }
    }
  }

  export namespace CustomBackoff {
    export type DelayMapper = (initial: number, iteration: number) => number;
    /**
     * Coordinate retries using a custom backoff strategy.
     * @implements {Type} Type implementation.
     */
    export class Self implements Type {
      private readonly initialDelay: number;
      private readonly mapper: DelayMapper;

      public constructor(initialDelay: number, mapper: DelayMapper) {
        this.initialDelay = initialDelay;
        this.mapper = mapper;
      }

      /**
       * Delay emission with custom intervals.
       * @template T Generic parameter.
       * @param {Observable<T>} trigger Retry trigger.
       * @returns {Observable<T>} An Observable instance.
       */
      public coordinateRetries<T>(trigger: Observable<T>): Observable<T> {
        interface ScannedResult {
          number: number;
          value: Nullable<T>;
        }

        let t0 = this.initialDelay;
        let mapper = this.mapper;
        let initial: ScannedResult = { number: -1, value: undefined };

        /// The only reason scanned result has Nullable<T> as value is because
        /// of the initial scan seed. Since we will be filtering out that seed
        /// anyway, it is guaranteed that the resulting value will be exactly
        /// as emitted by the trigger, so we can do a force cast at the end of
        /// the sequence.
        return trigger
          .scan((acc, v) => ({ number: acc.number + 1, value: v }), initial)
          .filter(v => v.number > -1)
          .map(v => ({ delay: mapper(t0, v.number), value: v.value }))
          .concatMap(v => Observable.timer(v.delay).map(() => v.value))
          .map(v => <T>v);
      }
    }
  }

  export namespace IncrementalBackoff {
    /**
     * Coordinate retries using incremental backoff strategy.
     * @extends {CustomBackoff.Self} CustomBackoff extension.
     */
    export class Self extends CustomBackoff.Self {
      public constructor(initialDelay: number, multiple: number) {
        super(initialDelay, (a, b) => a * (multiple ** b));
      }
    }
  }

  export namespace ExponentialBackoff {
    /**
     * Coordinate retries using exponential backoff strategy.
     * @extends {CustomBackoff.Self} CustomBackoff extension.
     */
    export class Self extends CustomBackoff.Self {
      public constructor() {
        super(0, (_a, b) => Math.pow(2, b) * 100);
      }
    }
  }
}

export namespace Arbiter {
  /**
   * Represents the APIs used by an arbiter.
   * @extends {Participant.Type<T>} Participant extension.
   * @extends {MajorityCalculator.Type} Majority calculator extension.
   * @template T Generic parameter.
   */
  export interface Type<T> extends Participant.Type<T>, MajorityCalculator.Type {
    /**
     * Convert a value to string for a group operation.
     * @param {T} value A T instance.
     * @returns {string} A string value.
     */
    stringifyValue(value: T): string;

    /**
     * Declare a final value and conclude Paxos.
     * @param {T} value A T instance.
     * @returns {Observable<Try<any>>} An Observable instance.
     */
    declareFinalValue(value: T): Observable<Try<any>>;
  }
}

export namespace Suggester {
  /**
   * Represents the APIs used by a suggester.
   * @extends {Participant.Type<T>} Participant extension.
   * @extends {MajorityCalculator.Type} Majority calculator extension.
   * @template T Generics parameter.
   */
  export interface Type<T> extends Participant.Type<T>, MajorityCalculator.Type {
    /**
     * Get the first suggestion value that will be used if there has not been
     * any accepted value yet.
     * @param {string} uid The suggester's uid.
     * @returns {Observable<Try<T>>} An Observable instance.
     */
    getFirstSuggestionValue(uid: string): Observable<Try<T>>;
  }
}

export namespace Voter {
  /**
   * Represents the APIs used by a voter.
   * @extends {Participant.Type<T>} Participant extension.
   */
  export interface Type<T> extends Participant.Type<T> {
    /**
     * Retrieve the suggestion id of the last granted permission request. This
     * will be used by the voter to process new permission requests.
     * @param {string} uid The voter's uid.
     * @returns {Observable<Try<SId.Type>>} An Observable instance.
     */
    getLastGrantedSuggestionId(uid: string): Observable<Try<SId.Type>>;

    /**
     * Store the last accepted suggestion id in stable media.
     * @param {string} uid The voter's uid.
     * @param {SId.Type} obj A suggestion id instance.
     * @returns {Observable<Try<any>>} An Observable instance.
     */
    storeLastGrantedSuggestionId(uid: string, obj: SId.Type): Observable<Try<any>>;

    /**
     * Retrieve the last accepted data.
     * @param {string} uid The voter's uid.
     * @returns {Observable<Try<Message.LastAccepted.Type<T>>>} An Observable
     * instance.
     */
    getLastAcceptedData(uid: string): Observable<Try<Message.LastAccepted.Type<T>>>;

    /**
     * Store that last accepted data.
     * @param {string} uid The voter's uid.
     * @param {Message.LastAccepted.Type<T>} obj A LastAccepted instance.
     * @returns {Observable<Try<any>>} An Observable instance.
     */
    storeLastAcceptedData(uid: string, obj: Message.LastAccepted.Type<T>): Observable<Try<any>>;
  }
}

export namespace Node {
  /**
   * Represents the APIs usable by a Node. This encompasses all APIs available
   * to arbiters, suggesters and voters.
   * @extends {Arbiter.Type<T>} Arbiter API extension.
   * @extends {Suggester.Type<T>} Suggester API extension.
   * @extends {Voter.Type<T>} Voter API extension.
   * @template T Generics parameter.
   */
  export interface Type<T> extends Arbiter.Type<T>, Suggester.Type<T>, Voter.Type<T> {}
}