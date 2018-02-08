import { Observable, Subject, Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { Collections, Numbers, Try } from 'javascriptutilities';

import {
  API,
  Message,
  Suggester,
  SuggestionId as SID,
  Voter,
} from './../src/paxos';

import * as MockAPI from './mockAPI';

import {
  GenericMsg,
  LastAcceptedData,
  NodeConfig,
  PaxosAPI,
  PaxosConfig,
  Value,
} from './mockAPI';

let timeout = 10000;

describe('Suggester utilities should be implemented correctly', () => {
  let subscription: Subscription;

  beforeEach(() => subscription = new Subscription());

  it('Group messages should be implemented correctly', done => {
    interface Groupable {
      sid: SID.Type;
    }

    let subject = new Subject<Groupable>();
    let times = 100;
    let iterTimes = 5;
    let cutoff = 1000;
    let groupables: Groupable[][] = [];

    subject.asObservable()
      .transform(v => Suggester.groupMessages(v, v1 => v1.sid, cutoff))
      .doOnNext(v => groupables.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);

    /// When
    Observable.range(0, times)
      .map((v): Groupable => ({ sid: { id: '' + v, integer: v } }))
      .doOnNext(v => Numbers.range(0, iterTimes)
        .forEach(v1 => {
          let delay = v1 * (cutoff / (iterTimes - 2));
          setTimeout(() => subject.next(v), delay);
      }))
      .toArray()
      .delay(cutoff + 100)
      .doOnNext(() => {
        expect(groupables).toHaveLength(1);
        expect(groupables[0].length).toBeLessThan(iterTimes);
        expect(groupables[0].every(v => v.sid.integer === times - 1)).toBeTruthy();
      })
      .doOnError(e => fail(e))
      .doOnCompleted(() => done())
      .subscribe()
      .toBeDisposedBy(subscription);
  }, timeout);
});

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
    api = new PaxosAPI(MockAPI.valueRandomizer);
    config = new PaxosConfig();
    config.quorumSize = voterCount;
    config.takeCutoff = 1000;
    suggesterId = uuid();
    suggester = MockAPI.createNode(suggesterId, api, config);
    suggesterMessages = [];
    voterIds = Numbers.range(0, voterCount).map(() => uuid());
    voters = voterIds.map(v => MockAPI.createNode(v, api, config));
    voterMessages = [];
    subscription = new Subscription();

    api.registerSuggesters(suggester);
    api.registerVoters(...voters);
    [suggester, ...voters].forEach(v => v.setupBindings());

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
    let priorValue = MockAPI.rangeMax + 1;
    let grantedSbj = Try.unwrap(api.permitGranted[suggesterId]).getOrThrow();
    let sid: SID.Type = { id: '0', integer: 1000 };

    let allResponses = [
      ...Numbers.range(0, majority).map(() => ({ sid,
        lastAccepted: Try.failure<LastAcceptedData<Value>>(''),
      })),

      ...Numbers.range(0, minority).map(v => ({ sid,
        lastAccepted: Try.success<LastAcceptedData<Value>>({
          sid: { id: uuid(), integer: v }, value: priorValue,
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
    }, config.takeCutoff + 500);
  }, timeout);

  it('Suggester receiving majority decided last value - should propose same value', () => {
    /// Setup
    let priorValue = MockAPI.rangeMax + 1;
    let grantedSbj = Try.unwrap(api.permitGranted[suggesterId]).getOrThrow();
    let sid = { id: '0', integer: 1000 };

    let allResponses = [
      ...Numbers.range(0, majority).map(v => ({ sid,
        lastAccepted: Try.success<LastAcceptedData<Value>>({
          sid: { id: uuid(), integer: v }, value: priorValue,
        }),
      })),

      ...Numbers.range(0, minority).map(() => ({ sid,
        lastAccepted: Try.failure<LastAcceptedData<Value>>(''),
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
    }, config.takeCutoff + 500);
  }, timeout);

  it('Suggester receiving majority NACKs - should retry with new SID', done => {
    /// Setup
    let nackSbj = Try.unwrap(api.nackRes[suggesterId]).getOrThrow();
    let sid = { id: '0', integer: 1000 };
    let sids: SID.Type[] = [];

    let nacks = Numbers.range(0, majority)
      .map((): Message.Nack.Type => ({
        currentSID: sid,
        lastGrantedSID: { id: uuid(), integer: Numbers.randomBetween(0, 10000) },
      }));

    let highestSID = SID.highestSID(nacks, v => v.lastGrantedSID).getOrThrow();

    suggester.tryPermissionStream()
      .mapNonNilOrEmpty(v => v)
      .doOnNext(v => sids.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);

    /// When
    nacks.forEach(v => nackSbj.next(v));

    /// Then
    setTimeout(() => {
      let lastSID = Collections.last(sids).getOrThrow();
      expect(lastSID.id).toBe(highestSID.lastGrantedSID.id);
      expect(lastSID.integer).toBe(highestSID.lastGrantedSID.integer + 1);
      done();
    }, config.takeCutoff + 500);
  }, timeout);

  it('Suggester receiving success messages - should stop retrying', done => {
    /// Setup
    let successSbj = Try.unwrap(api.successRes[suggesterId]).getOrThrow();
    let permitReqCount = 0;

    /// When && Then
    Observable.interval(1)
      .map((v): SID.Type => ({ id: '' + v, integer: v }))
      .subscribe(suggester.tryPermissionTrigger())
      .toBeDisposedBy(subscription);

    voters[0].voterMessageStream()
      .mapNonNilOrEmpty(v => v)
      .filter(v => v.type === Message.Case.PERMIT_REQUEST)
      .doOnNext(() => permitReqCount += 1)
      .timeInterval()
      .map(v => v.interval)
      .filter(v => v > 100)
      .timeoutWith(500, Observable.empty())
      .doOnCompleted(() => expect(permitReqCount).toBeGreaterThan(0))
      .doOnCompleted(() => done())
      .subscribe()
      .toBeDisposedBy(subscription);

    setTimeout(() => successSbj.next({ value: 0 }), 1000);
  }, timeout);
});