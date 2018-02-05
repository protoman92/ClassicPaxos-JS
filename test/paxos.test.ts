import { Observable, Observer, Subject, Subscriber, Subscription } from 'rxjs';
import * as uuid from 'uuid';

import {
  Collections,
  JSObject,
  MappableObserver,
  Nullable,
  Numbers,
  Objects,
  Try,
} from 'javascriptutilities';

import {
  API,
  Arbiter,
  Config,
  Instance,
  Message,
  Node,
  Suggester,
  SuggestionId as SID,
  Voter,
} from './../src/paxos';

import { Ambiguous as AmbiguousMsg, LastAccepted } from '../src/paxos/Message';
import { setTimeout } from 'timers';

type GenericMsg<T> = Message.Generic.Type<T>;
type NodeAPI<T> = API.Node.Type<T>;
type NodeConfig = Config.Node.Type;
type NackPermitMsg = Message.Nack.Permission.Type;
type PGrantedMsg<T> = Message.Permission.Granted.Type<T>;
type PRequestMsg = Message.Permission.Request.Type;
type SuggestMsg<T> = Message.Suggestion.Type<T>;
type Value = number;
let rangeMin = 0;
let rangeMax = 100000;
let valueRandomizer = (): Value => Numbers.randomBetween(rangeMin, rangeMax);

function createNode<T>(uid: string, api: NodeAPI<T>, config: NodeConfig) {
  let arbiter: Arbiter.Type = { uid };

  let suggester = Suggester.builder()
    .withUID(uid)
    .withAPI(api)
    .withConfig(config)
    .build();

  let voter = Voter.builder()
    .withUID(uid)
    .withAPI(api)
    .build();

  return Node.builder()
    .withUID(uid)
    .withConfig(config)
    .withArbiter(arbiter)
    .withSuggester(suggester)
    .withVoter(voter)
    .build();
}

class PaxosAPI<T> implements NodeAPI<T> {
  public permissionReq: JSObject<Subject<PRequestMsg>>;
  public permissionGranted: JSObject<Subject<PGrantedMsg<T>>>;
  public suggestionReq: JSObject<Subject<SuggestMsg<T>>>;
  public nackRequestRes: JSObject<Subject<NackPermitMsg>>;
  public lastGrantedSuggestionId: JSObject<SID.Type>;
  public lastAcceptedData: JSObject<LastAccepted.Type<T>>;
  public errorSubject: JSObject<Subject<Error>>;
  public valueRandomizer: Nullable<() => T>;

  public get messageTriggers(): Observer<GenericMsg<T>>[] {
    let mapObserverToGeneric = (obs: JSObject<Subject<AmbiguousMsg<T>>>) => {
      return Objects.entries(obs).map(v => v['1']).map(v => {
        return new MappableObserver.Self<GenericMsg<T>, AmbiguousMsg<T>>(v, v1 => v1.message);
      });
    };

    return [
      ...mapObserverToGeneric(this.permissionReq),
      ...mapObserverToGeneric(this.permissionGranted),
      ...mapObserverToGeneric(this.suggestionReq),
      ...mapObserverToGeneric(this.nackRequestRes),
    ];
  }

