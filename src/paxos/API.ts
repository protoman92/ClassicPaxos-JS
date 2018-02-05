import { Observable } from 'rxjs';
import { Numbers, Try } from 'javascriptutilities';
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

export namespace RetryHandler {
  /**
   * Represents the APIs used to coordinate retry attempts.
   */
  export interface Type {
    /**
     * Listen to retry events and coordinate attempts using certain strategies.
     * @param {Observable<any>} trigger An Observable instance.
     * @returns {Observable<any>} An Observable instance.
     */
    coordinateRetries(trigger: Observable<any>): Observable<any>;
  }

  export namespace Noop {
    /**
     * No-op retry coordinator that does nothing.
     * @implements {Type} Type implementation.
     */
    export class Self implements Type {
      public coordinateRetries = (trigger: Observable<any>) => trigger;
    }
  }

  export namespace ExponentialBackoff {
    /**
     * Coordinate retries using exponential backoff strategy.
     * @implements {Type} Type implementation.
     */
    export class Self implements Type {
      private readonly initialDelay: number;
      private readonly multiple: number;

      public constructor(initialDelay: number, multiple: number) {
        this.initialDelay = initialDelay;
        this.multiple = multiple;
      }

      public coordinateRetries = (trigger: Observable<any>): Observable<any> => {
        let initialDelay = this.initialDelay;
        let multiple = this.multiple;

        return trigger
          .scan((acc, _v): number => acc + 1, 0)
          .map(v => initialDelay * (multiple ** v))
          .concatMap(v => Observable.timer(v))
          .map(() => undefined);
      }
    }
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
     * @param {string} uid The voter's id.
     * @returns {Observable<Try<SId.Type>>} An Observable instance.
     */
    getLastGrantedSuggestionId(uid: string): Observable<Try<SId.Type>>;

    /**
     * Store the last accepted suggestion id in stable media.
     * @param {string} uid The voter's id.
     * @param {SId.Type} obj A suggestion id instance.
     * @returns {Observable<Try<any>>} An Observable instance.
     */
    storeLastGrantedSuggestionId(uid: string, obj: SId.Type): Observable<Try<any>>;

    /**
     * Retrieve the last accepted data.
     * @param {string} uid The voter's id.
     * @returns {Observable<Try<Message.LastAccepted.Type<T>>>} An Observable
     * instance.
     */
    getLastAcceptedData(uid: string): Observable<Try<Message.LastAccepted.Type<T>>>;
  }
}

export namespace Node {
  /**
   * Represents the APIs usable by a Node. This encompasses all APIs available
   * to arbiters, suggesters and voters.
   * @extends {Suggester.Type<T>} Suggester API extension.
   * @extends {Voter.Type<T>} Voter API extension.
   * @template T Generics parameter.
   */
  export interface Type<T> extends Suggester.Type<T>, Voter.Type<T> {}
}