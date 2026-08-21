// SHASN — design tokens, for the components that style inline.
//
// These are the same tokens declared in styles/globals.css. Most components just
// write the `var(--token)` string inline, which React passes through untouched;
// this module exists for the two places that cannot do that — somewhere wanting
// a named constant, and the board, which needs literal values (below).
//
// The rule the palette follows, and it matters MORE under ornament rather than
// less: the five player colours and the four resource colours are the only hues
// doing a job. Everything else — brass, lacquer, ivory, indigo — is furniture.
// Ornament lives in the chrome so the things you have to read stay findable.

export const T = {
  // Surfaces
  bg: 'var(--bg)',
  bg2: 'var(--bg-2)',
  surface: 'var(--surface)',
  surface2: 'var(--surface-2)',
  surface3: 'var(--surface-3)',

  // Lines
  border: 'var(--border)',
  border2: 'var(--border-2)',
  border3: 'var(--border-3)',

  // Text
  ink: 'var(--ink)',
  ink2: 'var(--ink-2)',
  ink3: 'var(--ink-3)',
  onDark: 'var(--on-dark)',

  // The one accent
  accent: 'var(--accent)',
  accentInk: 'var(--accent-ink)',
  accentBg: 'var(--accent-bg)',
  accentBrd: 'var(--accent-brd)',

  // State
  danger: 'var(--danger)',
  dangerBg: 'var(--danger-bg)',
  dangerBrd: 'var(--danger-brd)',
  amber: 'var(--amber)',
  amberBg: 'var(--amber-bg)',
  amberBrd: 'var(--amber-brd)',
  good: 'var(--good)',
  goodBg: 'var(--good-bg)',
  goodBrd: 'var(--good-brd)',

  // Board
  boardBg: 'var(--board-bg)',
  zone: 'var(--zone)',
  zone2: 'var(--zone-2)',
  zone3: 'var(--zone-3)',
  zoneLine: 'var(--zone-line)',
  pip: 'var(--pip)',
  pipLine: 'var(--pip-line)',

  // Shape
  rSm: 'var(--r-sm)',
  r: 'var(--r)',
  rMd: 'var(--r-md)',
  rLg: 'var(--r-lg)',
  rXl: 'var(--r-xl)',

  // Elevation
  sh1: 'var(--sh-1)',
  sh2: 'var(--sh-2)',
  sh3: 'var(--sh-3)',
  sh4: 'var(--sh-4)',

  // Type
  sans: 'var(--sans)',
  mono: 'var(--mono)',

  // Motion
  ease: 'var(--ease)',
  easeOut: 'var(--ease-out)',
  easePop: 'var(--ease-pop)',
}

/**
 * SVG cannot always resolve `var()` in every attribute across every renderer
 * (notably inside `filter` and gradient stops), so the board keeps literal
 * values. These must stay in step with :root.
 */
export const RAW = {
  p: ['#6c3fb5', '#b3167a', '#12a09a', '#7d9422', '#3d3a38', '#a0522d'],
  ink: '#241708',
  ink2: '#5a4526',
  ink3: '#8b7550',
  surface: '#f7edd9',
  boardBg: '#1d1409',
  zone: '#f3e6cd',
  zone2: '#ecdcbd',
  zone3: '#e2cfa8',
  zoneLine: '#8a5f11',
  pip: '#fdf7e9',
  pipLine: '#b5975f',
  danger: '#c1272d',
  accent: '#e08214',
}
