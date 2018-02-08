import { Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { Collections, Numbers } from 'javascriptutilities';
import { Config, Node } from './../src/paxos';
import * as MockAPI from './mockAPI';
import { NodeConfig, PaxosAPI, Value } from './mockAPI';

let timeout = 10000;

describe('Nodes should be implemented correctly', () => {
  let nodeCount = 10;
  let api: PaxosAPI<Value>;
  let config: NodeConfig;
  let nodes: Node.Type<Value>[];
  let subscription: Subscription;

  beforeEach(() => {
    api = new PaxosAPI(MockAPI.valueRandomizer);

    config = Config.Node.builder()
      .withDelayBeforeClaimingLeadership(100)
      .withQuorumSize(nodeCount)
      .withTakeCutoff(100).build();

    nodes = Numbers.range(0, nodeCount)
      .map(() => MockAPI.createNode(uuid(), api, config));

    subscription = new Subscription();
    api.registerNodes(...nodes);
  });

  it('Nodes not receiving messages for some time - should claim leadership', done => {
    /// Setup
    let finalValues: Value[] = [];

    api.finalValue
      .mapNonNilOrEmpty(v => v)
      .doOnNext(v => finalValues.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);

    /// When
    nodes.forEach(v => v.setupBindings());

    /// When
    setTimeout(() => {
      expect(Collections.unique(finalValues)).toHaveLength(1);
      done();
    }, timeout - 500);
  }, timeout);
});