"""Extract explicitly labelled public NHS sections; never infer an effects category."""
from html.parser import HTMLParser
import re

# Explicit generic mappings prevent a similarly named medicine being substituted.
PAGES = {
    'acetaminophen': 'https://www.nhs.uk/medicines/paracetamol-for-adults/',
    'cetirizine': 'https://www.nhs.uk/medicines/cetirizine/side-effects-of-cetirizine/',
    'betahistine': 'https://www.nhs.uk/medicines/betahistine/',
}
DOSING_PAGES = {
    'betahistine': 'https://www.nhs.uk/medicines/betahistine/how-and-when-to-take-betahistine/',
}

class Sections(HTMLParser):
    def __init__(self):
        super().__init__(); self.main=False; self.heading=None; self.text=[]; self.parts=[]; self.skip=0
    def handle_starttag(self, tag, attrs):
        if tag=='main': self.main=True
        if tag in ('script','style'): self.skip+=1
        if not self.main or self.skip: return
        if tag in ('h1','h2','h3'):
            self.flush(); self.heading=tag
        if tag in ('p','li','summary','h2','h3','h4','br'): self.text.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.skip=max(0,self.skip-1)
        if tag in ('h1','h2','h3') and self.heading:
            self.parts.append((self.heading, ' '.join(''.join(self.text).split())))
            self.text=[]; self.heading=None
        if tag in ('p','li','summary','h4'): self.text.append('\n')
        if tag=='main': self.flush(); self.main=False
    def handle_data(self,data):
        if self.main and not self.skip: self.text.append(data)
    def flush(self):
        value='\n'.join(' '.join(line.split()) for line in ''.join(self.text).splitlines() if line.strip())
        if value: self.parts.append(('text',value))
        self.text=[]

def effects(html):
    parser=Sections(); parser.feed(html); parser.flush()
    output={}; active=None
    for kind,text in parser.parts:
        lower=text.lower()
        if kind=='h2':
            active='common_effects' if lower.startswith('common side effects') else 'serious_effects' if lower.startswith('serious side effects') else 'adverse_reactions' if lower.startswith('side effects of') else None
        elif kind=='h3':
            if lower.startswith('serious') or lower.startswith('allergic'): active='serious_effects'
            elif lower.startswith('common'): active='common_effects'
            elif active: active=None
        elif active:
            output[active]=(output.get(active,'')+'\n'+text).strip()
    return output

def dosage_guidance(html):
    parser=Sections(); parser.feed(html); parser.flush()
    output=[]; active=False
    for kind,text in parser.parts:
        lower=text.lower()
        if kind in ('h1','h2','h3'):
            if 'how and when to take' in lower or lower.startswith('how to take'):
                active=True
                continue
            if active and (lower.startswith('if you ') or lower.startswith('side effects')):
                break
        elif active and text:
            output.append(text)
    return '\n'.join(output)[:5000] or None

async def lookup(client, generic):
    url=PAGES.get(generic)
    if not url:
        if not re.fullmatch(r'[a-z]+(?: [a-z]+)*', generic): return {}
        # Exact generic page only; no fuzzy medical matching or search-result scraping.
        slug=generic.replace(' ','-')
        url=f'https://www.nhs.uk/medicines/{slug}/'
    response=await client.get(url, follow_redirects=True)
    response.raise_for_status()
    if not str(response.url).startswith(url) and generic not in PAGES: return {}
    result=effects(response.text)
    if not result:
        links=re.findall(r'href=["\']([^"\']+)["\']', response.text)
        root=str(response.url).rstrip('/')
        for link in links:
            absolute='https://www.nhs.uk'+link if link.startswith('/') else link
            if absolute.startswith(root+'/side-effects-of-'):
                response=await client.get(absolute, follow_redirects=True)
                response.raise_for_status(); result=effects(response.text); break
    # Keep the medical wording but avoid presenting UK phone numbers as local numbers.
    for key in result:
        result[key]=re.sub(r'call 999 now', 'seek emergency medical help now', result[key], flags=re.I)
        result[key]=re.sub(r'call (?:NHS )?111', 'contact urgent medical services', result[key], flags=re.I)
    if result:
        label = 'NHS · general side effects (UK guidance)' if any(
            result.get(key) for key in ('common_effects', 'serious_effects', 'adverse_reactions')
        ) else 'NHS · general medicine information (UK guidance)'
        result['source']={'label':label, 'url':str(response.url)}
    dosing_url=DOSING_PAGES.get(generic)
    if dosing_url:
        try:
            dosing_response=await client.get(dosing_url, follow_redirects=True)
            dosing_response.raise_for_status()
            general_dosage=dosage_guidance(dosing_response.text)
            if general_dosage:
                result['general_dosage']=general_dosage
                result['general_dosage_source']={'label':'NHS · general dosing information (UK guidance)', 'url':str(dosing_response.url)}
                if not result.get('source'):
                    result['source']=result['general_dosage_source']
        except Exception:
            pass
    return result
