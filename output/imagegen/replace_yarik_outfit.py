"""Install an explicitly selected generated edit, retaining prior assets."""
import json
import shutil
import sys
import struct
from datetime import datetime
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = Path(sys.argv[1])
registry_path = root / 'src/content/assets.json'
registry = json.loads(registry_path.read_text(encoding='utf-8'))
for asset_id in sys.argv[2:]:
    entry = registry[asset_id]
    destination = root / 'src/assets/illustrations' / entry['file']
    backup = root / 'output/imagegen/backups' / datetime.now().strftime('edit-%Y%m%d-%H%M%S-%f') / destination.name
    backup.parent.mkdir(parents=True, exist_ok=True)
    if not backup.exists():
        shutil.copy2(destination, backup)
    entry['width'], entry['height'] = struct.unpack('>II', source.read_bytes()[16:24])
    if destination.suffix.lower() in ('.jpg', '.jpeg'):
        destination = destination.with_name(destination.stem + '-s-rakovinoy.png')
        entry['file'] = destination.name
    shutil.copy2(source, destination)
    print(asset_id, entry['width'], entry['height'])
registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
