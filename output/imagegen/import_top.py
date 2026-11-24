"""Import the selected top batch unchanged, leaving three photos for oil edits."""
import json
import shutil
import struct
from pathlib import Path

root = Path(__file__).resolve().parents[2]
images = root / 'src/assets/illustrations'
registry_path = root / 'src/content/assets.json'
registry = json.loads(registry_path.read_text(encoding='utf-8'))
excluded = ('OcS7I71', 'UtjWKJ', 'rIYlt8')
names = {
    '1pUcnh': 'bg-tost-v-kafe',
    '35Lwkt': 'bg-viski-v-komnate',
    '7FLuLn': 'bg-kabina-plan-poleta',
    'Cbai1D': 'bg-kafe-disko-parik',
    'cUNubQ': 'bg-viski-limon-zakuska',
    'jBN_5c': 'bg-kafe-tost-kokteyli',
    'vyNCxS': 'bg-zhiguli-doroga-rassvet',
    'WG640n': 'bg-da40-krylo-nad-rekoy',
    'Yo9Tmp': 'bg-kafe-kalyan',
}

def jpeg_size(path):
    with path.open('rb') as f:
        assert f.read(2) == b'\xff\xd8'
        while True:
            marker = f.read(1)
            assert marker, 'Missing JPEG dimensions'
            if marker != b'\xff':
                continue
            while marker == b'\xff':
                marker = f.read(1)
            if marker == b'\x00' or marker[0] in (0x01, *range(0xd0, 0xda)):
                continue
            length = struct.unpack('>H', f.read(2))[0]
            if marker[0] in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
                _, height, width = struct.unpack('>BHH', f.read(5))
                return width, height
            f.seek(length - 2, 1)

count = 0
for source in sorted((images / 'newnew/top').glob('*.jpg')):
    if source.name.startswith(excluded):
        continue
    asset_id = names[source.stem[:6]]
    destination = images / (asset_id + source.suffix)
    if destination.exists():
        assert destination.read_bytes() == source.read_bytes(), str(destination)
    else:
        shutil.copy2(source, destination)
    width, height = jpeg_size(destination)
    entry = {'file': destination.name, 'width': width, 'height': height}
    assert asset_id not in registry or registry[asset_id] == entry
    registry[asset_id] = entry
    count += 1
    print(source.name, width, height)
registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Imported:', count)
