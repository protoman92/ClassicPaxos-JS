import { Numbers } from 'javascriptutilities';
import { SuggestionId as SID } from './../src/paxos';

describe('Suggestion id should be implemented correctly', () => {
  it('Take higher should return correct suggestion id', () => {
    /// Setup
    let sid1: SID.Type = { id: '1', integer: 1 };
    let sid2: SID.Type = { id: '2', integer: 2 };

    /// When && Then
    expect(SID.takeHigher(sid1, sid2).integer).toBe(2);
  });

  it('Take highest should return correct suggestion id', () => {
    /// Setup
    let times = 1000;

    interface SIDContainer {
      suggestionId: SID.Type;
    }

    let obj = Numbers.range(0, times)
      .map(v => ({ id: '' + v, integer: v }))
      .map((v): SIDContainer => ({ suggestionId: v }));

    /// When
    let highest = SID.highestSID(obj, v => v.suggestionId).getOrThrow();

    /// Then
    expect(highest.suggestionId.integer).toBe(times - 1);
  });
});