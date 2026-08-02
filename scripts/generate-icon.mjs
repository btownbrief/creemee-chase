// Dependency-free PNG companion for icon.svg. Run from the repository root.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const width = 180;
const height = 180;
const pixels = new Uint8Array(width * height * 4);
const colors = {
  sky: [142, 215, 209, 255], ink: [36, 49, 58, 255], sun: [255, 232, 121, 255],
  hill: [63, 141, 129, 255], cone: [212, 155, 83, 255], cream: [255, 249, 228, 255],
  maple: [216, 138, 53, 255], chocolate: [111, 70, 50, 255], raspberry: [217, 79, 115, 255],
};
function pixel(x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (Math.floor(y) * width + Math.floor(x)) * 4;
  pixels.set(color, i);
}
function circle(cx, cy, radius, color) {
  for (let y = Math.floor(cy-radius); y <= Math.ceil(cy+radius); y++) {
    for (let x = Math.floor(cx-radius); x <= Math.ceil(cx+radius); x++) {
      if ((x-cx)**2 + (y-cy)**2 <= radius**2) pixel(x,y,color);
    }
  }
}
function polygon(points, color) {
  const minY = Math.floor(Math.min(...points.map((p) => p[1])));
  const maxY = Math.ceil(Math.max(...points.map((p) => p[1])));
  for (let y=minY; y<=maxY; y++) for (let x=0; x<width; x++) {
    let inside = false;
    for (let i=0,j=points.length-1; i<points.length; j=i++) {
      const [xi,yi]=points[i], [xj,yj]=points[j];
      if ((yi>y)!==(yj>y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
    }
    if (inside) pixel(x,y,color);
  }
}
for (let y=0;y<height;y++) for (let x=0;x<width;x++) pixel(x,y,colors.sky);
circle(143,37,27,colors.sun);
polygon([[0,142],[31,119],[56,132],[83,106],[109,130],[137,110],[180,139],[180,180],[0,180]],colors.hill);
polygon([[59,97],[91,170],[123,97]],colors.ink);
polygon([[67,103],[91,160],[115,103]],colors.cone);
circle(86,78,29,colors.ink); circle(111,70,27,colors.ink); circle(127,85,24,colors.ink); circle(75,92,24,colors.ink);
circle(86,78,22,colors.cream); circle(111,70,20,colors.cream); circle(127,85,17,colors.cream); circle(75,92,17,colors.cream);
circle(44,73,12,colors.ink); circle(44,73,7,colors.maple);
circle(36,102,12,colors.ink); circle(36,102,7,colors.chocolate);
circle(144,103,12,colors.ink); circle(144,103,7,colors.raspberry);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit=0;bit<8;bit++) crc = (crc>>>1) ^ (0xedb88320 & -(crc&1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const payload = Buffer.concat([name,data]);
  const out = Buffer.alloc(data.length+12);
  out.writeUInt32BE(data.length,0); payload.copy(out,4); out.writeUInt32BE(crc32(payload),data.length+8);
  return out;
}
const raw = Buffer.alloc((width*4+1)*height);
for (let y=0;y<height;y++) {
  raw[y*(width*4+1)] = 0;
  Buffer.from(pixels.buffer,y*width*4,width*4).copy(raw,y*(width*4+1)+1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4); ihdr.set([8,6,0,0,0],8);
writeFileSync('icon-180.png', Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',ihdr), chunk('IDAT',deflateSync(raw)), chunk('IEND',Buffer.alloc(0)),
]));
console.log('wrote icon-180.png (180 × 180)');
