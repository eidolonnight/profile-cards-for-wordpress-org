// Independent artwork adaptations, not official event logos or supplied designs.
// Original vector adaptations of observed botanical accents, not event logos.
function leaf(x, y, scale) {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M 0 78 C -76 10 -48 -66 44 -98 C 66 -22 73 42 0 78 Z" fill="#00513B"/><path d="M 0 78 Q 12 -10 44 -98 M 9 27 L -28 -4 M 17 0 L 52 -23 M 25 -30 L -3 -52 M 34 -58 L 54 -62" fill="none" stroke="#8BB1C4" stroke-width="2"/></g>`;
}
function flower(x, y, scale) {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M 0 12 C -80 70 -82 -6 -31 -13 C -85 -73 -11 -92 4 -40 C 39 -101 88 -44 47 -13 C 112 7 62 70 25 31 C 17 92 -45 82 -21 29 Z" fill="#A52B20"/><path d="M -5 9 Q 25 -7 57 -53" fill="none" stroke="#FCC626" stroke-width="5"/></g>`;
}
export function frameDecoration(o) {
  return leaf(997, 534, 0.54) + flower(82, 553, 0.52);
}

export function announcementDecoration(o) {
  return `<g data-decoration="botanical"><defs><clipPath id="botanical-sides"><path d="M 0 335 H 194 V 965 H 0 Z M 886 335 H 1080 V 965 H 886 Z"/></clipPath></defs><g clip-path="url(#botanical-sides)">${leaf(1040, 425, 1.35)}${flower(42, 893, 1.25)}</g><path d="M 495 340 H 585" stroke="#FCC626" stroke-width="5"/></g>`;
}

// The shared renderer supplies its safe, font-metric-aware text helper.
export function announcementHeading(event, o, fonts, text) {
  // Keep a literal separating space for accessible text and field consumers.
  const customHeader = o.headerColor !== event.colors.headerColor;
  const first = text('WordCamp ', 540, 202, o.headerColor, 920, 101, 82, fonts.display).replace('>WordCamp</text>', '>WordCamp </text>');
  const last = text('Asia', 540, 316, customHeader ? o.headerColor : o.badgeLabelColor, 830, 110, 82, fonts.display);
  return first + last;
}
