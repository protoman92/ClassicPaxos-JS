import { API } from './../src/paxos';

describe('Majority calculator should be implemented correctly', () => {
  it('Default majority calculator should be implemented correctly', () => {
    /// Setup
    let qSize1 = 9;
    let qSize2 = 10;

    /// When
    let mSize1 = API.MajorityCalculator.calculateDefault(qSize1);
    let mSize2 = API.MajorityCalculator.calculateDefault(qSize2);

    /// Then
    expect(mSize1).toBe(5);
    expect(mSize2).toBe(6);
  });
});