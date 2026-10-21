import { theme as asiaTheme, layout as asiaLayout } from './wordcamp-asia/theme.js';
import { theme as europeTheme, layout as europeLayout } from './wordcamp-europe/theme.js';
import { theme as usTheme, layout as usLayout } from './wordcamp-us/theme.js';
import { theme as indiaTheme, layout as indiaLayout } from './wordcamp-india/theme.js';

export const EVENT_THEMES = Object.freeze({
  'asia-2027': asiaTheme,
  'europe-2027': europeTheme,
  'us-2027': usTheme,
  'india-2027': indiaTheme
});

// Renderer-only preferences stay separate from public palette/style tokens.
export const EVENT_LAYOUTS = Object.freeze({
  'asia-2027': asiaLayout,
  'europe-2027': europeLayout,
  'us-2027': usLayout,
  'india-2027': indiaLayout
});
