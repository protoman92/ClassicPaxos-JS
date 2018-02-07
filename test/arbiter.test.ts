import { Observable, Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { Numbers, Try } from 'javascriptutilities';

import {
  API,
  Arbiter,
  SuggestionId as SID,
  Voter,
} from './../src/paxos';

import * as MockAPI from './mockAPI';
import { AcceptMsg, GenericMsg, PaxosAPI, PaxosConfig, Value } from './mockAPI';

let timeout = 10000;

describe('Arbiter should be implemented correctly', () => {
  let voterCount = 10;
  let majority = API.MajorityCalculator.calculateDefault(voterCount);
  let api: PaxosAPI<Value>;
  let config: PaxosConfig;
  let arbiter: Arbiter.Type<Value>;
  let arbiterId: string;
  let arbiterMessages: GenericMsg<Value>[];
  let voters: Voter.Type<Value>[];
  let voterIds: string[];
  let voterMessages: GenericMsg<Value>[];
  let subscription: Subscription;

  beforeEach(() => {
    api = new PaxosAPI(MockAPI.valueRandomizer);
    config = new PaxosConfig();
    arbiterId = uuid();
    arbiter = MockAPI.createNode(arbiterId, api, config);
    arbiterMessages = [];
    voterIds = Numbers.range(0, voterCount).map(() => uuid());
    voters = voterIds.map(v => MockAPI.createNode(v, api, config));
    voterMessages = [];
    subscription = new Subscription();

    api.registerArbiters(arbiter);
    api.registerVoters(...voters);
    [arbiter, ...voters].forEach(v => v.setupBindings());

    arbiter.arbiterMessageStream()
      .mapNonNilOrEmpty(v => v)
      .doOnNext(v => arbiterMessages.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);

    Observable
      .merge(...voters.map(v => v.voterMessageStream()))
      .mapNonNilOrEmpty(v => v)
      .doOnNext(v => voterMessages.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);
  });

  it('Arbiter receiving multiple final values - should declare only one', done => {
    /// Setup
    let acceptanceSbj = Try.unwrap(api.acceptReq[arbiterId]).getOrThrow();
    let times = 10;

    /// When
    Numbers.range(0, times).forEach(v => {
      let sid: SID.Type = { id: '' + v, integer: v };

      Numbers.range(0, majority)
        .map((): AcceptMsg<Value> => ({ sid, value: v }))
        .forEach(v1 => acceptanceSbj.next(v1));
    });

    /// Then
    setTimeout(() => {
      expect(api.finalValue.value).toBe(0);
      done();
    }, 1000);
  }, timeout);
});