# From microservices to microcells

**A plain-language architecture proposal by [Yossi Eliaz](https://zozo123.github.io/), September 2026.**

[Read the website](https://zozo123.github.io/microservices-to-microcells/) · [Read the full essay](essay.md)

A concise architecture proposal for moving coordination-heavy mutation paths from independently operated service listeners into immutable task templates and durable workflows.

The concise writeup compares microservices and microcells, explains how Kubernetes, sandboxes, and the runner inside each cell fit together, defines filesystem and network rules, and gives a five-stage migration with one authoritative write path. An optional interactive refund walkthrough explains success, uncertain provider outcomes, lost acknowledgments, and concurrent reservations.

“Microcell” names the bounded execution unit proposed in this essay. It is distinct from established cell-based fault-isolation architecture. Durable execution, transactional outboxes, idempotency, and concurrency control are established mechanisms; this composition is a proposal, not a reference implementation or an exactly-once guarantee for arbitrary external effects.

## Site

The published site is static HTML, CSS, and JavaScript. It uses local font files and has no runtime packages, tracking, backend, or external script dependencies. GitHub Pages publishes the root of `main`; `.nojekyll` disables Jekyll processing.

The canonical prose is in `essay.md`. The checked-in `index.html` is generated from it, `layout.html`, `runtime.html`, and `walkthrough.html`.

To update the prose and regenerate the page:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/build.py
```

To preview the website:

```sh
python3 -m http.server 8765
```

Open `http://localhost:8765/`. Commit the rebuilt `index.html` with its source changes and push to `main` to publish.

## Sources and fonts

Primary references are linked in the essay and the website. DM Sans and Space Grotesk are bundled under the SIL Open Font License; their license files are in `assets/`. The share card `assets/og.png` (1200×630) is rendered from `assets/og.svg` with those fonts.
