"""Render the checked-in static website from the canonical essay and layout."""
from pathlib import Path
import re
import html
import math
import markdown

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "essay.md").read_text()
sections = re.split(r"^## ", source, flags=re.M)[1:]
ids = ["comparison", "kubernetes", "inside-cell", "refund", "guarantees", "migration", "sources"]
labels = ["Old vs new", "Kubernetes", "Inside a cell", "A refund", "Guarantees", "Migration", "Sources"]
assert len(sections) == len(ids), "Update section mapping when changing the article structure."
article, toc = [], []
for i, (section, anchor, label) in enumerate(zip(sections, ids, labels)):
    title, body = section.split("\n", 1)
    rendered = markdown.markdown(body, extensions=["tables", "fenced_code"])
    rendered = re.sub(r"\[(\d+)\]", lambda m: f'<a class="citation" href="#source-{m[1]}" aria-label="Source {m[1]}">[{m[1]}]</a>', rendered)
    if anchor == "sources":
        count = [0]
        def source_id(_):
            count[0] += 1
            return f'<li id="source-{count[0]}">'
        rendered = re.sub(r"<li>", source_id, rendered)
    rendered = re.sub(r"<table>", '<div class="table-wrap" role="region" tabindex="0" aria-label="'+html.escape(label)+' table"><table>', rendered).replace("</table>", "</table></div>")
    clean_title = re.sub(r"^\d+ — ", "", title)
    num = f'<span class="section-number">{i+1:02d}</span>' if anchor != 'sources' else ''
    if anchor == 'kubernetes':
        rendered += (ROOT / 'runtime.html').read_text()
    if anchor == 'refund':
        rendered += '<details class="demo-details"><summary>Try the refund failure scenarios</summary>' + (ROOT / 'walkthrough.html').read_text() + '</details>'
    article.append(f'<section class="article-section" id="{anchor}">{num}<h2>{html.escape(clean_title)}</h2>{rendered}</section>')
    toc.append(f'<a href="#{anchor}"><span>{i:02d}</span>{label}</a>')
page = (ROOT / "layout.html").read_text().replace("{{ARTICLE}}", "\n".join(article)).replace("{{TOC}}", "\n".join(toc)).replace("{{READ_TIME}}", str(math.ceil(len(source.split()) / 230)))
(ROOT / "index.html").write_text(page)
print(f"Built index.html: {len(sections)} sections, {len(source.split())} words")
