"""Archive game files and export this project's small Ren'Py syntax subset.

Python 3, standard library only. No execution of Ren'Py or pickled .rpyc files.
"""
from pathlib import Path
from collections import Counter
import ast
import hashlib
import json
import re
import shutil
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT.parent / 'Orsk-1.0-win' / 'game'
ARCHIVE = ROOT / 'source' / 'renpy' / 'game'
OUT = ROOT / 'content'
DOCS = ROOT / 'docs'
for directory in (ARCHIVE, OUT, DOCS):
    directory.mkdir(parents=True, exist_ok=True)


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dimensions(path):
    data = path.read_bytes()
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return list(struct.unpack('>II', data[16:24]))
    if data[:2] == b'\xff\xd8':
        offset = 2
        while offset < len(data):
            if data[offset] != 255:
                offset += 1
                continue
            marker = data[offset + 1]
            offset += 2
            if marker in (0xD8, 0xD9) or marker == 0:
                continue
            size = int.from_bytes(data[offset:offset + 2], 'big')
            if marker in (0xC0, 0xC1, 0xC2):
                height, width = struct.unpack('>HH', data[offset + 3:offset + 7])
                return [width, height]
            offset += size
    return None


inventory = []
for path in sorted(SOURCE.rglob('*')):
    if not path.is_file():
        continue
    relative = path.relative_to(SOURCE)
    omitted = relative.parts[0] in ('cache', 'saves')
    record = {'path': relative.as_posix(), 'bytes': path.stat().st_size,
              'sha256': digest(path), 'archived': not omitted}
    if omitted:
        record['reason'] = 'Runtime cache' if relative.parts[0] == 'cache' else 'Player save data'
    else:
        target = ARCHIVE / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        if digest(target) != record['sha256']:
            raise RuntimeError(f'Copy differs: {relative}')
    inventory.append(record)
dump(OUT / 'source-inventory.json', inventory)

lines = (ARCHIVE / 'script.rpy').read_text(encoding='utf-8-sig').splitlines()
tokens = [(number, len(line) - len(line.lstrip()), line.strip())
          for number, line in enumerate(lines, 1) if line.strip() and not line.lstrip().startswith('#')]
labels = []
unknown = []
definitions = []
literal = r'''(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')'''
quote = re.compile(r'^(?:(\w+)\s+)?(' + literal + r')(:)?$')


def block(index, indent):
    nodes = []
    while index < len(tokens):
        number, current_indent, text = tokens[index]
        if current_indent < indent:
            break
        if current_indent != indent:
            raise ValueError(f'Unexpected indentation at {number}')
        node = {'id': f'line-{number}', 'line': number, 'raw': text}
        match = quote.fullmatch(text)
        if text == 'menu:':
            node['type'] = 'menu'
        elif match:
            node.update(type='choice' if match[3] else 'text', text=ast.literal_eval(match[2]))
            if match[1]:
                node['speaker'] = match[1]
        elif text.startswith(('scene ', 'jump ')):
            command, value = text.split(' ', 1)
            node.update(type=command, **{'image' if command == 'scene' else 'target': value.strip()})
        elif text == 'return':
            node['type'] = 'return'
        else:
            node['type'] = 'unsupported'
            unknown.append(node)
        index += 1
        if index < len(tokens) and tokens[index][1] > indent:
            node['children'], index = block(index, tokens[index][1])
        nodes.append(node)
    return nodes, index


index = 0
while index < len(tokens):
    number, indent, text = tokens[index]
    match = re.fullmatch(r'label (\w+):', text)
    if match:
        body, index = block(index + 1, tokens[index + 1][1])
        labels.append({'id': match[1], 'line': number, 'nodes': body})
    elif text.startswith('define '):
        definitions.append({'line': number, 'raw': text})
        index += 1
    else:
        raise ValueError(f'Unexpected top-level syntax at {number}: {text}')


def walk(nodes):
    for node in nodes:
        yield node
        yield from walk(node.get('children', []))


nodes = [node for label in labels for node in walk(label['nodes'])]
label_ids = {label['id'] for label in labels}
missing_targets = [n for n in nodes if n['type'] == 'jump' and n['target'] not in label_ids]
assets = []
for record in inventory:
    if not record['archived'] or Path(record['path']).suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp', '.ogg', '.mp3', '.wav', '.ttf', '.otf', '.mp4', '.webm'):
        continue
    path = Path(record['path'])
    asset = {**record, 'category': path.parts[0], 'source': 'source/renpy/game/' + record['path']}
    if path.suffix.lower() in ('.png', '.jpg', '.jpeg'):
        asset['dimensions'] = dimensions(ARCHIVE / path)
    if path.parts[0] == 'images':
        # Ren'Py automatically names images using the filename, not its parent directories.
        asset['renpyName'] = path.stem.lower()
        asset['usedAtLines'] = [n['line'] for n in nodes if n['type'] == 'scene' and n['image'] == asset['renpyName']]
    assets.append(asset)
