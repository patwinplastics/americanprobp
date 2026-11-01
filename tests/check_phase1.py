from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.links, self.ids, self.jsons = [], [], []
        self.in_json = False
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"): self.ids.append(a["id"])
        if tag in ("a", "link", "script", "img"):
            url = a.get("href") or a.get("src")
            if url: self.links.append(url)
        self.in_json = tag == "script" and a.get("type") == "application/ld+json"
    def handle_data(self, data):
        if self.in_json: self.jsons.append(json.loads(data))
    def handle_endtag(self, tag):
        if tag == "script": self.in_json = False

checked = 0
problems = []
for slug in ("resources", "for-the-pros"):
    path = root / f"pages/{slug}.html"
    text = path.read_text()
    page = Page(text)
    if len(page.ids) != len(set(page.ids)): problems.append(f"{slug}: duplicate IDs")
    if "\u2014" in text: problems.append(f"{slug}: em dash")
    assert f'https://americanprobp.com/pages/{slug}.html' in text
    assert "431677712006030" in text
    for url in page.links:
        parts = urlsplit(url)
        if parts.scheme or parts.netloc: continue
        target = ((root / parts.path.lstrip("/")) if parts.path.startswith("/") else path.parent / parts.path).resolve() if parts.path else path
        if target.is_dir(): target = target / "index.html"
        if not target.exists():
            problems.append(f"{slug}: missing {url}")
        elif target.suffix == ".html" and parts.fragment:
            ids = Page(target.read_text()).ids
            if unquote(parts.fragment) not in ids:
                problems.append(f"{slug}: missing anchor {url}")
        elif target.suffix == ".pdf":
            assert target.read_bytes().startswith(b"%PDF"), target
        checked += 1
    print(f"{slug}: {len(page.links)} links, {len(page.ids)} unique IDs, {len(page.jsons)} valid JSON-LD blocks")

tree = ET.parse(root / "sitemap.xml")
ns = {"s":"http://www.sitemaps.org/schemas/sitemap/0.9"}
urls = [n.text for n in tree.findall("s:url/s:loc", ns)]
assert len(urls) == len(set(urls)), "Duplicate sitemap URLs"
for slug in ("resources", "for-the-pros"):
    assert f"https://americanprobp.com/pages/{slug}.html" in urls
print(f"Sitemap: {len(urls)} unique URLs")
print(f"Checked {checked} local resource/page/asset links")
if problems: raise SystemExit("\n".join(problems))
print("PASS: all checks")
