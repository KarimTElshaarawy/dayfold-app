import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { loadConfig } from './config.mjs';

/**
 * One source image in, every icon and splash input out.
 * assets/source.png is a transparent mark; swap it and run this again (CI does).
 */
const cfg = loadConfig();
const out = resolve('assets');
mkdirSync(out, { recursive: true });
const source = resolve(cfg.iconSource);

const mark = async (size, fraction) => {
  const inner = Math.round(size * fraction);
  return sharp(source).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
};

const place = async (size, fraction, background) => {
  const m = await mark(size, fraction);
  const base = sharp({ create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } } });
  return base.composite([{ input: m, gravity: 'center' }]);
};

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 };
};

// iOS app icon: opaque, mark fills about 64 percent
await (await place(1024, 0.64, hex(cfg.iconBackground))).flatten({ background: hex(cfg.iconBackground) }).png().toFile(resolve(out, 'icon-only.png'));
// Android adaptive icon: foreground inside the 66 percent safe zone, solid background layer
await (await place(1024, 0.56)).png().toFile(resolve(out, 'icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: hex(cfg.iconBackground) } }).png().toFile(resolve(out, 'icon-background.png'));
// splash screens (light and dark use the same calm background)
for (const name of ['splash.png', 'splash-dark.png']) {
  await (await place(2732, 0.22, hex(cfg.splashBackground))).flatten({ background: hex(cfg.splashBackground) }).png().toFile(resolve(out, name));
}
console.log(`assets generated from ${cfg.iconSource}`);
