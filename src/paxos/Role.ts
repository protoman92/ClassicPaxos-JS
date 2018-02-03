import { Observable } from 'rxjs';
import { Try } from 'javascriptutilities';
import * as API from './API';

export namespace Suggester {
  /**
   * Represents a suggester.
   */
  export interface Type {
    requestPermission<P>(prev: Try<P>): Observable<Try<any>>;
  }
}

export namespace Voter {
  /**
   * Represents a voter.
   */
  export interface Type {
    grantPermission<P>(prev: Try<P>): Observable<Try<any>>;
  }

  /**
   * Represents a voter.
   * @implements {Type<T>} Type implementation.
   * @template T Generics parameter.
   */
  export class Self<T> implements Type {
    private readonly api: API.Voter.Type<T>;

    public constructor(api: API.Voter.Type<T>) {
      this.api = api;
    }

    public grantPermission<P>(prev: Try<P>): Observable<Try<any>> {
      console.log(this.api);
      console.log(prev);
      throw new Error('');
    }
  }
}

export namespace Arbiter {
  /**
   * Represents an arbiter.
   */
  export interface Type {}
}