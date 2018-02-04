import { Observable, Subject } from 'rxjs';
import { JSObject, Try } from 'javascriptutilities';
import { Paxos } from './../src';
import { Message, SuggestionId } from './../src/paxos';

import {
  Ambiguous as AmbiguousMessage,
  LastAccepted,
  // Suggestion,
} from '../src/paxos/Message';

type PermissionRequest = Paxos.Message.Permission.Request.Type;
type SuggestionRequest<T> = Paxos.Message.Suggestion.Type<T>;

class API<T> implements Paxos.API.Voter.Type<T> {
  public permissionRequests: JSObject<Subject<PermissionRequest>>;
  public suggestionRequests: JSObject<Subject<SuggestionRequest<T>>>;
  public lastGrantedSuggestionId: JSObject<SuggestionId.Type>;
  public lastAcceptedData: JSObject<LastAccepted.Type<T>>;

  public constructor() {
    this.permissionRequests = {};
    this.suggestionRequests = {};
    this.lastGrantedSuggestionId = {};
    this.lastAcceptedData = {};
  }

  public receiveMessages(uid: string): Observable<Try<Message.Generic.Type<T>>> {
    return Observable.merge<Try<Message.Generic.Type<T>>>(
      Try.unwrap(this.permissionRequests[uid]).getOrThrow()
        .map((v): Message.Generic.Type<T> => ({
          type: Message.Case.PERMISSION_REQUEST,
          message: v as AmbiguousMessage<T>,
        }))
        .map(v => Try.success(v)),

      Try.unwrap(this.suggestionRequests[uid]).getOrThrow()
        .map((v): Message.Generic.Type<T> => ({
          type: Message.Case.SUGGESTION,
          message: v as AmbiguousMessage<T>,
        }))
        .map(v => Try.success(v)),
    );
  }

  public sendMessage(uid: string, msg: Message.Generic.Type<T>): Observable<Try<any>> {
    switch (msg.type) {
      case Message.Case.PERMISSION_REQUEST:
        let pRequest = <Message.Permission.Request.Type>msg.message;
        Try.unwrap(this.permissionRequests[uid]).map(v => v.next(pRequest));
        break;

      case Message.Case.SUGGESTION:
        let suggestion = <Message.Suggestion.Type<T>>msg.message;
        Try.unwrap(this.suggestionRequests[uid]).map(v => v.next(suggestion));
        break;

      default:
        return Observable.of(Try.failure(`Unhandled message type: ${msg}`));
    }

    return Observable.of(Try.success(undefined));
  }

  /// Voter API.
  public getLastGrantedSuggestionId(uid: string): Observable<Try<SuggestionId.Type>> {
    return Observable.of(Try.unwrap(this.lastGrantedSuggestionId[uid]));
  }

  public storeLastGrantedSuggestionId(uid: string, sid: SuggestionId.Type): Observable<Try<any>> {
    this.lastGrantedSuggestionId[uid] = sid;
    return Observable.of(Try.success(undefined));
  }

  public getLastAcceptedData(uid: string): Observable<Try<LastAccepted.Type<T>>> {
    return Observable.of(Try.unwrap(this.lastAcceptedData[uid]));
  }
}

describe('Paxos instance should be implemented correctly', () => {
  let api: API<number>;

  beforeEach(() => api = new API());

  it('Paxos instance should be implemented correctly', () => {
    console.log(Paxos.Instance.builder());
  });
});