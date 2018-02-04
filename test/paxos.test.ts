import { Observable, Subject, Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { JSObject, Try } from 'javascriptutilities';

import {
  API,
  Arbiter,
  Instance,
  Message,
  Node,
  Suggester,
  SuggestionId,
  Voter,
} from './../src/paxos';

import {
  Ambiguous as AmbiguousMessage,
  LastAccepted,
  Permission,
  // Suggestion,
} from '../src/paxos/Message';

type Value = number;

function createNode<T>(uid: string, api: API.Node.Type<T>): Node.Type<T> {
  let arbiter: Arbiter.Type = { uid };
  let suggester: Suggester.Type = { uid };

  let voter = Voter.builder()
    .withUID(uid)
    .withAPI(api)
    .build();

  return Node.builder()
    .withUID(uid)
    .withArbiter(arbiter)
    .withSuggester(suggester)
    .withVoter(voter)
    .build();
}

class PaxosAPI<T> implements API.Node.Type<T> {
  public permissionRequests: JSObject<Subject<Message.Permission.Request.Type>>;
  public suggestionRequests: JSObject<Subject<Message.Suggestion.Type<T>>>;
  public nackRequestResponse: JSObject<Subject<Message.Nack.Permission.Type>>;
  public lastGrantedSuggestionId: JSObject<SuggestionId.Type>;
  public lastAcceptedData: JSObject<LastAccepted.Type<T>>;

  public constructor() {
    this.permissionRequests = {};
    this.suggestionRequests = {};
    this.nackRequestResponse = {};
    this.lastGrantedSuggestionId = {};
    this.lastAcceptedData = {};
  }

  public registerSuggesters(...suggesters: string[]): void {
    let newNackRequestResponse = suggesters
      .map(v => ({ [v]: new Subject<Message.Nack.Permission.Type>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    this.nackRequestResponse = Object.assign({},
      this.nackRequestResponse,
      newNackRequestResponse);
  }

  public registerVoters(...voters: string[]): void {
    let newPermissionRequests = voters
      .map(v => ({ [v]: new Subject<Message.Permission.Request.Type>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    let newSuggestionRequests = voters
      .map(v => ({ [v]: new Subject<Message.Suggestion.Type<T>>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    this.permissionRequests = Object.assign({},
      this.permissionRequests,
      newPermissionRequests);

    this.suggestionRequests = Object.assign({},
      this.suggestionRequests,
      newSuggestionRequests);
  }

  public receiveMessages(uid: string): Observable<Try<Message.Generic.Type<T>>> {
    return Observable.merge<Try<Message.Generic.Type<T>>>(
      Try.unwrap(this.permissionRequests[uid])
        .map(v => v.map((v1): Message.Generic.Type<T> => ({
          type: Message.Case.PERMISSION_REQUEST,
          message: v1 as AmbiguousMessage<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.suggestionRequests[uid])
        .map(v => v.map((v1): Message.Generic.Type<T> => ({
            type: Message.Case.SUGGESTION,
            message: v1 as AmbiguousMessage<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.nackRequestResponse[uid])
        .map(v => v.map((v1): Message.Generic.Type<T> => ({
          type: Message.Case.NACK_PERMISSION,
          message: v1 as AmbiguousMessage<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),
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

      case Message.Case.NACK_PERMISSION:
        let permissionNack = <Message.Nack.Permission.Type>msg.message;
        Try.unwrap(this.nackRequestResponse[uid]).map(v => v.next(permissionNack));
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

describe('Voter should be implemented correctly', () => {
  let api: PaxosAPI<Value>;
  // let suggester: Suggester.Type;
  let suggesterUid: string;
  let voter: Voter.Type<Value>;
  let voterUid: string;
  let subscription: Subscription;

  beforeEach(() => {
    api = new PaxosAPI();
    suggesterUid = uuid();
    voterUid = uuid();
    api.registerSuggesters(suggesterUid);
    api.registerVoters(voterUid);
    // suggester = createNode(suggesterUid, api);
    voter = createNode(voterUid, api);
    subscription = new Subscription();
  });

  it.only('Voter receiving lower version - should send nack', () => {
    /// Setup
    let messages: Message.Generic.Type<Value>[] = [];
    let sid1: SuggestionId.Type = { id: '1000', integer: 1000 };
    let sid2: SuggestionId.Type = { id: '999', integer: 999 };

    let req1: Permission.Request.Type = {
      senderId: suggesterUid,
      suggestionId: sid1,
    };

    let req2: Permission.Request.Type = {
      senderId: suggesterUid,
      suggestionId: sid2,
    };

    api.receiveMessages(suggesterUid)
      .mapNonNilOrEmpty(v => v)
      .doOnNext(v => messages.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);

    voter.voterMessageStream()
      .logNext()
      .subscribe()
      .toBeDisposedBy(subscription);

    let subject = Try.unwrap(api.permissionRequests[voterUid]).getOrThrow();

    subject.next(req1);

    /// When
    subject.next(req2);

    /// Then
    console.log(messages);
  });
});

describe('Paxos instance should be implemented correctly', () => {
  let api: PaxosAPI<Value>;

  beforeEach(() => api = new PaxosAPI());

  it('Paxos instance should be implemented correctly', () => {
    console.log(Instance.builder());
  });
});