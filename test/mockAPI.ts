import { Observable, Subject, Subscriber } from 'rxjs';

import {
  JSObject,
  MappableObserver as MapObserver,
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

export type AcceptMsg<T> = Message.Acceptance.Type<T>;
export type AmbiguousMsg<T> = Ambiguous<T>;
export type GenericMsg<T> = Message.Generic.Type<T>;
export type LastAcceptedData<T> = LastAccepted.Type<T>;
export type NodeAPI<T> = API.Node.Type<T>;
export type NodeConfig = Config.Node.Type;
export type NackMsg = Message.Nack.Type;
export type PGrantedMsg<T> = Message.Permission.Granted.Type<T>;
export type PRequestMsg = Message.Permission.Request.Type;
export type SuggestMsg<T> = Message.Suggestion.Type<T>;
export type Value = number;
export let rangeMin = 0;
export let rangeMax = 100000;
export let valueRandomizer = (): Value => Numbers.randomBetween(rangeMin, rangeMax);

export function createNode<T>(uid: string, api: NodeAPI<T>, config: NodeConfig): Node.Type<T> {
  let arbiter = Arbiter.builder<T>()
    .withUID(uid)
    .withAPI(api)
    .withConfig(config)
    .build();

  let suggester = Suggester.builder<T>()
    .withUID(uid)
    .withAPI(api)
    .withConfig(config)
    .build();

  let voter = Voter.builder<T>()
    .withUID(uid)
    .withAPI(api)
    .build();

  return Node.builder<T>()
    .withUID(uid)
    .withConfig(config)
    .withArbiter(arbiter)
    .withSuggester(suggester)
    .withVoter(voter)
    .build();
}

export class PaxosAPI<T> implements NodeAPI<T> {
  public permitReq: JSObject<Subject<PRequestMsg>>;
  public permitGranted: JSObject<Subject<PGrantedMsg<T>>>;
  public suggestReq: JSObject<Subject<SuggestMsg<T>>>;
  public acceptReq: JSObject<Subject<AcceptMsg<T>>>;
  public nackRes: JSObject<Subject<NackMsg>>;
  public lastGrantedSID: JSObject<SID.Type>;
  public lastAcceptedData: JSObject<LastAccepted.Type<T>>;
  public errorSubject: JSObject<Subject<Error>>;
  public valueRandomizer: Nullable<() => T>;

  public get allMessageStream(): Observable<GenericMsg<T>> {
    function mapGeneric(obs: JSObject<Subject<AmbiguousMsg<T>>>, type: Message.Case) {
      return Objects.entries(obs).map(v => v['1']).map(v => {
        return v.map((v1): GenericMsg<T> => ({ type: type, message: v1 }));
      });
    }

    return Observable.merge(
      ...mapGeneric(this.permitReq, Message.Case.PERMIT_REQUEST),
      ...mapGeneric(this.permitGranted, Message.Case.PERMIT_GRANTED),
      ...mapGeneric(this.suggestReq, Message.Case.SUGGESTION),
      ...mapGeneric(this.acceptReq, Message.Case.ACCEPTANCE),
      ...mapGeneric(this.nackRes, Message.Case.NACK),
    );
  }

  public constructor(vRandomizer: () => T) {
    this.acceptReq = {};
    this.permitReq = {};
    this.permitGranted = {};
    this.suggestReq = {};
    this.nackRes = {};
    this.lastGrantedSID = {};
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

  public registerArbiters(...arbiters: string[]): void {
    let newAcceptance = arbiters
      .map(v => ({ [v]: new Subject<AcceptMsg<T>>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    this.acceptReq = Object.assign({}, this.acceptReq, newAcceptance);
  }

  public registerSuggesters(...suggesters: string[]): void {
    let newPermissionGranted = suggesters
      .map(v => ({ [v]: new Subject<PGrantedMsg<T>>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    let newNackRequestResponse = suggesters
      .map(v => ({ [v]: new Subject<NackMsg>() }))
      .reduce((a, b) => Object.assign({}, a, b), {});

    this.permitGranted = Object.assign({},
      this.permitGranted,
      newPermissionGranted);

    this.nackRes = Object.assign({},
      this.nackRes,
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

    this.permitReq = Object.assign({},
      this.permitReq,
      newPermissionRequests);

    this.suggestReq = Object.assign({},
      this.suggestReq,
      newSuggestionRequests);

    this.registerParticipants(...voters);
  }

  public receiveMessage(uid: string): Observable<Try<GenericMsg<T>>> {
    return Observable.merge<Try<GenericMsg<T>>>(
      Try.unwrap(this.permitReq[uid])
        .map(v => v.map((v1): GenericMsg<T> => ({
          type: Message.Case.PERMIT_REQUEST,
          message: v1 as AmbiguousMsg<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.permitGranted[uid])
        .map(v => v.map((v1): GenericMsg<T> => ({
          type: Message.Case.PERMIT_GRANTED,
          message: v1 as AmbiguousMsg<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.suggestReq[uid])
        .map(v => v.map((v1): GenericMsg<T> => ({
          type: Message.Case.SUGGESTION,
          message: v1 as AmbiguousMsg<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.acceptReq[uid])
        .map(v => v.map((v1): GenericMsg<T> => ({
          type: Message.Case.ACCEPTANCE,
          message: v1 as AmbiguousMsg<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),

      Try.unwrap(this.nackRes[uid])
        .map(v => v.map((v1): GenericMsg<T> => ({
          type: Message.Case.NACK,
          message: v1 as AmbiguousMsg<T>,
        })))
        .map(v => v.map(v1 => Try.success(v1)))
        .getOrElse(Observable.empty()),
    );
  }

  public sendMessage(uid: string, msg: GenericMsg<T>) {
    return new Observable<Try<any>>(obs => {
      switch (msg.type) {
        case Message.Case.PERMIT_REQUEST:
          let pRequest = <PRequestMsg>msg.message;
          Try.unwrap(this.permitReq[uid]).map(v => v.next(pRequest));
          obs.next(Try.success(undefined));
          break;

        case Message.Case.PERMIT_GRANTED:
          let pGranted = <Message.Permission.Granted.Type<T>>msg.message;
          Try.unwrap(this.permitGranted[uid]).map(v => v.next(pGranted));
          obs.next(Try.success(undefined));
          break;

        case Message.Case.SUGGESTION:
          let suggestion = <SuggestMsg<T>>msg.message;
          Try.unwrap(this.suggestReq[uid]).map(v => v.next(suggestion));
          obs.next(Try.success(undefined));
          break;

        case Message.Case.ACCEPTANCE:
          let acceptance = <AcceptMsg<T>>msg.message;
          Try.unwrap(this.acceptReq[uid]).map(v => v.next(acceptance));
          obs.next(Try.success(undefined));
          break;

        case Message.Case.NACK:
          let permissionNack = <NackMsg>msg.message;
          Try.unwrap(this.nackRes[uid]).map(v => v.next(permissionNack));
          obs.next(Try.success(undefined));
          break;

        default:
          return obs.next(Try.failure(`Unhandled type: ${msg.type}`));
      }

      obs.complete();
    });
  }

  public broadcastMessage(msg: GenericMsg<T>): Observable<Try<any>> {
    return new Observable((obs: Subscriber<Try<any>>) => {
      switch (msg.type) {
        case Message.Case.PERMIT_REQUEST:
          let permitReq = <PRequestMsg>msg.message;
          Objects.entries(this.permitReq).forEach(v => v['1'].next(permitReq));
          obs.next(Try.success(undefined));
          break;

        case Message.Case.PERMIT_GRANTED:
          let pGranted = <PGrantedMsg<T>>msg.message;
          Objects.entries(this.permitGranted).forEach(v => v['1'].next(pGranted));
          obs.next(Try.success(undefined));
          break;

        case Message.Case.SUGGESTION:
          let suggestReq = <SuggestMsg<T>>msg.message;
          Objects.entries(this.suggestReq).forEach(v => v['1'].next(suggestReq));
          obs.next(Try.success(undefined));
          break;

        case Message.Case.ACCEPTANCE:
          let acceptance = <AcceptMsg<T>>msg.message;
          Objects.entries(this.acceptReq).forEach(v => v['1'].next(acceptance));
          obs.next(Try.success(undefined));
          break;

        case Message.Case.NACK:
          let nackRes = <NackMsg>msg.message;
          Objects.entries(this.nackRes).forEach(v => v['1'].next(nackRes));
          obs.next(Try.success(undefined));
          break;

        default:
          obs.next(Try.failure(`Unexpected type ${msg.type}`));
      }

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
    return new Observable<Try<T>>(obs => {
      obs.next(Try.unwrap(this.valueRandomizer).map(v => v()));
      obs.complete();
    });
  }

  /// Voter API.
  public getLastGrantedSuggestionId(uid: string) {
    return new Observable<Try<SID.Type>>(obs => {
      obs.next(Try.unwrap(this.lastGrantedSID[uid]));
      obs.complete();
    });
  }

  public storeLastGrantedSuggestionId(uid: string, sid: SID.Type) {
    return new Observable<Try<any>>(obs => {
      this.lastGrantedSID[uid] = sid;
      obs.next(Try.success(undefined));
      obs.complete();
    });
  }

  public getLastAcceptedData(uid: string): Observable<Try<LastAccepted.Type<T>>> {
    return new Observable<Try<LastAcceptedData<T>>>(obs => {
      obs.next(Try.unwrap(this.lastAcceptedData[uid]));
      obs.complete();
    });
  }

  public storeLastAcceptedData(uid: string, data: LastAcceptedData<T>) {
    return new Observable<Try<any>>(obs => {
      this.lastAcceptedData[uid] = data;
      obs.next(Try.success(undefined));
      obs.complete();
    });
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