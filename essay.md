# From microservices to microcells

## What changes

**Move business behavior from independently operated services into versioned tasks coordinated by a durable runtime.** A task attempt can disappear; its progress, state changes, and effect records survive.

This is a proposed execution model. The infrastructure still runs a fleet. Domain teams keep ownership of their data and business rules.

| Concern | Microservices | Microcells |
| --- | --- | --- |
| Unit of release | Service version | Immutable task template |
| Domain execution | Long-lived service replicas | Bounded attempts on shared workers |
| Coordination | APIs, events, service-owned orchestration | Versioned workflow and recorded progress |
| State authority | Domain-owned stores | Domain-owned commit contracts and stores |
| Recovery | Service logic plus platform support | Durable scheduling, deduplicated commits, explicit effect recovery |
| Rollout | Release services and manage compatibility | Route new journeys to a pinned workflow version |

Neither model automatically supplies cross-system atomicity. Microservices can already use durable workflows; microcells make that the default execution contract.

## The execution contract

1. **Publish.** Teams ship immutable templates: code, input/output types, permissions, limits, and invariant references.
2. **Admit and pin.** Authenticate, deduplicate the request, and record the journey's workflow version and exact template digests.
3. **Run.** The runtime gives an attempt scoped facts and capabilities. Retries keep the logical step ID and get distinct attempt IDs.
4. **Commit.** The state owner checks current read dependencies, permissions, and invariants inside the committing transaction. Atomically record the delta, step commit record, receipt reference, and outgoing effect intents. Conflicts re-read and retry. [1]
5. **Continue.** Persist the result before releasing compute. Resume from durable progress. If workflow history lives in a separate system, bridge the commit through an outbox and an idempotent consumer. [2]
6. **Act externally.** Brokers dispatch committed intents with stable operation IDs. Record provider outcomes; reconcile uncertainty. [3]

The platform owns workers, scheduling, policy enforcement, and recovery. Domains own correctness. The state layer can be partitioned; there is no requirement for one company-wide database. Ordinary reads continue through query paths with explicit consistency guarantees.

## A refund, safely

For a $30 refund from a $100 capture, validate a positive amount and matching currency. Enforce this invariant in the authoritative transaction:

```text
completed refunds + active reservations <= captured amount
```

1. **Admit** the request once using its scoped idempotency key and payload identity.
2. **Reserve** $30 and commit the payment intent, step record, and evidence reference together.
3. **Dispatch** that intent using the provider's supported idempotency contract.
4. **Resolve** the outcome. Pending or timed-out operations keep their reservation; a timeout means unknown, not failed. [3][4]
5. **Finalize** confirmed success as a completed refund. Release the reservation on definitive failure. Recover a lost acknowledgment from the commit record.
6. **Notify** through a separate intent. Retrying email must never repeat the refund.

Dropping a local proposal cannot undo an external payment. Use short transactions and durable pending states while waiting for a provider.

## The actual guarantees

| Mechanism | Boundary |
| --- | --- |
| Durable execution | Work can resume from recorded progress. Attempts may run more than once. |
| Deterministic replay | Requires recorded inputs, decisions, and nondeterministic results—not just the same code digest. [5] |
| Transactional commit | Protects the invariant inside its transaction boundary. Independent stores still need coordination. [1][6] |
| Provider idempotency | Depends on key scope, payload matching, retention, and provider behavior. It is not universal exactly-once execution. [3] |
| Route rollback | Changes future admissions. Existing journeys, committed data, and external effects need explicit handling. |
| Signed receipts | Support integrity and provenance. They do not prove business correctness. |

## Migrate without two writers

1. **Pick one journey.** Map its facts, writers, effects, and failure states. Baseline completion time, operating effort, and cost.
2. **Add durability first.** Wrap the existing path with journey identity, progress, deduplication, and an effect journal. Keep existing stores and query paths initially.
3. **Extract and shadow.** Package one cohesive task. Compare proposals against recorded inputs with production writes and external mutations technically disabled.
4. **Canary by business key.** Persist each journey's route. Keep one authoritative writer per invariant boundary. Fence stale writers if ownership transfers; a traffic flag alone is insufficient.
5. **Expand, then retire.** Require successful concurrency, crash, reconciliation, and rollback exercises plus agreed outcome and cost targets. Resolve old journeys, callbacks, and pending effects before deleting their listeners.

Rollback redirects new work. In-flight journeys retain explicit ownership and compatible versions until completed, quarantined, or deliberately migrated. This is incremental replacement, not a rewrite of every service. [7]

## When it earns its complexity

**Use it** when multi-step mutations, waits, retries, external integrations, and repeated recovery machinery justify a shared durable platform.

**Keep what works** for simple systems, read-heavy endpoints, persistent streams, and specialized stateful workloads. Evaluate an existing durable runtime or a modular monolith before building a custom execution platform.

Here, *microcell* means a bounded execution attempt. Established *cell-based architecture* means an isolated workload partition; the two ideas can coexist. [8]

**The gain is less domain runtime machinery. The obligation is still correct state and effects.**

## Sources

These references support the mechanisms. The microcell composition above is a proposal, not a standard or a benchmark.

1. [PostgreSQL: transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).
2. [AWS: transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).
3. [Stripe: idempotent requests](https://docs.stripe.com/api/idempotent_requests).
4. [Stripe: refund states](https://docs.stripe.com/refunds).
5. [Temporal: workflow determinism](https://docs.temporal.io/workflow-definition).
6. [AWS: saga orchestration](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga-orchestration.html).
7. [Martin Fowler: Strangler Fig](https://martinfowler.com/bliki/StranglerFigApplication.html).
8. [AWS: cell-based architecture](https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/what-is-a-cell-based-architecture.html).

September 2026 · Architecture proposal · Examples are illustrative.
