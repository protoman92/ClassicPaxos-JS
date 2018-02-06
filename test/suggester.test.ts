import { Observable, Subscription } from 'rxjs';
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

let timeout = 5000;

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

  it.only('Suggester receiving with no majority prior value - should suggest own value', done => {
    /// Setup
    let priorValue = MockAPI.rangeMax + 1;
    let grantedSbj = Try.unwrap(api.permitGranted[suggesterId]).getOrThrow();
    let sid: SID.Type = { id: '0', integer: 1000 };

    let allResponses = [
      ...Numbers.range(0, majority).map(() => ({
        suggestionId: sid,
        lastAccepted: Try.failure<LastAcceptedData<Value>>(''),
      })),

      ...Numbers.range(0, minority).map(v => ({
        suggestionId: sid,
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
      ...Numbers.range(0, majority).map(v => ({
        suggestionId: sid,
        lastAccepted: Try.success<LastAcceptedData<Value>>({
          sid: { id: uuid(), integer: v }, value: priorValue,
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
});