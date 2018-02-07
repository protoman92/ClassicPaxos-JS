export namespace Participant {
  /**
   * Represents an object that participates in a Paxos instance.
   */
  export interface Type {
    /**
     * Unique id to distinguish different participants.
     */
    uid: string;

    /**
     * Setup reactive bindings for message handling.
     */
    setupBindings(): void;
  }
}