# From microservices to microcells

## A software architecture for the durable-execution era

Microservices made independent deployment and clear domain ownership practical. At scale, they can also make a simple business change depend on many services, network contracts, queues, and release schedules. When that coordination costs more than the autonomy it buys, we should reconsider the unit we deploy.

This essay proposes **microcells**: bounded executions of immutable task templates, coordinated by durable workflows, with explicit state authority and recorded effects. Teams publish behavior; a shared execution platform supplies capacity, records progress, and recovers unfinished work. A cell may disappear while the business journey survives.

The proposal combines established ideas from durable execution, transaction processing, capability security, and event-driven integration. The word *microcell* names this particular composition; it is not presented as an established industry standard or a new distributed-systems guarantee. It is also distinct from **cell-based architecture**, where a cell is an independently isolated partition of a service and its data. A microcell execution platform can itself be partitioned into those larger isolation cells. [1]

The objective is to reduce the standing topology that domain teams must manage while preserving correctness, ownership, and release autonomy. The platform still runs a fleet. Some domain services should remain services.

## 01 — Change the unit of deployment

A microservice combines a domain contract, a deployment unit, and a running network endpoint. Those boundaries sometimes align well. They sometimes force small pieces of business behavior to acquire a server, scaling policy, client SDK, and on-call surface of their own.

In the proposed model, a **template** is the unit of release, a **workflow** is the unit of business coordination, and a **cell** is one bounded execution attempt. A **journey** is one durable instance of a workflow. An execution platform restores or starts compute when a step is ready, supplies a scoped context, and durably accepts its result before releasing that compute.

This changes the domain programming model. It does not remove scheduling, queues, capacity planning, schema evolution, or network failure. These responsibilities move into reusable platform mechanisms. A bad implementation merely replaces a service mesh with a central bottleneck.

| Concern | Typical service fleet | Proposed microcell model |
| --- | --- | --- |
| Business release | Deploy a service version | Publish a template digest; admit journeys on a compatible workflow version |
| Coordination | APIs, events, and orchestration distributed across services | Explicit durable workflow, with recorded transitions |
| Execution | Long-lived replicas | Bounded attempts on pooled platform workers |
| State ownership | Usually a service or domain owns its data | A domain still owns each fact family and its commit contract |
| Failure recovery | Service-specific retries and recovery logic | Platform recovery plus domain-defined failure and reconciliation behavior |
| Operations | Service and infrastructure health | Journey outcomes, effect status, contention, and platform health |

This is an option for coordination-heavy mutation paths, not a reason to split a cohesive function into twenty remote tasks.

## 02 — Seven objects, one execution contract

The vocabulary should be small enough to implement and precise enough to audit.

| Object | Definition |
| --- | --- |
| **Template** | An immutable artifact containing code, runtime requirements, typed inputs and outputs, permitted reads and writes, effect capabilities, resource limits, and invariant references. A snapshot is one packaging option. |
| **Catalog** | The versioned registry of artifacts and eligible routes. A routing decision resolves to an exact digest and is recorded before dispatch. |
| **Workflow** | A versioned description or program for steps, branches, waits, timers, retries, and failure paths. Its durable history records decisions and completed work. |
| **ContextID** | The stable identity of a logical step occurrence, including its journey and loop or fan-out position. Retries keep this identity; attempts have separate IDs. Authorization comes from scoped capabilities, not from an unguessable ID alone. |
| **Cell** | A bounded execution attempt, isolated according to its trust requirements. It receives declared facts and capabilities and returns a proposal. It has no independently discoverable domain endpoint. |
| **Constitution** | Versioned policy for admission, capabilities, budgets, rollout, retention, and commit rules. Domain owners define business invariants; the platform enforces the agreed contracts. |
| **Ledger** | A logical record of committed facts, workflow progress, effect intents, and receipt references. It may use partitioned transactional stores and a separate evidence archive; it need not be one global database. |

The **Factory** is the execution subsystem around these objects: dispatch, isolation, capacity, leases, retry scheduling, and durable result handoff. It implements execution policy without embedding refund, risk, or shipping decisions.

