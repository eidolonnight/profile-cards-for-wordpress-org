// Observed rendered 2027 sites, checked 2026-10-03. Tokens only: safe for /events.
// These are adaptations, not official supplied card designs or certified roles.
const theme = (colors, styleNote) => Object.freeze({ colors: Object.freeze(colors), styleNote });
export const EVENT_THEMES = Object.freeze({
  'asia-2027': theme({ foreground: 'F4F1EA', headerColor: '000073', nameColor: '000073', subHeaderColor: '302F2F', badgeLabelColor: '005ED6' }, 'Based on the current Asia site: Faculty Glyphic, Kumbh Sans, cream/navy and botanical accents.'),
  'europe-2027': theme({ foreground: 'F9F9F9', headerColor: '111111', nameColor: '111111', subHeaderColor: '636363', badgeLabelColor: '111111' }, 'Based on the current neutral Europe announcement: Cardo, Inter and thin rules; not a final campaign identity.'),
  'us-2027': theme({ foreground: 'FFFFFF', headerColor: '0073AA', nameColor: '32373C', subHeaderColor: '32373C', badgeLabelColor: '0073AA' }, 'Based on the generic US coming-soon template: Open Sans and blue/white; event branding is not announced.'),
  'india-2027': theme({ foreground: '1A1A1A', headerColor: 'FAFAFA', nameColor: 'FAFAFA', subHeaderColor: 'D4D4D4', badgeLabelColor: 'FF8A3D' }, 'Based on the current India announcement: bold Cardo, Inter, dark ground and orange/green type; not a final host-city identity.')
});
