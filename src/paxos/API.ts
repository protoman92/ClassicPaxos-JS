import { Observable } from 'rxjs';
import { Try } from 'javascriptutilities';
import * as SuggestionId from './SuggestionId';
import { LastAccepted, Permission, Nack } from './Message';

export namespace Voter {
  /**
   * Represents the APIs used by a voter.
   */
  export interface Type<T> {
    grantPermission(message: Try<Permission.Granted.Type<T>>): Observable<Try<void>>;
    sendNack(message: Try<Nack.Type>): Observable<Try<void>>;
    storeLastGrantedSuggestionId(obj: Try<SuggestionId.Type>): Observable<Try<void>>;
    storeLastAcceptedData(obj: Try<LastAccepted.Type<T>>): Observable<Try<void>>;
    retrieveLastGrantedSuggestionId<P>(prev: Try<P>): Observable<Try<SuggestionId.Type>>;
    retrieveLastAcceptedData<P>(prev: Try<P>): Observable<Try<LastAccepted.Type<T>>>;
  }
}