dump(OUT / 'assets.json', assets)
names = {a['renpyName'] for a in assets if 'renpyName' in a}
missing_images = [n for n in nodes if n['type'] == 'scene' and n['image'] not in names]
counts = Counter(n['type'] for n in nodes)
story = {'schemaVersion': 1, 'status': 'extraction-only', 'source': 'source/renpy/game/script.rpy',
         'entryLabel': 'start', 'definitions': definitions, 'labels': labels}
dump(OUT / 'story.extracted.json', story)
report = {'sourceDirectory': '../Orsk-1.0-win/game', 'copiedFiles': sum(r['archived'] for r in inventory),
          'omittedFiles': [r['path'] for r in inventory if not r['archived']],
          'copiedBytes': sum(r['bytes'] for r in inventory if r['archived']),
          'labels': len(labels), 'nodeCounts': dict(counts), 'assets': dict(Counter(a['category'] for a in assets)),
          'unsupportedNodes': unknown, 'missingJumpTargets': missing_targets, 'missingImages': missing_images,
          'verifiedCopiesSHA256': True}
traceback_source = SOURCE.parent / 'traceback.txt'
if traceback_source.is_file():
    evidence = ROOT / 'source' / 'build-info' / 'traceback.txt'
    evidence.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(traceback_source, evidence)
    report['buildEvidence'] = {'path': 'source/build-info/traceback.txt', 'sha256': digest(evidence)}
dump(OUT / 'extraction-report.json', report)

md = ['# Орский движ — полный сценарий', '',
      'Автоматическая читательская выгрузка `source/renpy/game/script.rpy`. Текст, повторы и ошибки сохранены. '
      'Номера строк относятся к оригиналу. Вложенные списки сохраняют принадлежность реплик к вариантам. '
      'Внутри меню обычная реплика служит подписью меню. Комментарии и исходное форматирование доступны в `.rpy`.', '',
      '## Оглавление', '']
md += [f'- [{label["id"]}](#{label["id"]})' for label in labels]
md.append('')


def render(nodes, depth=0):
    result = []
    for node in nodes:
        kind = node['type']
        if kind == 'text':
            text = (f'**{node["speaker"]}:** ' if 'speaker' in node else '') + node['text']
        elif kind == 'choice':
            text = '**ВЫБОР:** ' + node['text']
        elif kind == 'menu':
            text = '**МЕНЮ**'
        elif kind == 'scene':
            text = f'🖼 Сцена: `{node["image"]}`'
        elif kind == 'jump':
            text = f'→ Переход: [{node["target"]}](#{node["target"]})'
        elif kind == 'return':
            text = '↩ `return` — завершить текущий проход / вернуться из вызова'
        else:
            text = '`' + node['raw'] + '`'
        result.extend(['    ' * depth + f'- {text} _(строка {node["line"]})_', ''])
        result.extend(render(node.get('children', []), depth + 1))
    return result


for label in labels:
    md.extend([f'## {label["id"]}', '', f'Исходник: строка {label["line"]}.', ''])
    md.extend(render(label['nodes']))
(DOCS / 'STORY.md').write_text('\n'.join(md), encoding='utf-8')
graph = ['# Карта переходов', '', 'Карта всех явных `jump`; подпись ребра — строка исходника. '
         'Вложенные выборы и промежуточные реплики см. в [сценарии](STORY.md). Возвраты не показаны.', '', '```mermaid', 'flowchart TD']
for label in labels:
    graph.append(f'    {label["id"]}["{label["id"]}"]')
for label in labels:
    for node in walk(label['nodes']):
        if node['type'] == 'jump':
            graph.append(f'    {label["id"]} -->|L{node["line"]}| {node["target"]}')
graph.extend(['```', ''])
(DOCS / 'BRANCHES.md').write_text('\n'.join(graph), encoding='utf-8')
catalog = ['# Каталог ресурсов', '', 'Оригинальные файлы сохранены без конвертации. Размеры: ширина × высота. '
           'Имя Ren’Py определяется именем файла без расширения; папка `bg` сама по себе не добавляет префикс `bg`.', '',
           '| Файл | Категория | Размеры | Использование в сценарии |', '| --- | --- | --- | --- |']
for asset in assets:
    size = ' × '.join(map(str, asset.get('dimensions') or [])) or '—'
    uses = ', '.join(map(str, asset.get('usedAtLines', []))) or '—'
    url = '../' + asset['source'].replace(' ', '%20')
    catalog.append(f'| [{asset["path"]}]({url}) | {asset["category"]} | {size} | {uses} |')
catalog.extend(['', '## Иллюстрации', ''])
for asset in assets:
    if asset['category'] == 'images':
        catalog.extend([f'### {asset["renpyName"]}', '', f'![{asset["renpyName"]}](../{asset["source"].replace(" ", "%20")})', ''])
(DOCS / 'ASSETS.md').write_text('\n'.join(catalog), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
if unknown or missing_targets:
    raise SystemExit('Extraction requires review: unsupported syntax or broken jumps')
