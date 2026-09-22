"""Regression checks for the approved full-line moulding catalog."""
from pathlib import Path
from html.parser import HTMLParser
import json
import re

ROOT = Path(__file__).resolve().parents[1]
profiles = json.loads((ROOT / 'data/mouldings-catalog.json').read_text())['profiles']
text = (ROOT / 'pages/mouldings.html').read_text()

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skus, self.samples, self.images, self.ids = [], [], [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'):
            self.ids.append(a['id'])
        if a.get('data-sku'):
            self.skus.append(a['data-sku'])
        if tag == 'input' and a.get('name') == 'samples[]':
            self.samples.append(a['value'])
        if tag == 'img':
            self.images.append(a)

page = Page()
page.feed(text)
assert len(profiles) == 34
assert len({p['sku'] for p in profiles}) == 34
assert len({p['category'] for p in profiles}) == 7
assert len(page.ids) == len(set(page.ids)), 'Duplicate IDs'
assert sorted(page.skus) == sorted(p['sku'] for p in profiles)
assert len(page.samples) == 42 and len(set(page.samples)) == 42
for p in profiles:
    assert (ROOT / p['image']).is_file(), p['image']
    assert f"{p['sku']} - {p['name']}" in page.samples, p['sku']
for image in page.images:
    src = image.get('src', '')
    if src.startswith('../'):
        assert (ROOT / 'pages' / src).is_file(), src
        assert image.get('alt'), src
jsons = [json.loads(block) for block in re.findall(
    r'<script type="application/ld\+json">(.*?)</script>', text, re.S)]
group = next(block for block in jsons if block.get('@type') == 'ProductGroup')
assert len(group['hasVariant']) == 34
assert {v['sku'] for v in group['hasVariant']} == set(page.skus)
assert all('offers' not in v for v in group['hasVariant'])
for sku in ['WATERTABLEPVC', 'ECB6PVC']:
    p = next(p for p in profiles if p['sku'] == sku)
    v = next(v for v in group['hasVariant'] if v['sku'] == sku)
    assert p['dimensions'] is None and 'additionalProperty' not in v
assert next(p for p in profiles if p['sku'] == 'SILLFARMPVC')['dimensions'] == '2-1/4" x 2-3/4"'
assert not any(x in text for x in ('APV-JAMB-4', 'APV-JAMB-6', 'FCWTPVC', '\u2014'))
assert 'id="top"' in text
print('PASS: 34 catalog profiles, 7 families, 42 sample options, valid images and JSON-LD, approved dimension omissions, no excluded jambs.')
