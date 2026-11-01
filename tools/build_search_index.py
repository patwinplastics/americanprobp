#!/usr/bin/env python3
"""Build data/search-index.json for the site search.

Reads every published HTML page, plus the moulding catalog, and writes a
compact index used by js/site-search.js. Run from the repo root:

    python3 tools/build_search_index.py

The GitHub Action in .github/workflows/search-index.yml runs this on every
push to main, so the index stays current when pages are added or edited.
"""
import html
import json
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "search-index.json")

SKIP_DIRS = {".git", "seo-baselines", "tests", "tools", "node_modules", "downloads", "videos", ".github", ".well-known"}
SKIP_FILES = {"404.html", "pages/thanks.html", "pages/blog/_post-template.html"}

PRODUCT = {
    "pages/truegrain-deck.html", "pages/legacy-pvc-decking.html", "pages/porch.html",
    "pages/mouldings.html", "pages/invisiclip.html", "pages/decking.html",
    "pages/decking-profiles.html", "pages/custom-historic-profiles.html",
}
LEGAL = {"pages/privacy-policy.html", "pages/terms-and-conditions.html"}
TOOLS = {"pages/calculator.html", "pages/dealers.html", "pages/contact.html", "pages/resources.html",
         "pages/for-the-pros.html", "pages/inspiration.html", "lookbook/index.html"}

BODY_LIMIT = 2400


def category(rel):
    if rel in PRODUCT:
        return "Product"
    if rel in LEGAL:
        return "Legal"
    if rel in TOOLS:
        return "Tools"
    if rel.startswith("pages/blog/"):
        return "Blog"
    if rel.startswith("pages/dealers/"):
        return "Dealer"
    if re.match(r"pages/(porch-flooring|pvc-decking)-[a-z-]+\.html$", rel) and rel not in (
        "pages/pvc-decking-coastal-homes.html",
    ):
        return "Local"
    if rel == "index.html":
        return "Page"
    return "Guide"


def clean(s):
    s = html.unescape(s or "")
    s = s.replace("\u00a0", " ")
    return re.sub(r"\s+", " ", s).strip()


