// Independent artwork adaptations, not official event logos or supplied designs.
export function frameDecoration(o) {
  return `<path d="M 36 514 H 110 M 970 564 H 1044" stroke="#${o.badgeLabelColor}" stroke-width="7"/><path d="M 36 564 H 110 M 970 514 H 1044" stroke="#3DD68C" stroke-width="7"/>`;
}

export function announcementDecoration(o) {
  return `<g data-decoration="typographic"><path d="M 76 128 H 1004 M 76 980 H 1004" stroke="#${o.subHeaderColor}" stroke-opacity="0.35"/><path d="M 940 173 H 984 V 217 H 940 Z" fill="#${o.badgeLabelColor}"/><path d="M 940 236 H 984 V 280 H 940 Z" fill="none" stroke="#3DD68C" stroke-width="2"/></g>`;
}

// The shared renderer supplies its safe, font-metric-aware text helper.
export function announcementHeading(event, o, fonts, text) {
  // Keep a literal separating space for accessible text and field consumers.
  const customHeader = o.headerColor !== event.colors.headerColor;
  const first = text('WordCamp ', 76, 223, customHeader ? o.headerColor : o.badgeLabelColor, 830, 122, 82, fonts.display, 'start').replace('>WordCamp</text>', '>WordCamp </text>');
  const last = text('India', 76, 326, customHeader ? o.headerColor : '3DD68C', 830, 122, 82, fonts.display, 'start');
  return first + last;
}
