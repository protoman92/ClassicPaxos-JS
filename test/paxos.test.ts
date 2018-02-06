import { Instance } from './../src/paxos';
import * as MockAPI from './mockAPI';
import { PaxosAPI, Value } from './mockAPI';

describe('Paxos instance should be implemented correctly', () => {
  let api: PaxosAPI<Value>;

  beforeEach(() => api = new PaxosAPI(MockAPI.valueRandomizer));

  it('Paxos instance should be implemented correctly', () => {
    console.log(Instance.builder().build());
  });
});