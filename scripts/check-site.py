"""Dependency-free checks for static links, metadata, structured data and sitemap coverage."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(); self.ids=set(); self.links=[]; self.h1=0; self.meta={}; self.canonical=[]; self.structured=[]; self.capture=False; self.buffer=''; self.script=False; self.inline=[]
        self.feed(source)
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if 'id' in attrs: self.ids.add(attrs['id'])
        if tag=='h1': self.h1+=1
        if tag=='meta': self.meta[attrs.get('property',attrs.get('name'))]=attrs.get('content','')
        if tag=='link' and attrs.get('rel')=='canonical': self.canonical.append(attrs['href'])
        if tag=='a' and attrs.get('href'): self.links.append(attrs['href'])
        if tag in ['img','script'] and attrs.get('src'): self.links.append(attrs['src'])
        if tag=='link' and attrs.get('rel')=='stylesheet': self.links.append(attrs['href'])
        if tag=='script':
            self.capture=attrs.get('type')=='application/ld+json'; self.script='src' not in attrs; self.buffer=''
    def handle_endtag(self, tag):
        if tag=='script':
            if self.capture: self.structured.append(json.loads(self.buffer))
            elif self.script: self.inline.append(self.buffer)
            self.capture=False; self.script=False
    def handle_data(self, data):
        if self.capture or self.script: self.buffer+=data
pages={p:Page(p.read_text()) for p in ROOT.rglob('*.html')}
failures=[]
for path,page in pages.items():
    for link in page.links:
        u=urlsplit(link)
        if u.scheme not in ['', 'https', 'http'] or u.netloc not in ['', 'www.perfecttenantinnovation.com', 'perfecttenantinnovation.com']: continue
        relative=unquote(u.path)
        target=(ROOT/relative.lstrip('/')) if relative.startswith('/') else path.parent/relative
        if not relative: target=path
        if target.is_dir(): target=target/'index.html'
        target=target.resolve()
        if not target.exists(): failures.append(f'{path.relative_to(ROOT)}: missing {link}')
        elif u.fragment and target in pages and u.fragment not in pages[target].ids: failures.append(f'{path.relative_to(ROOT)}: missing anchor {link}')
posts=list((ROOT/'blog').glob('*/index.html'))
ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
locations=[n.text for n in ET.parse(ROOT/'sitemap.xml').findall('.//s:loc',ns)]
assert len(locations)==len(set(locations)), 'Duplicate sitemap URLs'
for path in posts:
    page=pages[path]
    if page.h1!=1: failures.append(f'{path}: expected one H1')
    if len(page.canonical)!=1 or page.canonical[0] not in locations: failures.append(f'{path}: canonical/sitemap mismatch')
    for key in ['description','og:image','twitter:image']:
        if not page.meta.get(key): failures.append(f'{path}: missing {key}')
    image=ROOT/urlsplit(page.meta['og:image']).path.lstrip('/')
    if not image.exists(): failures.append(f'{path}: missing social image')
    nodes=[]
    for data in page.structured: nodes.extend(data if isinstance(data,list) else data.get('@graph',[data]))
    if not any(x.get('@type')=='BreadcrumbList' for x in nodes): failures.append(f'{path}: missing breadcrumbs')
    articles=[x for x in nodes if x.get('@type') in ['Article','BlogPosting','NewsArticle']]
    if not articles or any(not x.get('author') or not x.get('datePublished') for x in articles): failures.append(f'{path}: missing article author/date')
if failures: raise SystemExit('\n'.join(failures))
print(f'PASS: {len(pages)} HTML pages; {len(posts)} articles; links, fragments, sharing images, article/breadcrumb JSON and sitemap.')
