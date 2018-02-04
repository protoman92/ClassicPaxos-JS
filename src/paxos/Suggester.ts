import { Observable } from 'rxjs';
import { Try } from 'javascriptutilities';
import { Participant } from './Role';

/**
 * Represents a suggester.
 * @extends {Participant.Type} Participant extension.
 */
export interface Type extends Participant.Type {
  requestPermission<P>(prev: Try<P>): Observable<Try<any>>;
}