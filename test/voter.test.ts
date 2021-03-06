import { Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { Try } from 'javascriptutilities';

import {
  Config,
  Message,
  Suggester,
  Voter,
} from './../src/paxos';

import * as MockAPI from './mockAPI';

import {
  GenericMsg,
  NodeConfig,
  PaxosAPI,
  Value,
} from './mockAPI';

describe('Voter should be implemented correctly', () => {
  let api: PaxosAPI<Value>;
  let config: NodeConfig;
  let suggester: Suggester.Type<Value>;
  let suggesterId: string;
  let suggesterMessages: GenericMsg<Value>[];
  let voter: Voter.Type<Value>;
  let voterId: string;
  let voterMessages: GenericMsg<Value>[];
  let subscription: Subscription;

  beforeEach(() => {
    api = new PaxosAPI(MockAPI.valueRandomizer);

    config = Config.Node.builder()
      .withQuorumSize(1)
      .withTakeCutoff(1)
      .build();

    suggesterId = uuid();
    suggester = MockAPI.createNode(suggesterId, api, config);
    suggesterMessages = [];
    voterId = uuid();
    voter = MockAPI.createNode(voterId, api, config);
    voterMessages = [];
    subscription = new Subscription();

    api.registerSuggesters(suggester);
    api.registerVoters(voter);
    [suggester, voter].forEach(v => v.setupBindings());

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
    let req1 = { senderId: suggesterId, sid: { id: '1', integer: 10 } };
    let req2 = { senderId: suggesterId, sid: { id: '2', integer: 9 } };
    let subject = Try.unwrap(api.permitReq[voterId]).getOrThrow();

    /// When
    subject.next(req1);
    subject.next(req2);

    /// Then
    expect(Message.Permission.Granted.count(...suggesterMessages)).toBe(1);
    expect(Message.Nack.count(...suggesterMessages)).toBe(1);
    expect(Message.Permission.Request.count(...voterMessages)).toBe(2);
  });
});