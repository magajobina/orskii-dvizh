import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import sharp from 'sharp';
import type { Plugin } from 'vite';

/** Ship compact WebP files; the editor and source illustrations stay untouched. */
export function gameImages(): Plugin {
  let production = false;
  let originalBytes = 0, outputBytes = 0;
  const prefix = '\0orsk-game-image:';
  return {
    name: 'orsk-game-images', enforce: 'pre',
    configResolved(config) { production = config.command === 'build'; },
    async resolveId(source, importer) {
      if (!source.endsWith('?game-image')) return;
      const resolved = await this.resolve(source.slice(0, -'?game-image'.length), importer, { skipSelf: true });
      if (resolved) return prefix + resolved.id;
    },
    async load(id) {
      if (!id.startsWith(prefix)) return;
      const file = id.slice(prefix.length);
      if (!production) return `export { default } from ${JSON.stringify(file + '?url')};`;
      const source = await readFile(file);
      const extension = extname(file).toLowerCase();
      const convert = ['.png', '.jpg', '.jpeg'].includes(extension);
      const bytes = convert ? await sharp(source).rotate().webp({ quality: 86, effort: 4 }).toBuffer() : source;
      originalBytes += source.length; outputBytes += bytes.length;
      const name = convert ? basename(file, extname(file)) + '.webp' : basename(file);
      const reference = this.emitFile({ type: 'asset', name, source: bytes });
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
    buildEnd(error) {
      if (production && !error) this.info(`Illustrations: ${(originalBytes / 1048576).toFixed(1)} MiB → ${(outputBytes / 1048576).toFixed(1)} MiB`);
    },
  };
}