A microVM, container, process, or language sandbox may host a cell. Fresh processes are not a prerequisite for durable execution. Warm workers can execute logically isolated tasks, provided isolation, cleanup, and identity remain correct. Snapshot restore has real constraints: credentials, randomness, connections, and other unique runtime state may require reinitialization. [8]

## 03 — Eight responsibilities, explicit boundaries

These are logical responsibilities, not a requirement for eight independently deployed services.

| Plane | Responsibility | What stays durable |
| --- | --- | --- |
| Experience | UI, public APIs, partner protocols | Public contracts and connection handling |
| Admission | Authenticate, authorize, deduplicate, accept journeys | Accepted request, payload identity, journey ID |
| Query | Read authoritative state or materialized views | Read models and declared consistency guarantees |
| Control | Resolve versions; schedule, resume, and govern workflows | Workflow history, decisions, timers, policy versions |
| Execution | Run bounded attempts and persist their results | Durable handoff and task ownership; compute is replaceable |
| State | Enforce data ownership, concurrency control, and commit rules | Authoritative records, versions, and transactional changes |
| Integration | Execute external effects through governed adapters | Effect IDs, requests, provider references, outcomes |
| Evidence | Support investigation, provenance, and replay | Receipts and retained execution history |

An ordinary query need not start a durable journey. It still consumes compute, and a projection can be stale. Specify whether a read is strongly consistent, eventually consistent, or waits for a known commit watermark. Queries that require substantial computation can use tasks when that is useful.

The control and execution infrastructure should be regional or partitioned where failure isolation requires it. Brokers are logical adapter contracts backed by replicated, partitionable workers; they are not single global processes. A common policy model does not require a single failure domain. [1]

## 04 — Correctness lives at the commit boundary

A cell reads an identified state version and computes a proposed change. The state authority checks permissions, schema, read dependencies, write conflicts, and business invariants **inside the transaction that commits the change**. Checking an invariant earlier in a coordinator and writing later leaves a race.

Copy-on-write branches are an optional implementation technique. They do not supply serializable transactions or safe merging by themselves. Depending on the storage engine and invariant, use serializable transactions, conditional updates, compare-and-swap, or deliberate serialization by business key. Predicate reads and write skew matter; protecting only the rows written is insufficient for some invariants. Conflicts may require a fresh read and re-execution. [2]

Within one transaction boundary, commit the business delta, a durable completion marker or idempotent commit record for the context, any outgoing effect intent, and a receipt record or reference together. If the workflow engine and application database are separate, bridge them with a transactional outbox and an idempotent consumer. A lost acknowledgment can then be recovered by checking the commit record. Do not claim a cross-system atomic commit simply because both systems are durable. [3]

The evidence archive may receive full receipts asynchronously from this durable record. A signature or hash provides integrity and provenance under its trust assumptions. It does not prove the business decision was correct. Ordinary invariant checking is validation; formal proof requires a specification and a verification method.

Domain ownership survives this design. A shared state platform must not become unrestricted shared-table access. Each fact family needs an owner, authorized writers, schema policy, and invariant boundary. Work across independent databases still needs a protocol such as a saga, reservations, reconciliation, or an explicitly supported distributed transaction. [4]

## 05 — A refund, from intent to evidence

Consider a request to refund $30 from a $100 capture. There are no previous refunds or active reservations. The useful invariant is:

```text
completed_refunds + active_refund_reservations <= captured_amount
```

Require a positive requested amount, use integer minor units, and validate that the currency matches the capture. A captured-payment refund is different from releasing an authorization hold. Eligibility and provider rules remain domain-specific.

