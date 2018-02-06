import { Subject, Subscription } from 'rxjs';
import { Numbers, Nullable } from 'javascriptutilities';
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

describe('Retry coordinator should be implemented correctly', () => {
  let subscription: Subscription;
  let retryCount = 5;
  let timeout = 100000;

  let testRetryCoordinator = (
    coordinator: API.RetryHandler.Type,
    retries: number,
    done: Function,
    onInstance: (iteration: number, value: number) => void,
  ): void => {
    /// Setup
    let retryTrigger = new Subject<number>();

    coordinator.coordinateRetries(retryTrigger)
      .take(retries)
      .scan((acc: number[], v): number[] => [acc[0] + 1, v], [0, 0])
      .doOnNext(v => onInstance(v[0], v[1]))
      .doOnCompleted(() => done())
      .subscribe()
      .toBeDisposedBy(subscription);

    /// When & Then
    Numbers.range(0, retries).forEach(v => retryTrigger.next(v));
  };

  beforeEach(() => subscription = new Subscription());

  it('Noop retry coordinator should be implemented correctly', done => {
    let coordinator = new API.RetryHandler.Noop.Self();
    let lastTimestamp: Nullable<number>;
    let lastValue: Nullable<number>;

    testRetryCoordinator(coordinator, retryCount, done, (_iter, v) => {
      let current = new Date().getTime();

      if (lastTimestamp !== null && lastTimestamp !== undefined) {
        let offset = current - lastTimestamp;
        expect(offset).toBeLessThan(5);
      }

      if (lastValue !== null && lastValue !== undefined) {
        expect(v - lastValue).toBe(1);
      }

      lastTimestamp = current;
      lastValue = v;
    });
  }, timeout);

  it('Exponential backoff coordinator should be implemented correctly', done => {
    let initial = 500;
    let multiplier = 1.2;
    let coordinator = new API.RetryHandler.IncrementalBackoff.Self(initial, multiplier);
    let lastTimestamp: Nullable<number>;
    let lastValue: Nullable<number>;

    testRetryCoordinator(coordinator, retryCount, done, (iter, v) => {
      let current = new Date().getTime();

      if (lastTimestamp !== undefined && lastTimestamp !== null) {
        let difference = initial * (multiplier ** iter);
        let theoretical = lastTimestamp + difference;
        let offset = current - theoretical;
        expect(offset / current).toBeLessThan(0.01);
      }

      if (lastValue !== null && lastValue !== undefined) {
        expect(v - lastValue).toBe(1);
      }

      lastTimestamp = current;
      lastValue = v;
    });
  }, timeout);
});