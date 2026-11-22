"""Register the latest built-in generation; keep source photos untouched."""
import sys, json, shutil, struct
from pathlib import Path

root = Path(__file__).resolve().parents[2]
asset_id = sys.argv[1]
original_name = sys.argv[2]
generated = Path(r'C:\Users\Saitama\.codex\generated_images\01a1fdb7-7ed7-7d72-86e7-e85ad81373fe')
source = max(generated.glob('*.png'), key=lambda p: p.stat().st_mtime_ns)
destination = root / 'src/assets/illustrations' / (asset_id + '.png')
if destination.exists():
    raise SystemExit('Refusing to overwrite: ' + str(destination))
shutil.copy2(source, destination)
width, height = struct.unpack('>II', destination.read_bytes()[16:24])
registry_path = root / 'src/content/assets.json'
registry = json.loads(registry_path.read_text(encoding='utf-8'))
registry[asset_id] = {'file': destination.name, 'width': width, 'height': height}
registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
manifest_path = root / 'output/imagegen/new-photos-oil-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else []
manifest.append({'original': original_name, 'asset': asset_id, 'generated': source.name})
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(asset_id, width, height, 'saved from', source.name)
