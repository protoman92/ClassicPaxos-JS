export namespace QuorumAware {
  /**
   * Represents the config for a quorum-aware object, i.e. objects that know
   * enough information regarding the quorum of voters to make some decisions,
   * such as suggesters/arbiters.
   */
  export interface Type {
    quorumSize: number;
  }
}

export namespace Arbiter {
  /**
   * Represents the config for an arbiter.
   * @extends {QuorumAware.Type} QuorumAware extension.
   */
  export interface Type extends QuorumAware.Type {}
}

export namespace Suggester {
  /**
   * Represents the config for a suggester.
   * @extends {QuorumAware.Type} QuorumAware extension.
   */
  export interface Type extends QuorumAware.Type {
    /**
     * This value is used for a take cutoff operation, in order to cap the wait
     * time for messages. Note that the value here should denote milliseconds.
     */
    takeCutoff: number;
  }
}

export namespace Node {
  export let builder = (): Builder => new Builder();

  /**
   * Represents the config for a node, which implements all the functionalities
   * of arbiter, suggester and voter.
   * @extends {Arbiter.Type} Arbiter extension.
   * @extends {Suggester.Type} Suggester extension.
   */
  export interface Type extends Arbiter.Type, Suggester.Type {
    /**
     * A node may claim leadership if it does not receive any request message
     * within some delay. Essentially we are allowing voters/arbiters to play
     * the role of suggester as well.
     */
    readonly delayBeforeClaimingLeadership: number;
  }

  /**
   * Represents the config for a node.
   * @implements {Type} Type implementation.
   */
  class Self implements Type {
    public _delayBeforeClaimingLeadership: number;
    public _quorumSize: number;
    public _takeCutoff: number;

    public get delayBeforeClaimingLeadership(): number {
      return this._delayBeforeClaimingLeadership;
    }

    public get quorumSize(): number {
      return this._quorumSize;
    }

    public get takeCutoff(): number {
      return this._takeCutoff;
    }

    public constructor() {
      this._delayBeforeClaimingLeadership = 0;
      this._quorumSize = 0;
      this._takeCutoff = 0;
    }
  }

  /**
   * Builder for a node config.
   */
  export class Builder {
    private readonly config: Self;

    public constructor() {
      this.config = new Self();
    }

    /**
     * Set the delay before a node can claim leadership.
     * @param {number} delay A number value.
     * @returns {this} The current Builder instance.
     */
    public withDelayBeforeClaimingLeadership = (delay: number): this => {
      this.config._delayBeforeClaimingLeadership = delay;
      return this;
    }

    /**
     * Set the quorum size for the current node config.
     * @param {number} size A number value.
     * @returns {this} The current Builder instance.
     */
    public withQuorumSize = (size: number): this => {
      this.config._quorumSize = size;
      return this;
    }

    /**
     * Set the take cutoff for the current node config.
     * @param {number} cutoff A number value.
     * @returns {this} The current Builder instance.
     */
    public withTakeCutoff = (cutoff: number): this => {
      this.config._takeCutoff = cutoff;
      return this;
    }

    public build = (): Type => this.config;
  }
}