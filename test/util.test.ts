import { Subject, Subscription } from 'rxjs';
import { Numbers, Reactives } from 'javascriptutilities';
import './../src/paxos/util';

let timeout = 10000;

describe('Observable extensions should be implemented correctly', () => {
  let subscription: Subscription;

  beforeEach(() => subscription = new Subscription());

  it('Observable transform should be implemented correctly', done => {
    /// Setup
    let subject = new Subject<number>();
    let times = 1000;
    let numbers: number[] = [];

    subject.asObservable()
      .transform((obs) => Reactives.ensureOrder(obs, (a, b) => a > b))
      .doOnNext(v => numbers.push(v))
      .subscribe()
      .toBeDisposedBy(subscription);

    /// When
    Numbers.range(0, times).forEach(v => subject.next(v));

    /// Then
    setTimeout(() => {
      let sorted = numbers.sort((a, b) => a - b);
      expect(numbers).toEqual(sorted);
      expect(numbers).toHaveLength(times);
      done();
    }, 500);
  }, timeout);
});