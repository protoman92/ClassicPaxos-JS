export namespace Suggester {
  /**
   * Represents the config for a suggester.
   */
  export interface Type {
    quorumSize: number;

    /**
     * This value is used for a take cutoff operation, in order to cap the wait
     * time for messages.
     */
    takeCutoff: number;
  }
}