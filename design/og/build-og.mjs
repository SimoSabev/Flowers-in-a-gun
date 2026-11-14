// Builds public/brand/og-default.png (1200x630): the share image for pages without their own photo.
// Run: node design/og/build-og.mjs
import sharp from 'sharp';
import fs from 'node:fs';

const W = 1200, H = 630;
const logo = await sharp(fs.readFileSync('public/brand/logo-compact.svg'), { density: 300 }).resize({ width: 940 }).png().toBuffer();
const meta = await sharp(logo).metadata();
const plateH = meta.height + 64;
const plate = await sharp({ create: { width: 1004, height: plateH, channels: 4, background: '#ffffff' } })
  .composite([{ input: logo, left: 32, top: 32 }]).png().toBuffer();
await sharp({ create: { width: W, height: H, channels: 4, background: '#0d0d0c' } })
  .composite([
    { input: plate, left: 98, top: Math.round((H - plateH) / 2) - 20 },
    { input: { create: { width: W, height: 18, channels: 4, background: '#d8ff3c' } }, left: 0, top: H - 18 },
  ])
  .png().toFile('public/brand/og-default.png');
console.log('public/brand/og-default.png');
