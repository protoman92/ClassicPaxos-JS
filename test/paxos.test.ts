import { Observable, Observer, Subject, Subscription } from 'rxjs';
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

  let suggester = Suggester.builder()
    .withUID(uid)
    .withAPI(api)
    .build();

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
  public permissionReq: JSObject<Subject<Message.Permission.Request.Type>>;
  public permissionGranted: JSObject<Subject<Message.Permission.Granted.Type<T>>>;
  public suggestionReq: JSObject<Subject<Message.Suggestion.Type<T>>>;
  public nackRequestRes: JSObject<Subject<Message.Nack.Permission.Type>>;
  public lastGrantedSuggestionId: JSObject<SuggestionId.Type>;
  public lastAcceptedData: JSObject<LastAccepted.Type<T>>;
  public errorSubject: JSObject<Subject<Error>>;

  public constructor() {
    this.permissionReq = {};
    this.permissionGranted = {};
    this.suggestionReq = {};
    this.nackRequestRes = {};
    this.lastGrantedSuggestionId = {};
    this.lastAcceptedData = {};
    this.errorSubject = {};
  }

  private registerParticipants(...participants: string[]): void {
    let newErrorTriggers = participants
      .map(v => ({ [v]: new Subject<Error>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    this.errorSubject = Object.assign({},
      this.errorSubject,
      newErrorTriggers);
  }

  public registerSuggesters(...suggesters: string[]): void {
    let newPermissionGranted = suggesters
      .map(v => ({ [v]: new Subject<Message.Permission.Granted.Type<T>>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    let newNackRequestResponse = suggesters
      .map(v => ({ [v]: new Subject<Message.Nack.Permission.Type>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    this.permissionGranted = Object.assign({},
      this.permissionGranted,
      newPermissionGranted);

    this.nackRequestRes = Object.assign({},
      this.nackRequestRes,
      newNackRequestResponse);

    this.registerParticipants(...suggesters);
  }

  public registerVoters(...voters: string[]): void {
    let newPermissionRequests = voters
      .map(v => ({ [v]: new Subject<Message.Permission.Request.Type>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    let newSuggestionRequests = voters
      .map(v => ({ [v]: new Subject<Message.Suggestion.Type<T>>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    this.permissionReq = Object.assign({},
      this.permissionReq,
      newPermissionRequests);

    this.suggestionReq = Object.assign({},
      this.suggestionReq,
      newSuggestionRequests);

    this.registerParticipants(...voters);
  }

  public receiveMessages(uid: string): Observable<Try<Message.Generic.Type<T>>> {
    return Observable.merge<Try<Message.Generic.Type<T>>>(
      Try.unwrap(this.permissionReq[uid])
        .map(v => v.map((v1): Message.Generic.Type<T> => ({
          type: Message.Case.PERMISSION_REQUEST,
          message: v1 as AmbiguousMessage<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.permissionGranted[uid])
        .map(v => v.map((v1): Message.Generic.Type<T> => ({
          type: Message.Case.PERMISSION_GRANTED,
          message: v1 as AmbiguousMessage<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.suggestionReq[uid])
        .map(v => v.map((v1): Message.Generic.Type<T> => ({
            type: Message.Case.SUGGESTION,
            message: v1 as AmbiguousMessage<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.nackRequestRes[uid])
        .map(v => v.map((v1): Message.Generic.Type<T> => ({
          type: Message.Case.NACK_PERMISSION,
          message: v1 as AmbiguousMessage<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),
    );
  }

  public errorTrigger = (uid: string): Try<Observer<Error>> => {
    return Try.unwrap(this.errorSubject[uid]);
  }

  public errorStream = (uid: string): Observable<Try<Error>> => {
    try {
      let subject = Try.unwrap(this.errorSubject[uid]).getOrThrow();
      return subject.map(v => Try.success(v));
    } catch (e) {
      return Observable.of(Try.failure(e));
    }
  }

  public sendMessage(uid: string, msg: Message.Generic.Type<T>): Observable<Try<any>> {
    switch (msg.type) {
      case Message.Case.PERMISSION_REQUEST:
        let pRequest = <Message.Permission.Request.Type>msg.message;
        Try.unwrap(this.permissionReq[uid]).map(v => v.next(pRequest));
        break;

      case Message.Case.PERMISSION_GRANTED:
        let pGranted = <Message.Permission.Granted.Type<T>>msg.message;
        Try.unwrap(this.permissionGranted[uid]).map(v => v.next(pGranted));
        break;

      case Message.Case.SUGGESTION:
        let suggestion = <Message.Suggestion.Type<T>>msg.message;
        Try.unwrap(this.suggestionReq[uid]).map(v => v.next(suggestion));
        break;

      case Message.Case.NACK_PERMISSION:
        let permissionNack = <Message.Nack.Permission.Type>msg.message;
        Try.unwrap(this.nackRequestRes[uid]).map(v => v.next(permissionNack));
        break;

      default:
        return Observable.of(Try.failure(`Unhandled message type: ${msg.type}`));
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
  let suggester: Suggester.Type<Value>;
  let suggesterUid: string;
  let suggesterMessages: Message.Generic.Type<Value>[];
  let voter: Voter.Type<Value>;
  let voterUid: string;
  let voterMessages: Message.Generic.Type<Value>[];
  let subscription: Subscription;

  beforeEach(() => {
    api = new PaxosAPI();
    suggesterUid = uuid();
    voterUid = uuid();
    api.registerSuggesters(suggesterUid);
    api.registerVoters(voterUid);
    suggester = createNode(suggesterUid, api);
    suggesterMessages = [];
    voter = createNode(voterUid, api);
    voterMessages = [];
    subscription = new Subscription();

    suggester.suggesterMessageStream()
      .mapNonNilOrEmpty(v => v)
      .doOnNext(v => suggesterMessages.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);

    voter.voterMessageStream()
      .mapNonNilOrEmpty(v => v)
      .doOnNext(v => voterMessages.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);
  });

  it('Voter receiving logically lower proposal - should send nack', () => {
    /// Setup
    let req1: Permission.Request.Type = {
      senderId: suggesterUid,
      suggestionId: { id: '1000', integer: 1000 },
    };

    let req2: Permission.Request.Type = {
      senderId: suggesterUid,
      suggestionId: { id: '999', integer: 999 },
    };

    let subject = Try.unwrap(api.permissionReq[voterUid]).getOrThrow();

    subject.next(req1);

    /// When
    subject.next(req2);

    /// Then
    expect(Message.Permission.Granted.count(...suggesterMessages)).toBe(1);
    expect(Message.Nack.Permission.count(...suggesterMessages)).toBe(1);
    expect(Message.Permission.Request.count(...voterMessages)).toBe(2);
  });
});

describe('Paxos instance should be implemented correctly', () => {
  let api: PaxosAPI<Value>;

  beforeEach(() => api = new PaxosAPI());

  it('Paxos instance should be implemented correctly', () => {
    console.log(Instance.builder().build());
  });
});