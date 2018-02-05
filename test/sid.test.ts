import { SuggestionId } from './../src/paxos';

describe('Suggestion id should be implemented correctly', () => {
  it('Take higher should return correct suggestion id', () => {
    /// Setup
    let sid1: SuggestionId.Type = { id: '1', integer: 1 };
    let sid2: SuggestionId.Type = { id: '2', integer: 2 };

    /// When && Then
    expect(SuggestionId.takeHigher(sid1, sid2).integer).toBe(2);
  });
});