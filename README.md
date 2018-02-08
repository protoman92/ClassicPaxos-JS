# ClassicPaxos-JS

[![Build Status](https://travis-ci.org/protoman92/ClassicPaxos-JS.svg?branch=master)](https://travis-ci.org/protoman92/ClassicPaxos-JS)

A classical implementation of the Paxos algorithm using reactive streams. In this implementation, arbiters, suggesters and voters will listen the messages pertaining to their roles and react appropriately.

This implementation leaves out messaging details, i.e. how messages are handled, by abstracting them to a common API interface. As a result, it can be used to handle different systems and configurations, so long as the messaging APIs are correctly implemented.

### HOW-TO: ###
A Paxos **Node** is an instance that serves all 3 roles at once. Define a **Node** as such:

```typescript
  let node = Node.builder()
    .withUID()
    .withArbiter(arbiter)
    .withSuggester(suggester)
    .withVoter(voter)
    .withConfig(config)
    .build();
```

After we have defined all the nodes in the system, register them with the **Coordinator**:

```typescript
  let coordinator = Coordinator.builder()
    .withArbiters(...nodes)
    .withSuggesters(...nodes)
    .withVoters(...nodes)
    .build();
```

Or:

```typescript
  let coordinator = Coordinator.builder().withNodes(...nodes).build()
```

Then, when appropriate:

```typescript
  nodes.forEach(v => v.setupBindings());
```

This will set up all reactive streams for each node. We can then commence the process as such:

```typescript
  coordinator.commenceDecisionProcess();
```

However, this step is optional because even if we do not call it, a participant will elect itself as the leader and start sending permission requests. Even so, it is better to manually start the process to designate a leader upfront and avoid unnecessary delays.

Please check out **Builder** methods for **Arbiter**, **Suggester** and **Voter** to understand their setup requirements.