1. **Admit the intent.** Authenticate and authorize the caller. Store the idempotency key with its scope and canonical payload hash. A duplicate with the same payload returns the existing journey; the same key with a different payload is rejected. Pin the workflow version and record its template bindings.
2. **Evaluate and reserve.** A cell computes eligibility and a proposed $30 reservation. The authoritative transaction validates the current capture, existing refunds, and reservations; it then records the reservation, context commit record, and a payment effect intent together. Competing refunds cannot both spend the same remaining amount.
3. **Dispatch the effect.** An outbox worker invokes the payment broker after that transaction commits. It uses a stable effect ID and the provider's idempotency mechanism. Retries reuse the same logical operation identity and payload.
4. **Resolve the provider outcome.** A confirmed success records the provider reference. A definitive rejection records failure. A pending result stays pending. A timeout is **unknown**, because the provider may already have processed the refund. Retain the reservation for pending or unknown operations and reconcile using the provider's status API, verified webhook, or supported idempotent retry contract. [10]
5. **Finalize the facts.** On confirmed success, atomically convert the reservation into a completed refund and checkpoint that transition. On definitive failure, release the reservation according to policy. A local commit failure after provider success retries finalization; it does not start another refund.
6. **Notify and conclude.** Emit notification intent after finalization. Treat notification delivery separately from financial completion. An email failure must not repeat the payment operation. Return completion or a durable accepted status according to the API's synchronous boundary.

Provider idempotency is conditional: its key scope, retention window, request matching, and failure behavior matter. Stripe, for example, documents specific replay and retention behavior; this is not an unlimited exactly-once guarantee. If the provider cannot deduplicate or report the outcome, some ambiguous operations need reconciliation or human resolution. [5]

Do not perform a refund first and assume dropping a local state branch can undo it. Idempotency prevents some duplicate effects; it does not make an external effect atomic with a local transaction.

## 06 — Durable execution, stated precisely

The achievable default is **retryable execution with durable progress and deduplicated commits**. Attempts may execute more than once. Whether the business effect happens once depends on every boundary involved.

Deterministic workflow replay reconstructs decisions from recorded history. External I/O, clocks, random values, and other nondeterministic results must be recorded or accessed through the runtime's supported mechanisms. Re-running an artifact with the same digest and input does not by itself reproduce a live world that has changed. [6]

Separate three operations: recovering an interrupted journey, replaying recorded decisions, and re-executing domain code in a sandbox for investigation. Historical replay must use recorded external results and must not send real effects again. Some activity or task code can be nondeterministic; the runtime must durably capture its result and handle retries according to the effect contract.

Keep a context's identity stable while distinguishing its attempts. On conflict, a new attempt may read a later state version and produce a different proposal. If that changes a proposed external operation, validate its payload identity before reusing an effect key. Reject stale worker results with leases plus fencing or equivalent conditional ownership checks. Deduplicate commits even if an attempt continues after its lease expires.

Temporal, Restate, and DBOS illustrate related durable-execution approaches with different programming models and boundaries. They are implementation options to evaluate, not evidence that every guarantee in this proposed architecture comes for free. [6][7][9]

## 07 — Release behavior through versioned routes

Build an immutable template, check its contracts and fixtures, scan and sign its artifact, and register it as a candidate. A workflow release resolves a compatible set of template digests. Admission can then assign a stable cohort of new journeys to that release.

```yaml
# Illustrative policy — not a product configuration API
workflow: refund.partial
stable: workflow-v12
candidate: workflow-v13
candidate_weight: 5%
cohort_key: tenant_id
bindings:
  evaluate: refund.evaluate@sha256:<digest>
  finalize: refund.finalize@sha256:<digest>
```

Persist the selected workflow and bindings before dispatch. In-flight journeys retain their version set unless an explicit, recorded migration moves them. Durable-engine history compatibility and worker-version retention must be supported; arbitrary edits to replayed workflow code can be unsafe. [6]

Promotion uses journey completion, invariant failures, effect reconciliation backlog, latency, cost, and domain outcomes. A route rollback changes admission for future work. It does not reverse committed facts, cancel a provider operation, repair a schema migration, or remove unfinished journeys. Dangerous versions may need revocation, commit-time fencing, quarantine, and a repair workflow.

Workers, brokers, schemas, and the platform still have deployments and capacity changes. A pointer can remove much of the domain release choreography without making operations disappear.