  public constructor(vRandomizer: () => T) {
    this.permissionReq = {};
    this.permissionGranted = {};
    this.suggestionReq = {};
    this.nackRequestRes = {};
    this.lastGrantedSuggestionId = {};
    this.lastAcceptedData = {};
    this.errorSubject = {};
    this.valueRandomizer = vRandomizer;
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
      .map(v => ({ [v]: new Subject<NackPermitMsg>() }))
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
      .map(v => ({ [v]: new Subject<PRequestMsg>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    let newSuggestionRequests = voters
      .map(v => ({ [v]: new Subject<SuggestMsg<T>>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    this.permissionReq = Object.assign({},
      this.permissionReq,
      newPermissionRequests);

    this.suggestionReq = Object.assign({},
      this.suggestionReq,
      newSuggestionRequests);

    this.registerParticipants(...voters);
  }

  public receiveMessage(uid: string): Observable<Try<GenericMsg<T>>> {
    return Observable.merge<Try<GenericMsg<T>>>(
      Try.unwrap(this.permissionReq[uid])
        .map(v => v.map((v1): GenericMsg<T> => ({
          type: Message.Case.PERMISSION_REQUEST,
          message: v1 as AmbiguousMsg<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.permissionGranted[uid])
        .map(v => v.map((v1): GenericMsg<T> => ({
          type: Message.Case.PERMISSION_GRANTED,
          message: v1 as AmbiguousMsg<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.suggestionReq[uid])
        .map(v => v.map((v1): GenericMsg<T> => ({
            type: Message.Case.SUGGESTION,
            message: v1 as AmbiguousMsg<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.nackRequestRes[uid])
        .map(v => v.map((v1): GenericMsg<T> => ({
          type: Message.Case.NACK_PERMISSION,
          message: v1 as AmbiguousMsg<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),
    );
  }

  public sendMessage(uid: string, msg: GenericMsg<T>) {
    switch (msg.type) {
      case Message.Case.PERMISSION_REQUEST:
        let pRequest = <PRequestMsg>msg.message;
        Try.unwrap(this.permissionReq[uid]).map(v => v.next(pRequest));
        break;

      case Message.Case.PERMISSION_GRANTED:
        let pGranted = <Message.Permission.Granted.Type<T>>msg.message;
        Try.unwrap(this.permissionGranted[uid]).map(v => v.next(pGranted));
        break;

      case Message.Case.SUGGESTION:
        let suggestion = <SuggestMsg<T>>msg.message;
        Try.unwrap(this.suggestionReq[uid]).map(v => v.next(suggestion));
        break;

      case Message.Case.NACK_PERMISSION:
        let permissionNack = <NackPermitMsg>msg.message;
        Try.unwrap(this.nackRequestRes[uid]).map(v => v.next(permissionNack));
        break;

      default:
        return Observable.of(Try.failure(`Unhandled message type: ${msg.type}`));
    }

    return Observable.of(Try.success(undefined));
  }

  public broadcastMessage(msg: GenericMsg<T>): Observable<Try<any>> {
    return new Observable((obs: Subscriber<Try<any>>) => {
      this.messageTriggers.forEach(v => v.next(msg));
      obs.next(Try.success(undefined));
      obs.complete();
    });
  }

  public sendErrorStack = (uid: string, error: Error): Observable<Try<any>> => {
    return new Observable((obs: Subscriber<Try<any>>) => {
      try {
        Try.unwrap(this.errorSubject[uid]).map(v => v.next(error)).getOrThrow();
        obs.next(Try.success(undefined));
      } catch (e) {
        obs.next(Try.failure(e));
      }

      obs.complete();
    });
  }

  /// Suggester API.
  public getFirstSuggestionValue(_uid: string): Observable<Try<T>> {
    return Try.unwrap(this.valueRandomizer)

      .map(v => v())
      .map(v => Observable.of(Try.success(v)))
      .getOrThrow();
  }

  /// Voter API.
  public getLastGrantedSuggestionId(uid: string) {
    return Observable.of(Try.unwrap(this.lastGrantedSuggestionId[uid]));
  }

  public storeLastGrantedSuggestionId(uid: string, sid: SID.Type) {
    this.lastGrantedSuggestionId[uid] = sid;
    return Observable.of(Try.success(undefined));
  }

  public getLastAcceptedData(uid: string): Observable<Try<LastAccepted.Type<T>>> {
    return Observable.of(Try.unwrap(this.lastAcceptedData[uid]));
  }
}

class PaxosConfig implements NodeConfig {
  public quorumSize: number;
  public takeCutoff: number;

  public constructor() {
    this.quorumSize = 0;
    this.takeCutoff = 0;
  }
}

describe('Suggester should be implemented correctly', () => {
  let voterCount = 10;
  let majority = API.MajorityCalculator.calculateDefault(voterCount);
  let minority = voterCount - majority;
  let voterIds: string[];
  let voters: Voter.Type<Value>[];
  let voterMessages: GenericMsg<Value>[];
  let suggesterId: string;
  let suggester: Suggester.Type<Value>;
  let suggesterMessages: GenericMsg<Value>[];
  let api: PaxosAPI<Value>;
  let config: NodeConfig;
  let subscription: Subscription;

  beforeEach(() => {
    api = new PaxosAPI(valueRandomizer);
    config = new PaxosConfig();
    config.quorumSize = voterCount;
    config.takeCutoff = 2000;
    suggesterId = uuid();
    voterIds = Numbers.range(0, voterCount).map(() => uuid());
    api.registerSuggesters(suggesterId);
    api.registerVoters(...voterIds);
    suggester = createNode(suggesterId, api, config);
    suggesterMessages = [];
    voters = voterIds.map(v => createNode(v, api, config));
    voterMessages = [];
    subscription = new Subscription();

    suggester.suggesterMessageStream()
      .mapNonNilOrEmpty(v => v)
      .doOnNext(v => suggesterMessages.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);

    Observable.merge(...voters.map(v => v.voterMessageStream()))
      .mapNonNilOrEmpty(v => v)
      .doOnNext(v => voterMessages.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);
  });

  it('Suggester receiving with no majority prior value - should suggest own value', done => {
    /// Setup
    let priorValue = rangeMax + 1;
    let grantedSbj = Try.unwrap(api.permissionGranted[suggesterId]).getOrThrow();
    let sid: SID.Type = { id: '0', integer: 1000 };

    let allResponses = [
      ...Numbers.range(0, majority).map(() => ({
        suggestionId: sid,
        lastAccepted: Try.failure<LastAccepted.Type<Value>>(''),
      })),

      ...Numbers.range(0, minority).map(v => ({
        suggestionId: sid,
        lastAccepted: Try.success<LastAccepted.Type<Value>>({
          suggestionId: { id: uuid(), integer: v }, value: priorValue,
        }),
      })),
    ];

    /// When
    allResponses.forEach(v => grantedSbj.next(v));

    /// Then
    setTimeout(() => {
      expect(Message.Suggestion.count(...voterMessages)).toBe(voterCount);

      Try.success(voterMessages)
        .map(v => v.map(v1 => Message.Suggestion.extract(v1)))
        .map(v => Collections.flatMap(v))
        .filter(v => v.length > 0, '')
        .map(v => v.map(v1 => v1.value))
        .doOnNext(v => expect(v.every(v1 => v1 !== priorValue)).toBeTruthy())
        .doOnNext(v => expect(Collections.unique(v)).toHaveLength(1))
        .getOrThrow();
      done();
    }, config.takeCutoff + 0.1);
  });

  it('Suggester receiving majority decided last value - should propose same value', () => {
    /// Setup
    let priorValue = rangeMax + 1;
    let grantedSbj = Try.unwrap(api.permissionGranted[suggesterId]).getOrThrow();
    let sid = { id: '0', integer: 1000 };

    let allResponses = [
      ...Numbers.range(0, majority).map(v => ({
        suggestionId: sid,
        lastAccepted: Try.success<LastAccepted.Type<Value>>({
          suggestionId: { id: uuid(), integer: v }, value: priorValue,
        }),
      })),

      ...Numbers.range(0, minority).map(() => ({
        suggestionId: sid,
        lastAccepted: Try.failure<LastAccepted.Type<Value>>(''),
      })),
    ];

    /// When
    allResponses.forEach(v => grantedSbj.next(v));

    /// Then
    setTimeout(() => {
      Try.success(voterMessages)
        .map(v => v.map(v1 => Message.Suggestion.extract(v1)))
        .map(v => Collections.flatMap(v))
        .filter(v => v.length > 0, '')
        .map(v => v.map(v1 => v1.value))
        .doOnNext(v => expect(v.every(v1 => v1 === priorValue)).toBeTruthy())
        .getOrThrow();
    }, config.takeCutoff + 0.1);
  });
});

describe('Voter should be implemented correctly', () => {
  let api: PaxosAPI<Value>;
  let config: NodeConfig;
  let suggester: Suggester.Type<Value>;
  let suggesterUid: string;
  let suggesterMessages: GenericMsg<Value>[];
  let voter: Voter.Type<Value>;
  let voterUid: string;
  let voterMessages: GenericMsg<Value>[];
  let subscription: Subscription;

  beforeEach(() => {
    api = new PaxosAPI(valueRandomizer);

    config = Config.Node.builder()
      .withQuorumSize(1)
      .withTakeCutoff(1)
      .build();

    suggesterUid = uuid();
    voterUid = uuid();
    api.registerSuggesters(suggesterUid);
    api.registerVoters(voterUid);
    suggester = createNode(suggesterUid, api, config);
    suggesterMessages = [];
    voter = createNode(voterUid, api, config);
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
    let req1 = { senderId: suggesterUid, suggestionId: { id: '1', integer: 10 } };
    let req2 = { senderId: suggesterUid, suggestionId: { id: '2', integer: 9 } };

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

  beforeEach(() => api = new PaxosAPI(valueRandomizer));

  it('Paxos instance should be implemented correctly', () => {
    console.log(Instance.builder().build());
  });
});