class Page(HTMLParser):
    BLOCK_SKIP = {"script", "style", "noscript", "svg", "template", "nav", "header", "footer", "form", "select"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.meta = {}
        self.headings = []      # (level, text, anchor_id)
        self.faqs = []          # (question, answer)
        self.swatches = []
        self.body = []
        self._skip = 0
        self._in_title = False
        self._h = None          # [level, buf, id]
        self._ids = []          # stack of nearest ids for sections
        self._summary = None
        self._after_summary = None
        self._swatch = None
        self._tagstack = []
        self.refresh = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            if a.get("http-equiv", "").lower() == "refresh":
                self.refresh = True
            key = a.get("name") or a.get("property")
            if key and "content" in a:
                self.meta[key.lower()] = a["content"]
            return
        if tag in ("br", "img", "input", "link", "hr", "source", "meta", "area", "col", "wbr"):
            if tag == "br" and self._h:
                self._h[1].append(" ")
            return
        self._tagstack.append((tag, a))
        if tag in self.BLOCK_SKIP or a.get("hidden") is not None and tag in ("div", "nav"):
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag in ("section", "div", "article") and a.get("id"):
            self._ids.append((len(self._tagstack), a["id"]))
        if tag in ("h1", "h2", "h3") and not self._skip:
            self._h = [int(tag[1]), [], a.get("id")]
        if tag == "summary" and not self._skip:
            self._summary = []
        cls = a.get("class", "")
        if re.search(r"(?:^|\s)[\w-]*swatch-name(?:\s|$)", cls) and not self._skip:
            self._swatch = []

    def handle_endtag(self, tag):
        # pop to matching tag; ignore stray end tags with no open match
        if not any(t == tag for t, _ in self._tagstack):
            return
        while self._tagstack:
            t, a = self._tagstack.pop()
            if t in self.BLOCK_SKIP or a.get("hidden") is not None and t in ("div", "nav"):
                self._skip = max(0, self._skip - 1)
            while self._ids and self._ids[-1][0] > len(self._tagstack):
                self._ids.pop()
            if t == tag:
                break
        if tag == "title":
            self._in_title = False
        if tag in ("h1", "h2", "h3") and self._h:
            text = clean("".join(self._h[1]))
            anchor = (self._ids[-1][1] if self._ids else None) or self._h[2]
            if text:
                self.headings.append((self._h[0], text, anchor))
            self._h = None
        if tag == "summary" and self._summary is not None:
            self._after_summary = [clean("".join(self._summary)), []]
            self._summary = None
        if tag == "details" and self._after_summary:
            q, buf = self._after_summary
            ans = clean(" ".join(buf))
            if q and ans:
                self.faqs.append((q, ans, self._ids[-1][1] if self._ids else None))
            self._after_summary = None
        if self._swatch is not None and tag in ("div", "span", "p", "h3", "h4", "strong"):
            name = clean("".join(self._swatch)).rstrip(" \u203a>").strip()
            if name:
                self.swatches.append(name)
            self._swatch = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
            return
        if self._skip:
            return
        if self._h is not None:
            self._h[1].append(data)
        if self._summary is not None:
            self._summary.append(data)
        elif self._after_summary is not None:
            self._after_summary[1].append(data)
        if self._swatch is not None:
            self._swatch.append(data)
        self.body.append(data)


def short_title(t):
    t = clean(t)
    t = re.sub(r"\s*[|\u2013\u2014-]\s*American Pro( Building Products)?\s*$", "", t)
    return t


def pages():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            if not f.endswith(".html"):
                continue
            full = os.path.join(dirpath, f)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            if rel in SKIP_FILES:
                continue
            yield rel, full


def main():
    docs = []
    for rel, full in sorted(pages()):
        with open(full, encoding="utf-8", errors="ignore") as fh:
            raw = fh.read()
        p = Page()
        try:
            p.feed(raw)
        except Exception as e:  # never fail the build on one odd page
            print("warn: could not parse", rel, e, file=sys.stderr)
            continue
        robots = p.meta.get("robots", "")
        if p.refresh or "noindex" in robots:
            continue
        url = rel
        if url.endswith("/index.html") and url != "index.html":
            url = url[: -len("index.html")]
        title = short_title(p.title) or (p.headings[0][1] if p.headings else rel)
        desc = clean(p.meta.get("description", ""))
        cat = category(rel)
        body = clean(" ".join(p.body))
        h1 = next((h[1] for h in p.headings if h[0] == 1), "")
        heads = [h[1] for h in p.headings if h[0] in (1, 2)]
        doc = {
            "u": url,
            "t": title,
            "c": cat,
            "d": desc,
            "h": " | ".join(dict.fromkeys(heads))[:600],
            "k": clean(p.meta.get("keywords", ""))[:400],
            "b": body[:BODY_LIMIT],
        }
        if p.swatches:
            doc["k"] = (doc["k"] + " | colors: " + ", ".join(dict.fromkeys(p.swatches)))[:600]
        img = p.meta.get("og:image", "")
        if img.startswith("https://americanprobp.com/"):
            doc["i"] = img[len("https://americanprobp.com/"):]
        docs.append(doc)

        # Section-level deep links (only sections with an anchor)
        seen = set()
        for level, text, anchor in p.headings:
            if level != 2 or not anchor or anchor in seen or cat in ("Legal",):
                continue
            if anchor in ("top",) or anchor.startswith("hero-slide"):
                continue
            seen.add(anchor)
            docs.append({"u": f"{url}#{anchor}", "t": text, "c": "Section", "p": title, "d": ""})

        # FAQ entries
        for q, a, anchor in p.faqs:
            docs.append({"u": f"{url}#{anchor or 'faq'}", "t": q, "c": "FAQ", "p": title, "d": a[:400]})

    # Moulding catalog: one entry per profile with deep link and thumbnail
    cat_path = os.path.join(ROOT, "data", "mouldings-catalog.json")
    if os.path.exists(cat_path):
        with open(cat_path, encoding="utf-8") as fh:
            catalog = json.load(fh)
        for prof in catalog.get("profiles", []):
            sku = prof.get("sku", "")
            docs.append({
                "u": f"pages/mouldings.html#profile-{sku.lower()}",
                "t": f"{prof.get('name', '')} ({sku})",
                "c": "Profile",
                "p": prof.get("category", "PVC Mouldings"),
                "d": f"{prof.get('dimensions', '')} PVC moulding. {prof.get('category', '')}.",
                "s": sku,
                "i": prof.get("image", ""),
            })

    # Drop exact duplicate titles within the same page (FAQ repeated as heading, etc.)
    out, keys = [], set()
    for d in docs:
        key = (d["u"].split("#")[0], d["t"].lower(), d["c"] in ("FAQ", "Section"))
        if d["c"] in ("FAQ", "Section") and key in keys:
            continue
        keys.add(key)
        out.append(d)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"v": 1, "docs": out}, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"search index: {len(out)} entries, {os.path.getsize(OUT) // 1024} KB -> {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