Cross-team composition is still contract work. Schema compatibility can catch structural mismatches; it cannot establish that two steps agree on currency, business meaning, authorization, or failure semantics. Journey tests, owners, and compatibility policies remain necessary.

## 08 — Design the failure paths first

| Failure | Required behavior |
| --- | --- |
| Cell crashes before a durable result | Retry the logical context with a new attempt ID; fence stale attempts. |
| Commit succeeds; acknowledgment is lost | Read the context's commit record and return the prior outcome. |
| Concurrent mutation invalidates a read | Abort or serialize; re-read and recompute within the invariant's transaction boundary. |
| Invariant fails | Reject the proposal and record the reason. Already committed earlier steps may still require business recovery. |
| Provider times out | Mark the effect unknown; preserve its identity and reconcile. Do not assume failure. |
| Evidence archive is unavailable | Preserve the durable receipt record or outbox entry; export later under the defined retention and availability policy. |
| Bad release | Stop new admissions to it; assess in-flight work and committed effects; repair explicitly. |
| Poison input | Quarantine with a bounded retry budget and an owner. Build a redacted reproduction fixture where retention permits. |
| Platform partition or outage | Use documented admission, consistency, recovery, and regional failover rules; prevent competing writers. |

Transient compute narrows some process-level failure domains. Shared queues, hot keys, state stores, catalogs, and integration providers create others. Partition capacity and quotas by tenant or workload, use backpressure, and test restore and failover. Do not promise uninterrupted global writes and a single strong ordering through arbitrary network partitions.

## 09 — Migrate one journey at a time

The migration unit is a business journey and its write authority. Repackaging a service as a task without deciding who can commit its data is not a migration plan. Follow an incremental replacement strategy: keep the working system available while bounded parts move behind a controlled routing boundary. [11]

**Stage 0 · Establish a baseline.** Choose a bounded, observable mutation path with a stable owner and recoverable effects. Map its writers, reads, invariants, provider operations, and failure states. Measure completion time, support burden, retry rate, cost, and change lead time. Keep stable read paths in place.

**Stage 1 · Add durability around the existing path.** Introduce journey identity, admission deduplication, durable progress, and an effect journal. Existing services may remain authoritative writers behind adapters. Extract an integration contract where duplication creates real risk; do not make a company-wide broker migration a prerequisite.

**Stage 2 · Extract one bounded decision.** Package cohesive domain logic as a template. Start with recorded fixtures and read-only inputs. Keep transactional checks with the state owner. Define identity, deadlines, retries, fencing, and effect contracts before moving writes.

**Stage 3 · Shadow without effects.** Run the candidate on recorded or aligned inputs using read-only state and simulated or recorded broker responses. Block production writes and outbound mutation capabilities. Compare decisions and proposed deltas, accounting for different observation times. Shadowing is observation; routing real mutating traffic is a canary.

**Stage 4 · Canary one authoritative path.** Route a stable cohort by business key to the new journey. Record the assignment so retries follow it. Keep exactly one authorized writer per invariant boundary. Either retain the legacy state owner behind its commit API or transfer ownership with an enforced routing epoch or fencing mechanism. Never send the same live write to both systems for comparison.

**Stage 5 · Expand with explicit gates.** Require no unexplained duplicate effects or invariant violations, reconcile all ambiguous provider outcomes within the agreed SLO, verify crash recovery and restore, and meet the measured latency and cost budget. Define thresholds before the canary. Compare business outcomes as well as infrastructure health.

**Stage 6 · Retire after outstanding work is resolved.** Send new admissions to the selected path, then drain, complete, or explicitly migrate old journeys. Retain required template versions, event schemas, idempotency records, and provider reconciliation access. Remove the old listener only after its consumers, timers, callbacks, and rollback obligations are resolved.

A migration rollback changes future routing while already accepted journeys retain an explicit owner. If data ownership moved, reversing it requires fencing and state reconciliation. Percentage routing alone does not solve ownership.

## 10 — Keep the platform smaller than the problem

