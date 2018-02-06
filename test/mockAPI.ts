import { Observable, Observer, Subject, Subscriber } from 'rxjs';

import {
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
  Message,
  Node,
  Suggester,
  SuggestionId as SID,
  Voter,
} from './../src/paxos';

import { Ambiguous, LastAccepted } from '../src/paxos/Message';

export type AmbiguousMsg<T> = Ambiguous<T>;
export type GenericMsg<T> = Message.Generic.Type<T>;
export type LastAcceptedData<T> = LastAccepted.Type<T>;
export type NodeAPI<T> = API.Node.Type<T>;
export type NodeConfig = Config.Node.Type;
export type NackPermitMsg = Message.Nack.Permission.Type;
export type PGrantedMsg<T> = Message.Permission.Granted.Type<T>;
export type PRequestMsg = Message.Permission.Request.Type;
export type SuggestMsg<T> = Message.Suggestion.Type<T>;
export type Value = number;
export let rangeMin = 0;
export let rangeMax = 100000;
export let valueRandomizer = (): Value => Numbers.randomBetween(rangeMin, rangeMax);

export function createNode<T>(uid: string, api: NodeAPI<T>, config: NodeConfig) {
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

export class PaxosAPI<T> implements NodeAPI<T> {
  public permissionReq: JSObject<Subject<PRequestMsg>>;
  public permissionGranted: JSObject<Subject<PGrantedMsg<T>>>;
  public suggestionReq: JSObject<Subject<SuggestMsg<T>>>;
  public nackPermitRes: JSObject<Subject<NackPermitMsg>>;
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
      ...mapObserverToGeneric(this.nackPermitRes),
    ];
  }

  public constructor(vRandomizer: () => T) {
    this.permissionReq = {};
    this.permissionGranted = {};
    this.suggestionReq = {};
    this.nackPermitRes = {};
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

    this.nackPermitRes = Object.assign({},
      this.nackPermitRes,
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

      Try.unwrap(this.nackPermitRes[uid])
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
        Try.unwrap(this.nackPermitRes[uid]).map(v => v.next(permissionNack));
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

export class PaxosConfig implements NodeConfig {
  public quorumSize: number;
  public takeCutoff: number;

  public constructor() {
    this.quorumSize = 0;
    this.takeCutoff = 0;
  }
}