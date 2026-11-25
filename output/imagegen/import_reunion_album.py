"""Import new reunion photos without altering originals or duplicating known scenes."""
import hashlib
import json
import shutil
import struct
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = root / 'src/assets/illustrations/newnew/neeeeeew'
destination = root / 'src/assets/illustrations'
registry_path = root / 'src/content/assets.json'
registry = json.loads(registry_path.read_text(encoding='utf-8'))
# Visually verified original photos already represented by filtered versions.
duplicates = {3: 'bg-bashnya-iz-butylok-oil', 18: 'bg-da40-noch-fak-oil', 41: 'bg-kompaniya-na-balkone-oil'}
names = {
 1: 'rebyata-na-perrone', 2: 'chay-s-kruzhkoy', 4: 'balkon-nogi-vverh',
 5: 'shutka-s-nogoy', 6: 'otdyh-na-krovati', 7: 'sinyaya-perchatka',
 8: 'pozy-u-fotostenda', 9: 'kompaniya-u-fotostenda', 10: 'troe-na-divane',
 11: 'shutki-za-stolom', 12: 'vdvoem-na-parkovke', 13: 'devushki-na-parkovke',
 14: 'dlinnye-volosy-i-usy', 15: 'nakladnye-usy-v-kafe', 16: 'portret-posle-tusovki',
 17: 'razgovor-v-komnate', 19: 'kompaniya-u-dvuhyarusnoy-krovati',
 20: 'u-krasnogo-belogo', 21: 'balkon-akrobaty-obshchiy-plan', 22: 'balkon-akrobaty-vblizi',
 23: 'na-lavke-s-devushkami', 24: 'na-dorozhnom-znake', 25: 'v-stepi-u-tyuka',
 26: 'selfi-na-prirode', 27: 'kompaniya-na-dereve', 28: 'rebyata-na-polyane',
 29: 'vecher-na-polyane', 30: 'gruppa-v-rame', 31: 'u-magazina',
 32: 'na-balkone-v-kresle', 33: 'dvoe-za-ekranom', 34: 'utro-v-komnate',
 35: 'shutka-s-tatuirovkoy-1', 36: 'shutka-s-tatuirovkoy-2', 37: 'son-na-krovati',
 38: 'vdvoem-za-stolom', 39: 'obnimashki-na-tusovke', 40: 'na-balkone-s-veypom',
 42: 'troe-v-zelenyh-futbolkah', 43: 'lezhim-na-doroge', 44: 'u-znaka-na-zakate',
 45: 'serdechko-rukami-1', 46: 'serdechko-rukami-2', 47: 'gitara-v-komnate',
 48: 'selfi-v-gorode', 49: 'dvoe-v-ochkah', 50: 'dvoe-v-ochkah-lezhat',
 51: 'v-kabine-s-garnituroy',
}

def jpeg_size(path):
    data = path.read_bytes()
    pos = 2
    while pos < len(data):
        if data[pos] != 255:
            pos += 1
            continue
        while data[pos] == 255:
            pos += 1
        marker = data[pos]
        pos += 1
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        size = struct.unpack('>H', data[pos:pos + 2])[0]
        if marker in (0xC0, 0xC1, 0xC2):
            height, width = struct.unpack('>HH', data[pos + 3:pos + 7])
            return width, height
        pos += size
    raise ValueError('JPEG dimensions not found: ' + str(path))

report = {'added': [], 'duplicates': []}
for path in sorted(source.glob('*.jpg'), key=lambda p: int(p.name.split('_')[1])):
    number = int(path.name.split('_')[1])
    if number in duplicates:
        report['duplicates'].append({'source': path.name, 'existingAsset': duplicates[number]})
        continue
    asset_id = 'album-' + names[number]
    target = destination / (asset_id + '.jpg')
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        raise ValueError('Refusing to overwrite: ' + str(target))
    if not target.exists():
        shutil.copy2(path, target)
    width, height = jpeg_size(path)
    registry[asset_id] = {'file': target.name, 'width': width, 'height': height}
    report['added'].append({'source': path.name, 'asset': asset_id, 'sha256': digest})

registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
report_path = root / 'output/imagegen/new-photos-audit/import-report.json'
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f"Added {len(report['added'])}; existing filtered scenes {len(report['duplicates'])}")
