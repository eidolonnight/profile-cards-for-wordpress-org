// Independent artwork adaptations, not official event logos or supplied designs.
export function frameDecoration(o) {
  return `<path d="M 40 540 H 110 M 970 540 H 1040" stroke="#${o.badgeLabelColor}" stroke-width="2"/>`;
}

export function announcementDecoration(o) {
  return `<g data-decoration="editorial" fill="none" stroke="#${o.headerColor}" stroke-width="1"><path d="M 76 130 H 1004 M 76 312 H 1004 M 76 980 H 1004"/></g>`;
}

// The shared renderer supplies its safe, font-metric-aware text helper.
export function announcementHeading(event, o, fonts, text) {
  return text(event.name, 76, 259, o.headerColor, 928, 89, 65, fonts.display, 'start');
}
