// Independent artwork adaptations, not official event logos or supplied designs.
export function frameDecoration(o) {
  return `<path d="M 40 540 H 110 M 970 540 H 1040" stroke="#${o.badgeLabelColor}" stroke-width="5"/>`;
}

export function announcementDecoration(o) {
  return `<g data-decoration="template"><defs><linearGradient id="template-blue"><stop stop-color="#${o.headerColor}"/><stop offset="1" stop-color="#00A7F4"/></linearGradient></defs><path d="M 300 292 H 780" stroke="url(#template-blue)" stroke-width="6"/></g>`;
}

// The shared renderer supplies its safe, font-metric-aware text helper.
export function announcementHeading(event, o, fonts, text) {
  return text(event.name, 540, 231, o.headerColor, 928, 98, 65, fonts.display);
}
