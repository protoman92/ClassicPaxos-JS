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

describe('Suggester utilities should be implemented correctly', () => {
  let timeout = 3000;

  it('Suggester\'s ensureHighestSID should be implemented correctly', done => {
    /// Setup
    let times = 10;
    let sidTrigger = new Subject<SID.Type>();
    let subscription = new Subscription();
    let sids: SID.Type[] = [];

    Suggester.ensureHighestSID(sidTrigger)
      .doOnNext(v => sids.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);

    /// When
    Numbers.range(0, times).forEach(() => {
      let randomValue = Numbers.randomBetween(0, 100000);
      let randomSID = { id: '' + randomValue, integer: randomValue };
      sidTrigger.next(randomSID);
    });

    /// Then
    setTimeout(() => {
      let sortedSids = sids.sort((a, b) => SID.higherThan(a, b) ? 1 : -1);
      let equals = Collections.zip(sids, sortedSids, (a, b) => SID.equals(a, b));
      expect(sids.length).toBeGreaterThan(0);
      expect(sids).toEqual(sortedSids);
      expect(equals.getOrThrow().every(v => v)).toBeTruthy();
      done();
    }, 2000);
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
    config.takeCutoff = 2000;
    suggesterId = uuid();
    voterIds = Numbers.range(0, voterCount).map(() => uuid());
    api.registerSuggesters(suggesterId);
    api.registerVoters(...voterIds);
    suggester = MockAPI.createNode(suggesterId, api, config);
    suggesterMessages = [];
    voters = voterIds.map(v => MockAPI.createNode(v, api, config));
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
    let priorValue = MockAPI.rangeMax + 1;
    let grantedSbj = Try.unwrap(api.permissionGranted[suggesterId]).getOrThrow();
    let sid: SID.Type = { id: '0', integer: 1000 };

    let allResponses = [
      ...Numbers.range(0, majority).map(() => ({
        suggestionId: sid,
        lastAccepted: Try.failure<LastAcceptedData<Value>>(''),
      })),

      ...Numbers.range(0, minority).map(v => ({
        suggestionId: sid,
        lastAccepted: Try.success<LastAcceptedData<Value>>({
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
    let priorValue = MockAPI.rangeMax + 1;
    let grantedSbj = Try.unwrap(api.permissionGranted[suggesterId]).getOrThrow();
    let sid = { id: '0', integer: 1000 };

    let allResponses = [
      ...Numbers.range(0, majority).map(v => ({
        suggestionId: sid,
        lastAccepted: Try.success<LastAcceptedData<Value>>({
          suggestionId: { id: uuid(), integer: v }, value: priorValue,
        }),
      })),

      ...Numbers.range(0, minority).map(() => ({
        suggestionId: sid,
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
    }, config.takeCutoff + 0.1);
  });

  it('Suggester receiving majority NACKs - should retry with new SID', done => {
    /// Setup
    let nackSbj = Try.unwrap(api.nackPermitRes[suggesterId]).getOrThrow();
    let sid = { id: '0', integer: 1000 };

    let nacks = Numbers.range(0, majority)
      .map((): Message.Nack.Permission.Type => ({
        currentSuggestionId: sid,
        lastGrantedSuggestionId: {
          id: uuid(),
          integer: Numbers.randomBetween(0, 10000),
        },
      }));

    // let highestSID = SID.highestSID(nacks, v => v.lastGrantedSuggestionId);

    /// When
    nacks.forEach(v => nackSbj.next(v));

    /// Then
    setTimeout(() => {
      console.log(voterMessages);
      done();
    }, config.takeCutoff + 0.1);
  });
});