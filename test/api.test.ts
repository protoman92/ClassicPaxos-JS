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
    onInstance: (iteration: number) => void,
  ): void => {
    /// Setup
    let retryTrigger = new Subject();

    coordinator.coordinateRetries(retryTrigger)
      .take(retries)
      .scan((acc, _v): number => acc + 1, 0)
      .doOnNext(v => onInstance(v))
      .doOnCompleted(() => done())
      .subscribe()
      .toBeDisposedBy(subscription);

    /// When & Then
    Numbers.range(0, retries).forEach(() => retryTrigger.next(undefined));
  };

  beforeEach(() => subscription = new Subscription());

  it('Noop retry coordinator should be implemented correctly', done => {
    let coordinator = new API.RetryHandler.Noop.Self();
    let lastTimestamp: Nullable<number>;

    testRetryCoordinator(coordinator, retryCount, done, () => {
      let current = new Date().getTime();

      if (lastTimestamp !== null && lastTimestamp !== undefined) {
        let offset = current - lastTimestamp;
        expect(offset).toBeLessThan(5);
      }

      lastTimestamp = current;
    });
  }, timeout);

  it('Exponential backoff coordinator should be implemented correctly', done => {
    let initial = 500;
    let multiplier = 1.2;
    let coordinator = new API.RetryHandler.ExponentialBackoff.Self(initial, multiplier);
    let lastTimestamp: number;

    testRetryCoordinator(coordinator, retryCount, done, iteration => {
      let current = new Date().getTime();

      if (lastTimestamp !== undefined && lastTimestamp !== null) {
        let difference = initial * (multiplier ** iteration);
        let theoretical = lastTimestamp + difference;
        let offset = current - theoretical;
        expect(offset / current).toBeLessThan(0.01);
      }

      lastTimestamp = current;
    });
  }, timeout);
});