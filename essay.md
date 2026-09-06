# From microservices to microcells

## What changes

A **microservice** is a program that usually stays running and receives requests. A **microcell**, in this proposal, is an isolated run of one task. A shared system starts the task, saves its result, and decides what happens next.

The goal: teams ship business code without operating a separate server for every capability. The platform still needs servers. Teams still own their data and business rules.

| Question | Microservices | Microcells |
| --- | --- | --- |
| What do teams release? | A service version | A fixed version of a task, called a **template** |
| What runs? | Service replicas | Task attempts on shared workers |
| How do steps connect? | API calls, messages, and orchestration | A saved plan of steps, called a **workflow** |
| Where does data belong? | With its owning domain | With the same owning domain; outside temporary cells |
| What happens after a crash? | Services and consumers recover their work | The coordinator resumes saved work and retries unfinished tasks |

Microservices can already use durable workflows. Microcells make saved progress and bounded tasks the default way to build a write path.

## Where Kubernetes fits

**Kubernetes manages running capacity. A sandbox isolates code. A workflow coordinator remembers the work.** These are different jobs, and they can work together.

Kubernetes can manage the worker pool that creates cells. A cell need not be a new Kubernetes Pod. A compatible runtime can also isolate workloads through Kubernetes **RuntimeClass**, which selects how a Pod runs. A Kubernetes Job can restart failed work, but it does not automatically save business progress or prevent a duplicate payment. [1]

The sandbox might be a small virtual machine, such as a Firecracker microVM, or a gVisor sandbox. Their isolation, speed, and compatibility differ. Neither provides durable business execution by itself. [2]

## Inside each cell

The **harness** is a small runner inside the sandbox. It loads the chosen task version, supplies its input, starts the code, and collects its output and errors. A supervisor outside the sandbox enforces time and resource limits and saves accepted results.

| Part | Rule in this design |
| --- | --- |
| Program files | Read-only package at a fixed version. |
| Working files | Private, size-limited scratch space. Safe to discard after the attempt. |
| Files to keep | Upload to durable storage before committing references to them. Business data and saved progress live outside the cell. |
| Incoming network | No public endpoint for each task. The platform supplies its input. |
| Outgoing network | Block by default. Permit only approved storage, result, and integration channels. |
| External actions | An adapter, also called a **broker**, checks permissions and performs recorded actions such as payments. |

The runner is not the security boundary. Sandbox isolation, outside network controls, and storage/adapter authorization enforce the limits. Kubernetes network rules require a supporting network plugin; an allowed connection is not permission to perform every operation. [3]

A snapshot can speed startup, but it is optional. After copying one, refresh the task's identity, credentials, connections, and cached random state as needed. [4]

## One refund, end to end

Suppose someone requests $30 back from a $100 payment. Validate a positive amount and matching currency. The business rule is:

```text
completed refunds + money reserved for refunds <= captured payment
```

1. **Accept once.** Save a request key and its input. Repeating that key with the same input returns the same journey—the running instance of the workflow. Reject the same key with different input.
2. **Choose versions.** Record the exact workflow and task versions. Keep them for that journey's retries.
3. **Run a cell.** Its runner supplies the payment facts; task code proposes a $30 reservation. It cannot approve its own database write.
4. **Save together.** The data owner checks the current balance and business rules inside one transaction. Use the journey and step ID to return an already committed result instead of writing twice. Save the reservation, step result, execution record, and payment instruction together. If competing work changed the balance, re-read and retry or reject. [5]
5. **Send the payment.** An **outbox**—the saved list of actions to send—passes the instruction to the payment adapter. Retries reuse the same operation identity and payload. [6]
6. **Resolve and finish.** Confirmed final success becomes a completed refund. Definitive failure releases the reservation. Keep the reservation while the provider reports pending. A timeout means **unknown**: keep it reserved and check with the provider. Send notification separately so an email retry cannot repeat the refund. [7]

Release the cell only after its result has been durably accepted. Never keep a temporary cell or a database transaction open while waiting hours for a provider.

## What the design actually guarantees

| Claim | Precise meaning |
| --- | --- |
| Work survives a crash | Saved progress can be recovered. An unfinished attempt may run again. |
| Replay follows the same path | It must use recorded decisions and outside results. The same program version alone is insufficient. [8] |
| A state change is atomic | All its writes succeed together inside one transaction boundary. Separate stores still need coordination. [5][9] |
| A payment is not duplicated | Only if the provider's deduplication rules and recovery protocol support it. Keys can expire. [7] |
| A release can be rolled back | New work can use the previous version. Existing work, saved data, and outside actions still need handling. |

An execution record helps explain what happened. A signature can protect that record from tampering; it does not prove the business decision was correct.

## Move one workflow at a time

1. **Pick a small journey.** Identify its data owner, writers, outside actions, and failure states. Measure completion time, operating effort, and cost.
2. **Add saved progress.** Coordinate the existing services first. Keep their stores and ordinary read paths working.
3. **Extract one task.** Test it on recorded inputs with production writes and outside actions disabled. Compare its proposed results.
4. **Move a stable group.** Route a chosen set of customers or accounts to the new path. Keep one authorized writer for each protected set of facts. Reject delayed writes from the old path if ownership moves.
5. **Expand after recovery works.** Test crashes, concurrent requests, uncertain provider outcomes, and rollback. Resolve old journeys and callbacks before removing their services. [10]

Use this model when multi-step work, waits, retries, and repeated recovery code justify a shared platform. Keep simpler services, persistent streams, and specialized systems where they work well. An existing workflow runtime or modular monolith may be enough.

## Sources and terminology

This is an architecture proposal, not an established standard or a benchmark. Here, *microcell* means one bounded task execution. Established *cell-based architecture* means independent workload partitions; the two can coexist. [11]

1. Kubernetes: [RuntimeClass](https://kubernetes.io/docs/concepts/containers/runtime-class/) · [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/).
2. Sandbox choices: [Firecracker](https://firecracker-microvm.github.io/) · [gVisor](https://gvisor.dev/docs/).
3. Kubernetes: [NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/).
4. Firecracker: [snapshot cloning](https://github.com/firecracker-microvm/firecracker/blob/main/docs/snapshotting/snapshot-support.md).
5. PostgreSQL: [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).
6. AWS: [transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).
7. Stripe: [idempotency](https://docs.stripe.com/api/idempotent_requests) · [refund states](https://docs.stripe.com/refunds).
8. Temporal: [workflow determinism](https://docs.temporal.io/workflow-definition).
9. AWS: [saga orchestration](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga-orchestration.html).
10. Martin Fowler: [incremental replacement](https://martinfowler.com/bliki/StranglerFigApplication.html).
11. AWS: [cell-based architecture](https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/what-is-a-cell-based-architecture.html).

September 2026 · Examples are illustrative.
