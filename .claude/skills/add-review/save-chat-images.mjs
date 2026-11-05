// Зберігає останні зображення з чату Claude Code у файли: на диску їх може не бути,
// а в журналі сесії вони лежать в оригінальному вигляді.
//
//   node .claude/skills/add-review/save-chat-images.mjs [--count 1] [--out _reviews]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT } from '../../../server/config.js';

const { values: args } = parseArgs({
  options: {
    count: { type: 'string', default: '1' },
    out: { type: 'string', default: path.join(ROOT, '_reviews') },
  },
});

const EXTENSIONS = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const sessionsDir = path.join(os.homedir(), '.claude', 'projects', ROOT.replaceAll('/', '-'));

function latestSession() {
  const files = fs.readdirSync(sessionsDir).filter((name) => name.endsWith('.jsonl'));
  const byTime = files.map((name) => ({ name, time: fs.statSync(path.join(sessionsDir, name)).mtimeMs }));
  return path.join(sessionsDir, byTime.sort((a, b) => b.time - a.time)[0].name);
}

function imagesIn(file) {
  const images = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"type":"image"')) continue;
    const content = JSON.parse(line).message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type === 'image' && item.source?.type === 'base64') images.push(item.source);
    }
  }
  return images;
}

const images = imagesIn(latestSession());
const picked = images.slice(-Number(args.count));
if (!picked.length) {
  console.error('✗ У журналі сесії немає зображень');
  process.exit(1);
}
fs.mkdirSync(args.out, { recursive: true });
const stamp = Date.now();
picked.forEach((image, index) => {
  const file = path.join(args.out, `chat-${stamp}-${index + 1}${EXTENSIONS[image.media_type] ?? '.png'}`);
  fs.writeFileSync(file, Buffer.from(image.data, 'base64'));
  console.log(file);
});
