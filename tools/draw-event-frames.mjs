// Draws the project's own interim avatar-frame artwork: one square SVG per role for
// an edition whose organizers have not supplied frames yet. The result follows the
// supplied-frame format (events/README.md): opaque square, one transparent circular
// photo window. It is a stand-in, not official event artwork; replace it with the
// organizers' PNGs when they arrive.
//
//   node tools/draw-event-frames.mjs <edition> <output-directory>         SVG only
//   node tools/draw-event-frames.mjs <edition> <output-directory> --png   SVG and PNG
//
// --png rasterizes with a browser, which is not an application dependency. Set
// PLAYWRIGHT_MODULE and CHROMIUM as the browser acceptance scripts do. Copy the PNGs
// into the event's frames/ folder, record them in its manifest.json, then run
// tools/build-event-frames.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EVENTS, ROLES } from '../events/catalog.js';
import { EVENT_FONT_CSS, EVENT_FONTS, eventInkCenter } from '../events/fonts.js';
import { EVENT_ARTWORK } from '../events/artwork.js';
import { fitEventText, eventTextAttributes } from '../events/social.js';
import { DEFAULT_COLORS } from '../shared/options.js';
import { xml } from '../shared/svg.js';

export const FRAME_SIZE = 1080;
// Photo window, in output pixels. Record the same values in the manifest.
export const FRAME_WINDOW = Object.freeze({ cx: 540, cy: 540, r: 400 });
const RING = 463; // Radial centerline of the lettering.
const RING_EDGE = 526;

// Center the fitted glyph ink on the ring's centerline, not the font line box. Each
// face has its own outline-derived vertical metrics (including cap overshoot).
function baseline(fitted, top) {
  return RING + (top ? -1 : 1) * fitted.size * eventInkCenter(fitted.text, fitted.face);
}
function arc(id, radius, top) {
  return `<path id="${id}" d="M ${540 - radius} 540 A ${radius} ${radius} 0 0 ${top ? 1 : 0} ${540 + radius} 540"/>`;
}
function curved(fitted, id, color, width) {
  return `<text ${eventTextAttributes(fitted, color, width)}><textPath href="#${id}" startOffset="50%">${xml(fitted.text)}</textPath></text>`;
}

export function drawFrame(eventId, roleId) {
  const event = EVENTS.find(item => item.id === eventId);
  const role = ROLES.find(item => item.id === roleId);
  if (!event || !role) throw new Error(`Unknown edition or role: ${eventId} ${roleId}`);
  if (!Object.hasOwn(EVENT_ARTWORK, event.id)) throw new Error(`${eventId} has no drawn design in events/artwork.js to draw frames from.`);
  const o = { ...DEFAULT_COLORS, ...event.colors };
  const fonts = EVENT_FONTS[event.id];
  const eventText = fitEventText(event.label.toUpperCase(), 1100, 56, 48, fonts.display);
  const roleText = fitEventText(role.statement.toUpperCase(), 900, 54, 48, fonts.emphasis);
  const { cx, cy, r } = FRAME_WINDOW;
  const out = [];
  // Opaque ground to every edge, with the photo window cut out.
  out.push(`<path data-field="ground" fill-rule="evenodd" fill="#${o.foreground}" d="M 0 0 H ${FRAME_SIZE} V ${FRAME_SIZE} H 0 Z M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z"/>`);
  // Decoration and lettering stay inside the ring, clear of the photo.
  out.push(`<defs><clipPath id="frame-ring"><path clip-rule="evenodd" d="M ${540 - RING_EDGE} 540 A ${RING_EDGE} ${RING_EDGE} 0 1 0 ${540 + RING_EDGE} 540 A ${RING_EDGE} ${RING_EDGE} 0 1 0 ${540 - RING_EDGE} 540 Z M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z"/></clipPath>${arc('event-arc', baseline(eventText, true), true)}${arc('role-arc', baseline(roleText, false), false)}</defs>`);
  out.push('<g clip-path="url(#frame-ring)">');
  out.push(`<g data-decoration="frame">${EVENT_ARTWORK[event.id].frameDecoration(o)}</g>`);
  out.push(`<g data-field="event">${curved(eventText, 'event-arc', o.headerColor, 1100)}</g>`);
  out.push(`<g data-field="role">${curved(roleText, 'role-arc', o.headerColor, 900)}</g>`);
  out.push('</g>');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_SIZE}" height="${FRAME_SIZE}" viewBox="0 0 ${FRAME_SIZE} ${FRAME_SIZE}" data-event="${event.id}" data-role="${role.id}"><style>${EVENT_FONT_CSS[event.id]}</style>${out.join('')}</svg>`;
}

async function rasterize(files) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: FRAME_SIZE, height: FRAME_SIZE }, deviceScaleFactor: 1 });
    for (const { svg, png } of files) {
      await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
      // Lettering drawn in a fallback face would be wrong artwork: require every face.
      const missing = await page.evaluate(async () => {
        await document.fonts.ready;
        const faces = [...document.querySelectorAll('text')].map(node => getComputedStyle(node)).map(style => `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`);
        await Promise.all(faces.map(face => document.fonts.load(face)));
        return faces.filter(face => !document.fonts.check(face) || !document.fonts.size);
      });
      if (missing.length) throw new Error(`Event fonts did not load: ${missing.join('; ')}`);
      fs.writeFileSync(png, await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: FRAME_SIZE, height: FRAME_SIZE } }));
    }
  } finally { await browser.close(); }
}

async function main(argv) {
  const png = argv.includes('--png');
  const [edition, directory, ...rest] = argv.filter(item => item !== '--png');
  if (!edition || !directory || rest.length || !EVENTS.some(item => item.id === edition)) {
    throw new Error(`Usage: node tools/draw-event-frames.mjs <edition> <output-directory> [--png]\nEditions: ${EVENTS.map(item => item.id).join(', ')}`);
  }
  fs.mkdirSync(directory, { recursive: true });
  const files = ROLES.map(role => {
    const base = path.join(directory, `${edition}-${role.id}`);
    const svg = drawFrame(edition, role.id);
    fs.writeFileSync(`${base}.svg`, svg);
    return { svg, png: `${base}.png` };
  });
  if (png) await rasterize(files);
  console.log(`${files.length} ${png ? 'SVG and PNG' : 'SVG'} frames for ${edition} in ${directory}`);
  console.log(`Photo window: cx ${FRAME_WINDOW.cx}, cy ${FRAME_WINDOW.cy}, r ${FRAME_WINDOW.r} at ${FRAME_SIZE} x ${FRAME_SIZE}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exit(1); });
}
