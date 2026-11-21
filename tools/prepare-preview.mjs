import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJSON = async (name) => JSON.parse(await readFile(path.join(root, 'content', name), 'utf8'));
const story = await readJSON('story.extracted.json');
const assets = await readJSON('assets.json');
const labels = new Map(story.labels.map(label => [label.id, label]));
const specifications = [
  { id: 'startt', title: 'Добро пожаловать в Орск', short: 'Приезд в Орск', location: 'Балкон гостиницы', note: 'Первая практика. Первые плохие решения.' },
  { id: 'viotsidelli', title: 'Пропуск в лучшую жизнь', short: 'Наземка и жигули', location: 'Гостиница', note: 'Наземная подготовка и предложение Ярика.' },
  { id: 'dalee', title: 'Культурная программа', short: 'Самолёт и «Трава»', location: 'Бар «Трава»', note: 'Помыть самолёт. Помыть самолёт изнутри себя.' },
  { id: 'gostichkayarik', title: 'Выучить. Сдать. Выжить.', short: 'Сдача ФАПов', location: 'АТБ', note: 'Акашев знает, где вас найти.' },
];
const publicAssets = path.join(root, 'public/assets/images');
await mkdir(publicAssets, { recursive: true });
const licenses = path.join(root, 'public/licenses');
await mkdir(licenses, { recursive: true });
for (const font of ['golos-text', 'oswald']) {
  await copyFile(path.join(root, 'node_modules/@fontsource-variable', font, 'LICENSE'), path.join(licenses, `${font}-OFL.txt`));
}
await mkdir(path.join(root, 'src/content'), { recursive: true });
const usedAssets = new Map();

async function imageFor(name) {
  const asset = assets.find(asset => asset.renpyName === name);
  if (!asset) throw Error(`Missing preview asset: ${name}`);
  const filename = name.replaceAll(' ', '-') + path.extname(asset.path).toLowerCase();
  await copyFile(path.join(root, asset.source), path.join(publicAssets, filename));
  usedAssets.set(name, asset.source);
  return `assets/images/${filename}`;
}

// Preview only: inspect the first original choice and one following text/menu.
// We deliberately stop before playing the remaining story.
function firstResponse(steps, visited = new Set()) {
  for (const node of steps) {
    if (node.type === 'text') return node.text;
    if (node.type === 'menu') return node.children.find(child => child.type === 'text')?.text ?? 'Выбор сделан.';
    if (node.type === 'jump') {
      if (visited.has(node.target)) throw Error(`Unexpected automatic cycle: ${node.target}`);
      visited.add(node.target);
      return firstResponse(labels.get(node.target).nodes, visited);
    }
    if (node.type === 'return') break;
  }
  return 'Выбор сделан.';
}

const chapters = [];
for (const spec of specifications) {
  const label = labels.get(spec.id);
  const index = label.nodes.findIndex(node => node.type === 'menu');
  if (index < 0) throw Error(`No menu in ${spec.id}`);
  const preceding = label.nodes.slice(0, index);
  const menu = label.nodes[index];
  const scene = preceding.filter(node => node.type === 'scene').at(-1);
  const caption = menu.children.filter(node => node.type === 'text').map(node => node.text).join('\n');
  const choices = menu.children.filter(node => node.type === 'choice');
  chapters.push({ ...spec, sourceLine: menu.line, image: await imageFor(scene.image),
    text: caption || preceding.filter(node => node.type === 'text').at(-1)?.text || '',
    choices: choices.map(choice => ({ id: choice.id, text: choice.text,
      response: firstResponse(choice.children || []), sourceLine: choice.line })) });
}
const data = { menuImage: await imageFor('main_menu'), chapters };
await writeFile(path.join(root, 'src/content/preview.json'), JSON.stringify(data, null, 2) + '\n');
console.log(`Prepared ${usedAssets.size} original illustrations and ${chapters.length} chapter previews. No Ren'Py GUI assets included.`);
