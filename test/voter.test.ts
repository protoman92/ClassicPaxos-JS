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
  let suggesterUid: string;
  let suggesterMessages: GenericMsg<Value>[];
  let voter: Voter.Type<Value>;
  let voterUid: string;
  let voterMessages: GenericMsg<Value>[];
  let subscription: Subscription;

  beforeEach(() => {
    api = new PaxosAPI(MockAPI.valueRandomizer);

    config = Config.Node.builder()
      .withQuorumSize(1)
      .withTakeCutoff(1)
      .build();

    suggesterUid = uuid();
    voterUid = uuid();
    api.registerSuggesters(suggesterUid);
    api.registerVoters(voterUid);
    suggester = MockAPI.createNode(suggesterUid, api, config);
    suggesterMessages = [];
    voter = MockAPI.createNode(voterUid, api, config);
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