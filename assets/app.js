'use strict';

// Every frame describes durable state after a transition, not live payment I/O.
const refundFrames = [
  { label: 'REQUEST SAVED', title: 'A request becomes a journey.', description: 'The request key and payload identity are recorded. Repeating this request returns the same journey instead of creating a second refund.', record: 'journey: refund-042 · workflow: v12', reserved: 0, refunded: 0, provider: 'Not submitted' },
  { label: 'MONEY RESERVED · PAYMENT INSTRUCTION SAVED', title: 'Reserve before changing the world.', description: 'The state owner checks the available amount inside one transaction, then records the $30 reservation, step completion, receipt reference, and outgoing payment intent together.', record: 'commit: c101 · reservation: $30 · effect: pay-042', reserved: 30, refunded: 0, provider: 'Not submitted' },
  { label: 'PAYMENT SENT', title: 'Send one logical operation.', description: 'The outbox sends the saved payment instruction. The broker submits $30 using effect pay-042 and the provider’s idempotency contract. A retry keeps the same identity and payload.', record: 'effect: pay-042 · attempt: 1 · submitted', reserved: 30, refunded: 0, provider: 'Pending' },
  { label: 'PROVIDER CONFIRMATION SAVED', title: 'Record what the provider confirmed.', description: 'The provider confirms success and returns a refund reference. The reservation stays in place until local finalization converts it into a completed refund.', record: 'effect: pay-042 · provider_ref: re_042 · succeeded', reserved: 30, refunded: 0, provider: 'Confirmed success' },
  { label: 'REFUND SAVED', title: 'Turn the reservation into a fact.', description: 'One database transaction records the $30 refund, removes its reservation, and saves a notification instruction. If acknowledgment is lost, the same transition can be recovered from its commit record.', record: 'commit: c102 · refunded: $30 · notify intent recorded', reserved: 0, refunded: 30, provider: 'Confirmed success' },
  { label: 'WORK COMPLETE', title: 'Notification has its own outcome.', description: 'The financial journey is complete. A notification worker handles delivery separately. Retrying an email must never execute the payment operation again.', record: 'journey: succeeded · payment: pay-042 · notification queued', reserved: 0, refunded: 30, provider: 'Confirmed success' }
];

function getRefundFrame(scenario, requestedStep) {
  const maximum = scenario === 'conflict' ? 1 : 5;
  const step = Math.max(0, Math.min(maximum, Number(requestedStep) || 0));
  const frame = { ...refundFrames[step], step, maximum, tone: 'normal' };
  if (scenario === 'crash' && step === 1) Object.assign(frame, {
    label: 'SAVED · WORKER DID NOT HEAR BACK', title: 'The worker dies. The reservation survives.',
    description: 'The $30 reservation and payment intent committed, but the acknowledgment never reached the worker. Recovery looks up the step’s saved result. It must not reserve a second $30 or create a new effect.',
    record: 'context: reserve-042 · committed: c101 · acknowledgment lost', tone: 'warning'
  });
  if (scenario === 'crash' && step === 2) Object.assign(frame, {
    label: 'SAVED RESULT RECOVERED', title: 'Continue from the saved result.',
    description: 'Recovery finds commit c101 and its existing effect pay-042. The outbox dispatches that operation with its original idempotency identity. There is still only one $30 reservation.',
    record: 'recovered: c101 · existing effect: pay-042 · submitted'
  });
  if (scenario === 'timeout' && step === 3) Object.assign(frame, {
    label: 'OUTCOME UNKNOWN · CHECK THE PROVIDER', title: 'A timeout does not mean failure.',
    description: 'The response is lost. The provider might already have refunded the money. Keep the $30 reserved, retain effect pay-042, and reconcile through a supported lookup, webhook, or same-key retry. Do not create a new payment key.',
    record: 'effect: pay-042 · outcome: unknown · reservation retained', provider: 'Unknown', tone: 'warning'
  });
  if (scenario === 'timeout' && step === 4) Object.assign(frame, {
    label: 'RECONCILED SUCCESS · REFUND SAVED', title: 'Resolve uncertainty before finalizing.',
    description: 'In this example, a provider lookup confirms the original refund succeeded. The system records that reference and converts the existing $30 reservation into a completed refund in one database transaction. A still-unknown outcome would remain pending; a definitive failure would follow the release path.',
    record: 'lookup: re_042 succeeded · commit: c102 · no second refund'
  });
  if (scenario === 'conflict') {
    frame.reserved = 80;
    if (step === 0) Object.assign(frame, {
      description: 'This $30 request is admitted. Another journey already holds an $80 reservation against the same $100 capture. Admission alone grants no right to spend the remaining amount.',
      record: 'journey: refund-042 · competing reservation: $80'
    });
    if (step === 1) Object.assign(frame, {
      label: 'NOT ENOUGH AVAILABLE · NO PAYMENT SENT', title: 'Concurrent work cannot spend the same funds.',
      description: 'Before saving the change, $100 minus $80 leaves only $20 available. The $30 proposal is rejected. The other journey’s $80 reservation remains; this journey creates no reservation and sends no provider request.',
      record: 'available: $20 · requested: $30 · journey: rejected', tone: 'warning'
    });
  }
  return frame;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { getRefundFrame };

if (typeof document !== 'undefined') {
  const scenarioInput = document.getElementById('scenario');
  const stepButtons = [...document.querySelectorAll('[data-step]')];
  let step = 0;
  function render() {
    const scenario = scenarioInput.value;
    const frame = getRefundFrame(scenario, step);
    step = frame.step;
    for (const key of ['label', 'title', 'description', 'record', 'provider']) document.getElementById(`sim-${key}`).textContent = frame[key];
    document.getElementById('sim-reserved').textContent = `$${frame.reserved}`;
    document.getElementById('sim-refunded').textContent = `$${frame.refunded}`;
    document.getElementById('sim-progress').textContent = scenario === 'conflict' && step === 1 ? 'Request rejected at step 2' : `Step ${step + 1} of 6`;
    document.querySelector('.simulation').dataset.tone = frame.tone;
    stepButtons.forEach((button, index) => {
      if (index === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      button.classList.toggle('completed', index < step);
      button.disabled = index > frame.maximum;
    });
    const next = document.getElementById('sim-next');
    next.disabled = step === frame.maximum;
    next.textContent = step === frame.maximum ? (scenario === 'conflict' ? 'No payment sent' : 'Work complete') : (scenario === 'timeout' && step === 3 ? 'Check provider →' : 'Next step →');
  }
  if (scenarioInput) {
    scenarioInput.addEventListener('change', () => { step = 0; render(); });
    stepButtons.forEach(button => button.addEventListener('click', () => { step = Number(button.dataset.step); render(); }));
    document.getElementById('sim-next').addEventListener('click', () => { step += 1; render(); });
    document.getElementById('sim-reset').addEventListener('click', () => { step = 0; render(); });
    render();
  }
  if ('IntersectionObserver' in window) {
    const sectionLinks = [...document.querySelectorAll('.section-nav a')];
    const visible = new Set();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target.id) : visible.delete(entry.target.id));
      const current = sectionLinks.find(link => visible.has(link.hash.slice(1)));
      if (!current) return;
      sectionLinks.forEach(link => {
        link.classList.toggle('active', link === current);
        if (link === current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-8% 0px -52% 0px', threshold: 0 });
    document.querySelectorAll('.article-section').forEach(section => observer.observe(section));
  }
}