Domain teams own templates, fact contracts, business invariants, fixtures, and failure decisions. Journey owners own end-to-end outcomes and cross-step compatibility. Platform teams own durable scheduling, isolation, state mechanisms, integration infrastructure, and recovery. On-call responsibility follows failure ownership; product stakeholders track journey outcomes without automatically becoming infrastructure operators.

The local loop can run a template against facts and simulated brokers, then show the proposal and receipt. That makes isolated development easier. Fixture replay is only one layer: retain concurrency tests, broker contract tests, journey integration tests, failure injection, load testing, and restore exercises where the risk warrants them.

Receipts should identify journey, context, attempt, artifact digest, policy version, read versions, output hash, effect IDs, invariant results, and commit reference. Keep sensitive payloads out of indiscriminate logs. Immutable metadata can coexist with encrypted payloads, access control, and explicit deletion and retention rules. Do not promise unlimited forensic replay after its dependencies or permitted data have expired.

Track journey success and time to completion; age of pending and unknown effects; queue delay; retry and contention rates; commit latency; capacity fairness; restore time; and cost per completed journey. Domain teams may stop managing replicas, but platform teams still need resource and saturation metrics.

## 11 — Where microcells fit

**Consider this model** for multi-step business operations with waits, retries, external effects, audit needs, and repeated coordination machinery across teams. Its value grows when a shared platform removes duplicated operational work without erasing domain boundaries.

**Keep another model** for workloads whose existing structure already works: low-latency reads, long-lived streaming connections, specialized stateful engines, tightly coupled computations, or teams too small to justify a durable platform. Long computations can be delegated to a suitable engine and represented by durable submit-and-wait steps rather than forced into tiny cells.

Compare an existing durable-execution product, a simpler service-based workflow, and a modular monolith before building a custom Factory. A modular monolith is an application architecture, not automatically a control plane. The adoption test is measured engineering and operating cost, not a universal service-count threshold.

The end state is a smaller domain runtime topology supported by a deliberately engineered platform. Publish templates. Pin workflow versions. Run bounded attempts. Commit through the owner of the facts. Record and reconcile effects. Retain enough evidence to recover and explain the result.

**Compute may be transient. Responsibility must remain durable.**

## Sources and boundaries

The sources below support individual mechanisms and cautions. The seven-object model, eight-plane decomposition, and migration sequence are the architectural synthesis proposed in this essay; they are not claims that these sources define a universal microcell standard.

1. [AWS Well-Architected — What is a cell-based architecture?](https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/what-is-a-cell-based-architecture.html). Established isolation-cell terminology and partitioned failure domains.
2. [PostgreSQL — Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html). Serializable behavior, anomalies, and transaction retries.
3. [AWS Prescriptive Guidance — Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html). Atomic application writes and outgoing events; duplicate delivery and idempotent consumers.
4. [AWS Prescriptive Guidance — Saga orchestration pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga-orchestration.html). Coordinating transactions across independent stores and compensating actions.
5. [Stripe — Idempotent requests](https://docs.stripe.com/api/idempotent_requests). Provider-specific key semantics, replay behavior, and retention.
6. [Temporal — Workflow definition](https://docs.temporal.io/workflow-definition). Deterministic workflows and compatible changes to recorded execution history.
7. [Restate — Databases and Restate](https://docs.restate.dev/guides/databases). Journaled results, internal state boundaries, and external database integration.
8. [AWS Lambda — SnapStart](https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html). Snapshot-based startup and runtime compatibility considerations.
9. [DBOS — Workflows](https://docs.dbos.dev/python/tutorials/workflow-tutorial). Durable workflow execution and persisted progress.
10. [Stripe — Refunds](https://docs.stripe.com/refunds). Pending and failed refund states and provider outcome handling.
11. [Martin Fowler — Strangler Fig](https://martinfowler.com/bliki/StranglerFigApplication.html). Incremental replacement of an existing application.

Edited architecture proposal · September 2026. Examples and configuration are illustrative, not a reference implementation or benchmark.
