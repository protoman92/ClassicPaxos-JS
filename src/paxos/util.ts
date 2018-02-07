import { Observable } from 'rxjs';

declare module 'rxjs/Observable' {
  interface Observable<T> {
    /**
     * Transform the current Observable into another Observable with a possibly
     * different generic. This is similar to the Transformer concept in RxJava.
     * @template R Generic parameter.
     * @param {(obs: Observable<T>) => Observable<R>} selector Observable selector.
     * @returns {Observable<T>} An Observable instance.
     */
    transform<R>(selector: (obs: Observable<T>) => Observable<R>): Observable<R>;
  }
}

Observable.prototype.transform = function<R>(fn: (obs: Observable<any>) => Observable<R>) {
  return fn(this);
};