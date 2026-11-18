import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const source = await readFile(new URL("../public/icons/cateringms-favicon-source.png", import.meta.url));
const trimmed = await sharp(source).trim().png().toBuffer();
const brandRevision = "20261118-3";
const sizes = [16, 32, 48, 256];
const background = { r: 0, g: 0, b: 0, alpha: 0 };
async function render(size, insetRatio = 0.04) {
  const inset = Math.max(1, Math.round(size * insetRatio));
  return sharp(trimmed)
    .resize(size - inset * 2, size - inset * 2, { fit: "contain", background })
    .extend({ top: inset, bottom: inset, left: inset, right: inset, background })
    .png()
    .toBuffer();
}
const images = await Promise.all(sizes.map(size => render(size)));
const [mark, app192, app512, apple] = await Promise.all([
  render(128),
  render(192, 0.08),
  render(512, 0.08),
  render(180, 0.08),
]);
const directory = Buffer.alloc(6 + images.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);

let offset = directory.length;
for (const [index, image] of images.entries()) {
  const entry = 6 + index * 16;
  directory.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry);
  directory.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry + 1);
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(image.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += image.length;
}

await Promise.all([
  writeFile(new URL("../public/icons/cateringms-favicon-16.png", import.meta.url), images[0]),
  writeFile(new URL("../public/icons/cateringms-favicon-32.png", import.meta.url), images[1]),
  writeFile(new URL(`../public/icons/cateringms-mark-128-${brandRevision}.png`, import.meta.url), mark),
  writeFile(new URL("../public/icons/cateringms-192.png", import.meta.url), app192),
  writeFile(new URL("../public/icons/cateringms-512.png", import.meta.url), app512),
  writeFile(new URL("../public/icons/cateringms-apple-touch-180.png", import.meta.url), apple),
  writeFile(new URL("../public/logo.png", import.meta.url), app512),
  writeFile(new URL("../public/favicon.ico", import.meta.url), Buffer.concat([directory, ...images])),
]);
