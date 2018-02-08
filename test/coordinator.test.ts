import { Observable, Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { Collections, Numbers } from 'javascriptutilities';
import { API, Config, Coordinator, Node } from './../src/paxos';
import * as MockAPI from './mockAPI';
import { NodeConfig, PaxosAPI, Value, UnstablePaxosAPI } from './mockAPI';

let timeout = 10000;

describe('Paxos instance should be implemented correctly', () => {
  let nodeCount = 20;
  let api: PaxosAPI<Value>;
  let unstableAPI: UnstablePaxosAPI<Value>;
  let config: NodeConfig;
  let coordinator: Coordinator.Type<Value>;
  let nodes: Node.Type<Value>[];
  let subscription: Subscription;

  beforeEach(() => {
    api = new PaxosAPI(MockAPI.valueRandomizer);
    unstableAPI = new UnstablePaxosAPI(api, 2);

    config = Config.Node.builder()
      .withQuorumSize(nodeCount)
      .withTakeCutoff(100)
      .withDelayBeforeClaimingLeadership(500)
      .build();

    let retryHandler = new API.RetryHandler.IncrementalBackoff.Self(10, 1.1);

    nodes = Numbers.range(0, nodeCount).map(() => {
      return MockAPI.createNode(uuid(), unstableAPI, config, retryHandler);
    });

    coordinator = Coordinator.builder<Value>()
      .withArbiters(...nodes)
      .withSuggesters(...nodes)
      .withVoters(...nodes)
      .build();

    subscription = new Subscription();

    api.registerArbiters(...nodes);
    api.registerSuggesters(...nodes);
    api.registerVoters(...nodes);
    nodes.forEach(v => v.setupBindings());

    expect(coordinator.arbiters).toHaveLength(nodeCount);
    expect(coordinator.suggesters).toHaveLength(nodeCount);
    expect(coordinator.voters).toHaveLength(nodeCount);
  });

  it('Paxos instance with no disruptions - should work correctly', done => {
    unstableAPI.unstable = false;

    api.finalValue
      .mapNonNilOrEmpty(v => v)
      .takeUntil(Observable.timer(timeout - 100))
      .toArray().logNext()
      .doOnNext(v => expect(Collections.unique(v)).toHaveLength(1))
      .doOnError(e => fail(e))
      .doOnCompleted(() => done())
      .subscribe()
      .toBeDisposedBy(subscription);

    // coordinator.commenceDecisionProcess();
  }, timeout);

  it('Paxos instance with disruptions - should work correctly', done => {
    unstableAPI.unstable = true;

    api.finalValue
      .mapNonNilOrEmpty(v => v)
      .takeUntil(Observable.timer(timeout - 100))
      .toArray().logNext()
      .doOnNext(v => {
        /// Paxos does not guarantee liveness, so there is either no value, or
        /// all accepted values must be the same.
        if (v.length > 0) {
          expect(Collections.unique(v)).toHaveLength(1);
        }
      })
      .doOnError(e => fail(e))
      .doOnCompleted(() => done())
      .subscribe()
      .toBeDisposedBy(subscription);
  }, timeout);
});