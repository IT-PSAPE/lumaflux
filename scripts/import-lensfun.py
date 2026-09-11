"""Convert a checked-out Lensfun database to a deterministic, attributed JSON subset.
Usage: python3 scripts/import-lensfun.py /path/to/lensfun
No network access; review and pin the upstream revision before running.
"""
import sys, json, pathlib, subprocess, shutil, xml.etree.ElementTree as ET
root = pathlib.Path(sys.argv[1])
out = pathlib.Path('data/lensfun')
out.mkdir(parents=True, exist_ok=True)
cameras, lenses = [], []
def ratio(v):
    a = v.split(":")
    return float(a[0]) / (float(a[1]) if len(a) > 1 else 1)
for file in sorted((root / 'data/db').glob('*.xml')):
    tree = ET.parse(file).getroot()
    for c in tree.findall('camera'):
        cameras.append(dict(maker=c.findtext('maker'), models=[m.text for m in c.findall('model')], crop=float(c.findtext('cropfactor', '1')), mount=c.findtext('mount')))
    for l in tree.findall('lens'):
        if l.findtext('type', 'rectilinear') != 'rectilinear' or l.find('center') is not None:
            continue
        for i, cal in enumerate(l.findall('calibration')):
            samples = {}
            for tag, models in [('distortion', ['poly3','poly5','ptlens']), ('tca',['linear','poly3']), ('vignetting',['pa'])]:
                samples[tag] = [{k: (v if k == 'model' else float(v)) for k,v in el.attrib.items()} for el in cal.findall(tag) if el.get('model') in models]
            if not samples['distortion'] and not samples['tca']: continue
            lenses.append(dict(id=f'{file.stem}:{len(lenses)}:{i}', maker=l.findtext('maker'), models=[m.text for m in l.findall('model')], mounts=[m.text for m in l.findall('mount')], crop=float(cal.get('cropfactor', l.findtext('cropfactor','1'))), aspect=ratio(cal.get('aspect-ratio', l.findtext('aspect-ratio','1.5'))), **samples))
revision = subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'], text=True).strip()
(out/'profiles.json').write_text(json.dumps(dict(source='https://github.com/lensfun/lensfun',revision=revision,license='CC-BY-SA-3.0',cameras=cameras,lenses=lenses), separators=(',',':'))+'\n')
shutil.copyfile(root/'data/COPYING.CC_BY-SA_3.0',out/'COPYING')
print(f'{len(cameras)} cameras, {len(lenses)} calibrated rectilinear lens entries; {revision}')
