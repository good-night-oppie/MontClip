#!/usr/bin/env python3
"""Generate audited SVG sources through OpenRouter chat; rasterize social SVG.
No network calls without --generate/--list-models. Never logs credentials/responses.
"""
import argparse, datetime, hashlib, json, os, pathlib, re, struct, sys
import urllib.request, urllib.error, xml.etree.ElementTree as ET
BASE='https://openrouter.ai/api/v1'
STYLE='''Precision Cinema Engineering. Flat, sharp geometric industrial editorial design, generous whitespace, crisp typography, no robots, no 3D, no neon cyberpunk, no gradients. Accent colors #3B82F6 timeline blue, #F59E0B crop amber, #EF4444 privacy red. Use real editable SVG text, system sans-serif fonts, large readable labels, not outlined text. No scripts, animation, external fonts, images, href, foreignObject, CSS imports, links or embedded base64. All text must fit. Output ONLY one complete SVG, no Markdown fences. SVG namespace http://www.w3.org/2000/svg. Do not invent performance numbers, repair success, independent AST APIs, dedicated zoom-in tools or zero-drift guarantees.'''
SPECS={
 'banners/hero-banner':('1280 400','''Headline: MontClip. Subtitle: Agent-native video editing. Depict three horizontal film timeline lanes, compact JSON state nodes (visual metaphor, not an AST API), a blue selection playhead and an amber source-coordinate rectangle labeled (0,0) to (1,1). Smaller label: Inspect state. Look closer. Edit precisely. Compose title left 45%, diagram right 55%.'''),
 'diagrams/symbolic-perception-arch':('1280 720','''Title: Inspect first. Request images when needed. Show Agent <-> MCP state inspection <-> Symbolic timeline, then branching only on visual uncertainty to Contact sheet and Selected source frame. Exact API labels: fablecut_get_project {compact:true}, fablecut_patch_project, fablecut_frame {path,frames,from,to}, fablecut_frame {path,t}. Arrows return visual results to Agent. Bottom compare two workflows: Full-frame sampling: image evidence throughout; MontClip workflow: state summary, then selected images. Add: No token or latency benchmark claimed. Local FFmpeg and browser compositor; external AI service is optional. Do not imply semantic recognition happens locally.'''),
 'diagrams/repair-and-redaction-pipeline':('1280 720','''Title: Input checks today. Source-space redaction proposed. Left half CURRENT IMPLEMENTATION: Recording -> Probe streams -> Scan readable range -> decision: gaps above 5ms? Yes: reject with explanation. No: compatible stream remux, otherwise explicitly consented transcode -> Inspect output. Small note: genpts occurs in export mux, not damaged-input repair. Right half PROPOSED, NOT IMPLEMENTED: source frame rectangle with top-left (0,0) bottom-right (1,1), red sensitive rectangle -> source-space redaction before crop/zoom -> rendered coverage tests required. Add current limitation: existing masks use the fitted/cropped picture. No repair success badge, no claim that proposed redaction works today.'''),
 'banners/social-preview-1280x640':('1280 640','''Exact headline on 3 lines: MontClip / Agent-Native Video Editing / with Symbolic Perception. Secondary: Inspect state. Request selected frames. Bottom: good-night-oppie/MontClip. Strong title-first hierarchy, bold geometric timeline right. No redaction capability claim. The requested phrase Zero-Drift Redaction is unimplemented and MUST NOT appear on this publishable draft. No benchmark number, real credential or fabricated terminal result.''')}

def prompts():
 out={}
 for stem,(box,body) in SPECS.items():
  for theme in ('dark','light'):
   bg,fg=('#090D16','#F8FAFC') if theme=='dark' else ('#F8FAFC','#090D16')
   name=stem+('-'+theme+'.svg')
   extra=' Never use url(), marker, filter, gradient, pattern, style attributes or style elements; draw arrowheads as small polygon elements and use only plain fill/stroke attributes.' if stem.startswith('diagrams/') else ''
   out[name]=STYLE+f' Canvas viewBox="0 0 {box}"; width={box.split()[0]} height={box.split()[1]}. Theme {theme}: background {bg}, foreground {fg}. '+body+extra
 return out
def request(route,key=None,payload=None):
 headers={'Content-Type':'application/json'}
 if key: headers['Authorization']='Bearer '+key
 req=urllib.request.Request(BASE+route,data=None if payload is None else json.dumps(payload).encode(),headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=240) as r: return json.load(r)
 except urllib.error.HTTPError as e: raise RuntimeError('OpenRouter HTTP '+str(e.code)+'; inspect account/model access, then retry.') from None
 except Exception: raise RuntimeError('OpenRouter request failed; check network and retry.') from None
