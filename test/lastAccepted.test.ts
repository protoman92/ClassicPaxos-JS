import { Numbers } from 'javascriptutilities';
import { LastAccepted } from './../src/paxos/Message';

describe('Last accepted should be implemented correctly', () => {
  it('Take highest should return correct last accepted data', () => {
    /// Setup
    let times = 1000;

    let accepted = Numbers.range(0, times)
      .map(v => ({ id: '' + v, integer: v }))
      .map(v => ({ suggestionId: v, value: undefined }));

    /// When
    let highest = LastAccepted.highestSuggestionId(...accepted).getOrThrow();

    /// Then
    expect(highest.suggestionId.integer).toBe(times - 1);
  });
});