"""Build branded 1200×630 PNG cards from the current editorial titles.
Requires Pillow. Set PTI_CARD_FONT to a bold TrueType font on non-macOS hosts.
"""
from pathlib import Path
from html.parser import HTMLParser
from PIL import Image, ImageDraw, ImageFont
import os
ROOT = Path(__file__).resolve().parents[1]
FONT = os.environ.get('PTI_CARD_FONT', '/System/Library/Fonts/Supplemental/Arial Bold.ttf')
class Title(HTMLParser):
    def __init__(self):
        super().__init__(); self.inside = False; self.value = ''
    def handle_starttag(self, tag, attrs):
        if tag == 'title': self.inside = True
    def handle_endtag(self, tag):
        if tag == 'title': self.inside = False
    def handle_data(self, text):
        if self.inside: self.value += text

def build(title, filename):
    image = Image.new('RGB', (1200, 630), '#141C26')
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1200, 12), fill='#62C2C7')
    draw.ellipse((920, 370, 1400, 850), fill='#243C46')
    draw.text((72, 72), 'PERFECT TENANT INNOVATION', font=ImageFont.truetype(FONT, 24), fill='#79D1D5')
    for size in range(58, 29, -2):
        font = ImageFont.truetype(FONT, size); lines = []; line = ''
        for word in title.split():
            candidate = (line + ' ' + word).strip()
            if draw.textlength(candidate, font=font) > 1040:
                lines.append(line); line = word
            else: line = candidate
        if line: lines.append(line)
        if len(lines) <= 4: break
    assert len(lines) <= 4, title
    for index, line in enumerate(lines):
        draw.text((72, 175 + index * (size + 14)), line, font=font, fill='white')
    draw.text((72, 550), 'Guides for a better rental experience', font=ImageFont.truetype(FONT, 25), fill='#C6D5DD')
    filename.parent.mkdir(parents=True, exist_ok=True)
    image.save(filename, optimize=True)

if __name__ == '__main__':
    build('Less rental admin. More room to be an owner.', ROOT / 'assets/social/default.png')
    pages = list((ROOT / 'blog').glob('*/index.html'))
    for page in pages:
        parser = Title(); parser.feed(page.read_text())
        build(parser.value, ROOT / 'assets/social' / (page.parent.name + '.png'))
    print(f'Built {len(pages) + 1} sharing cards.')