def validate_svg(raw):
 raw=raw.strip()
 if raw.startswith('```'): raise ValueError('Markdown response rejected; no artifact written')
 if re.search(r'<!DOCTYPE|<!ENTITY|url\s*\(|@import',raw,re.I): raise ValueError('Unsafe SVG declaration/reference')
 root=ET.fromstring(raw)
 if root.tag!='{http://www.w3.org/2000/svg}svg': raise ValueError('Not an SVG document')
 allowed={'svg','g','rect','line','path','polyline','polygon','circle','ellipse','text','tspan','defs','clipPath','title','desc'}
 for el in root.iter():
  if el.tag.split('}')[-1] not in allowed: raise ValueError('Unsupported SVG element')
  for k,v in el.attrib.items():
   if k.lower().startswith('on') or 'href' in k.lower() or k=='style': raise ValueError('Unsafe SVG attribute')
   if any(x in v.lower() for x in ('javascript:','http:','https:','data:')): raise ValueError('External SVG reference')
 return raw.encode()
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--out',required=True);p.add_argument('--model');p.add_argument('--list-models',action='store_true');p.add_argument('--generate',action='store_true');p.add_argument('--dump-prompts',action='store_true');p.add_argument('--approved',action='store_true',help='skip the one interactive yes for this batch; every request is still shown before it is sent')
 a=p.parse_args(); out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True)
 (out/'prompts.json').write_text(json.dumps(prompts(),indent=2),encoding='utf8')
 if not(a.generate or a.list_models): print('Prompts prepared. Generation not executed.');return
 key=os.getenv('OPENROUTER_API_KEY')
 if a.generate and not key: raise RuntimeError('OPENROUTER_API_KEY is absent. Set it securely and retry; generation not executed.')
 print('GET '+BASE+'/models  (list models; sends the API key from OPENROUTER_API_KEY, which is never printed)',flush=True)
 models=request('/models',key)['data']
 eligible=[m for m in models if 'text' in m.get('architecture',{}).get('output_modalities',[]) and (not m.get('endpoints') or '/api/v1/chat/completions' in m['endpoints'])]
 if a.list_models:
  for m in eligible: print(m['id'])
  return
 model=next((m for m in eligible if m['id']==a.model),None)
 if not model: raise RuntimeError('Choose --model from --list-models; no generation requested.')
 # Require rasterizer before any paid call, rather than generate unusable social sources.
 try: import cairosvg
 except ImportError: raise RuntimeError('CairoSVG is required for social PNG. Install in a dedicated virtual environment and retry.') from None
 todo=[(n,pr) for n,pr in prompts().items()]
 # Show the whole batch before anything is sent: where it goes, which model, and every prompt in full.
 print('About to send '+str(len(todo))+' request(s), up to 3 attempts each:')
 print('  site:   '+BASE+'/chat/completions (OpenRouter)')
 print('  model:  '+a.model)
 print('  sends:  the prompt text below and nothing else (no files, no source code, no account data); API key from OPENROUTER_API_KEY, not shown')
 for n,pr in todo: print('\n--- '+n+' ---\n'+pr)
 if not a.approved:
  if not sys.stdin.isatty(): raise RuntimeError('Not sent: confirm interactively, or pass --approved once the batch above was approved.')
  if input('\nSend this batch? type "send": ').strip()!='send': print('Not sent.');return
 prev=out/'provenance.json'
 manifest=json.loads(prev.read_text(encoding='utf8'))['assets'] if prev.exists() else []
 done={m['path'] for m in manifest}
 for name,prompt in prompts().items():
  target=out/name
  if name in done: continue  # resume: already generated and recorded in provenance.json
  if target.exists(): raise RuntimeError('Existing output refused: '+name+'; select a fresh --out directory.')
  payload={'model':a.model,'messages':[{'role':'user','content':prompt}],'stream':False}
  for attempt in range(3):  # retry only when the model output fails SVG safety validation
   print('POST '+BASE+'/chat/completions  model='+a.model+'  file='+name+'  attempt '+str(attempt+1)+'\n'+prompt,flush=True)
   response=request('/chat/completions',key,payload)
   raw=response['choices'][0]['message']['content']
   if not isinstance(raw,str): raise ValueError('Expected SVG text response')
   try: data=validate_svg(raw);break
   except (ValueError,ET.ParseError) as e:
    print('Rejected '+name+' attempt '+str(attempt+1)+': '+str(e),file=sys.stderr)
    if attempt==2: raise
  target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
  item={'path':name,'model_requested':a.model,'model_returned':response.get('model'),'request_id':response.get('id'),'endpoint':BASE+'/chat/completions','prompt':prompt,'sha256':hashlib.sha256(data).hexdigest(),'usage':response.get('usage'),'validated':'XML structure and reference allowlist only; visual review pending'}
  if 'social-preview' in name:
   png=target.with_suffix('.png');cairosvg.svg2png(bytestring=data,write_to=str(png),output_width=1280,output_height=640)
   b=png.read_bytes()
   if b[:8]!=b'\x89PNG\r\n\x1a\n' or struct.unpack('>II',b[16:24])!=(1280,640): raise ValueError('PNG dimensions invalid')
   item['png']={'path':str(png.relative_to(out)),'dimensions':[1280,640],'method':'CairoSVG raster of OpenRouter-generated SVG','sha256':hashlib.sha256(b).hexdigest()}
  manifest.append(item)
  (out/'provenance.json').write_text(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'assets':manifest},indent=2),encoding='utf8')
 # Requested canonical filenames are dark versions, retaining explicit variants as well.
 for stem in SPECS:
  if stem.startswith('diagrams/'):
   (out/(stem+'.svg')).write_bytes((out/(stem+'-dark.svg')).read_bytes())
 (out/'banners/social-preview-1280x640.png').write_bytes((out/'banners/social-preview-1280x640-dark.png').read_bytes())
 print('Generated and structurally validated. Review typography and factual diagram labels before publishing.')
if __name__=='__main__':
 try: main()
 except Exception as e:
  # No response bodies, headers, environment values or traceback in terminal.
  print(type(e).__name__+': '+str(e) if isinstance(e,(RuntimeError,ValueError)) else 'Generation failed; no success claimed. Inspect output provenance and retry.',file=sys.stderr);sys.exit(1)
