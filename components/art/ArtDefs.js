// SHASN — the ornament library.
//
// Every pattern, gradient and filter in the game lives here, in one hidden SVG
// mounted once at the app root. Anything on the page can then reach them by id:
// `fill="url(#art-jali)"` in SVG, or `background: url(...)` nowhere at all —
// which is the point. Declaring a <pattern> inside each component would mean
// four copies of the same tile in the DOM and four ids to keep in step.
//
// There are no image files in this game. Every texture here is drawn: the jali
// screens, the block-printed grounds, the rangoli, the brass. That is not a
// compromise made for weight, though it does keep the page light — it is what
// lets a zone recolour to its holder's party, a token take an Ideologue's hue,
// and every surface stay sharp at any size.
//
// The vocabulary is deliberately architectural and textile rather than
// figurative: jali lattice, bandhani dots, block print, rangoli, brass and
// lacquer. Those traditions are geometric, which is exactly what SVG is good at,
// and they carry the right feeling without borrowing anybody's iconography.

export const ART = {
  jali: 'url(#art-jali)',
  jaliLight: 'url(#art-jali-light)',
  blockPrint: 'url(#art-block)',
  blockPrintDark: 'url(#art-block-dark)',
  rangoli: 'url(#art-rangoli)',
  bandhani: 'url(#art-bandhani)',
  weave: 'url(#art-weave)',
  brass: 'url(#art-brass)',
  brassDark: 'url(#art-brass-dark)',
  lacquer: 'url(#art-lacquer)',
  ivory: 'url(#art-ivory)',
  emboss: 'url(#art-emboss)',
  inset: 'url(#art-inset)',
  grain: 'url(#art-grain)',
  glow: 'url(#art-glow)',
}

export default function ArtDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        {/* ── Jali: a pierced stone screen ───────────────────────────────
            The lattice you see in Mughal architecture. Interlocking eight-point
            stars, which tile without a seam and read as ornament at any size. */}
        <pattern id="art-jali" width="44" height="44" patternUnits="userSpaceOnUse">
          <rect width="44" height="44" fill="var(--indigo-deep)" />
          <g fill="none" stroke="var(--brass)" strokeLinejoin="round">
            <path d="M22 0 44 22 22 44 0 22Z" strokeWidth="1.5" opacity="0.5" />
            <path d="M22 9 35 22 22 35 9 22Z" strokeWidth="1.1" opacity="0.38" />
            <path d="M0 0 9 9M44 0 35 9M0 44 9 35M44 44 35 35" strokeWidth="1.1" opacity="0.3" />
          </g>
          <g fill="var(--brass)">
            <circle cx="22" cy="22" r="2.6" opacity="0.45" />
            <circle cx="0" cy="0" r="2.2" opacity="0.3" />
            <circle cx="44" cy="0" r="2.2" opacity="0.3" />
            <circle cx="0" cy="44" r="2.2" opacity="0.3" />
            <circle cx="44" cy="44" r="2.2" opacity="0.3" />
          </g>
        </pattern>

        {/* The same screen cut in ivory, for panels that carry text. */}
        <pattern id="art-jali-light" width="44" height="44" patternUnits="userSpaceOnUse">
          <rect width="44" height="44" fill="var(--ivory)" />
          <g fill="none" stroke="var(--brass-dark)" strokeLinejoin="round" opacity="0.22">
            <path d="M22 0 44 22 22 44 0 22Z" strokeWidth="1.3" />
            <path d="M22 9 35 22 22 35 9 22Z" strokeWidth="1" />
          </g>
          <circle cx="22" cy="22" r="2.2" fill="var(--brass-dark)" opacity="0.18" />
        </pattern>

        {/* ── Block print: a hand-stamped textile ────────────────────────
            A single carved stamp, repeated. The slight weight difference
            between the two colours is what stops it reading as wallpaper. */}
        <pattern id="art-block" width="36" height="36" patternUnits="userSpaceOnUse">
          <rect width="36" height="36" fill="var(--ivory)" />
          <g fill="var(--vermilion)" opacity="0.42">
            <circle cx="18" cy="18" r="2.6" />
            <ellipse cx="18" cy="8.5" rx="2.4" ry="4.6" />
            <ellipse cx="18" cy="27.5" rx="2.4" ry="4.6" />
            <ellipse cx="8.5" cy="18" rx="4.6" ry="2.4" />
            <ellipse cx="27.5" cy="18" rx="4.6" ry="2.4" />
          </g>
          <g fill="var(--bottle)" opacity="0.3">
            <circle cx="0" cy="0" r="2" />
            <circle cx="36" cy="0" r="2" />
            <circle cx="0" cy="36" r="2" />
            <circle cx="36" cy="36" r="2" />
          </g>
        </pattern>

        <pattern id="art-block-dark" width="36" height="36" patternUnits="userSpaceOnUse">
          <rect width="36" height="36" fill="var(--lacquer)" />
          <g fill="var(--saffron)" opacity="0.2">
            <circle cx="18" cy="18" r="2.6" />
            <ellipse cx="18" cy="8.5" rx="2.4" ry="4.6" />
            <ellipse cx="18" cy="27.5" rx="2.4" ry="4.6" />
            <ellipse cx="8.5" cy="18" rx="4.6" ry="2.4" />
            <ellipse cx="27.5" cy="18" rx="4.6" ry="2.4" />
          </g>
        </pattern>

        {/* ── Rangoli: chalk and petals on a threshold ───────────────────
            Radial rather than gridded, so it reads as drawn by hand. */}
        <pattern id="art-rangoli" width="64" height="64" patternUnits="userSpaceOnUse">
          <rect width="64" height="64" fill="var(--bottle-deep)" />
          <g fill="none" stroke="var(--ivory)" strokeWidth="1" opacity="0.22">
            <circle cx="32" cy="32" r="19" />
            <circle cx="32" cy="32" r="12" />
            <path d="M32 13 36.5 27.5 51 32 36.5 36.5 32 51 27.5 36.5 13 32 27.5 27.5Z" />
          </g>
          <circle cx="32" cy="32" r="2.8" fill="var(--brass)" opacity="0.5" />
        </pattern>

        {/* ── Bandhani: tie-dye dots ─────────────────────────────────────
            The quietest of the grounds. Used where text has to stay readable. */}
        <pattern id="art-bandhani" width="22" height="22" patternUnits="userSpaceOnUse">
          <rect width="22" height="22" fill="transparent" />
          <g fill="currentColor" opacity="0.14">
            <circle cx="5" cy="5" r="1.7" />
            <circle cx="16" cy="16" r="1.7" />
            <circle cx="16" cy="5" r="1.1" />
            <circle cx="5" cy="16" r="1.1" />
          </g>
        </pattern>

        {/* ── Weave: the warp and weft of a mat ──────────────────────────
            Nearly invisible, and that is the job: it stops a large flat panel
            reading as a rectangle of paint. */}
        <pattern id="art-weave" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="transparent" />
          <g stroke="currentColor" strokeWidth="0.7" opacity="0.09">
            <path d="M0 0h8M0 4h8" />
            <path d="M0 0v8M4 0v8" opacity="0.6" />
          </g>
        </pattern>

        {/* ── Metal and lacquer ──────────────────────────────────────────
            Brass wants four stops, not two: a highlight, the body, a shadow
            where it turns away, and a second catch at the bottom edge. Two
            stops gives you a plastic-looking ramp. */}
        <linearGradient id="art-brass" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor="#F6E1A0" />
          <stop offset="0.42" stopColor="#D9AD3E" />
          <stop offset="0.68" stopColor="#9C6E14" />
          <stop offset="1" stopColor="#E8CB74" />
        </linearGradient>

        <linearGradient id="art-brass-dark" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor="#C9A247" />
          <stop offset="0.5" stopColor="#8A5F11" />
          <stop offset="1" stopColor="#5C3D08" />
        </linearGradient>

        <radialGradient id="art-lacquer" cx="0.35" cy="0.28" r="0.9">
          <stop offset="0" stopColor="#31221A" />
          <stop offset="1" stopColor="#160F0B" />
        </radialGradient>

        <radialGradient id="art-ivory" cx="0.4" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#FDF6E7" />
          <stop offset="1" stopColor="#EBDCBE" />
        </radialGradient>

        {/* ── Relief ─────────────────────────────────────────────────────
            Ornament without light on it looks printed rather than made. */}
        <filter id="art-emboss" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.6" floodColor="#000" floodOpacity="0.5" />
          <feDropShadow dx="0" dy="-0.6" stdDeviation="0.4" floodColor="#FFF" floodOpacity="0.25" />
        </filter>

        <filter id="art-inset" x="-20%" y="-20%" width="140%" height="140%">
          <feOffset dx="0" dy="1.5" in="SourceAlpha" result="off" />
          <feGaussianBlur in="off" stdDeviation="1.4" result="blur" />
          <feComposite in="SourceAlpha" in2="blur" operator="out" result="cut" />
          <feFlood floodColor="#000" floodOpacity="0.45" result="dark" />
          <feComposite in="dark" in2="cut" operator="in" result="shade" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="shade" />
          </feMerge>
        </filter>

        {/* Paper grain, so ivory surfaces are not a flat wash. */}
        <filter id="art-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" result="noise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.5 0 0 0 0 0.45 0 0 0 0 0.35 0 0 0 0.09 0"
            result="tint"
          />
          <feComposite in="tint" in2="SourceGraphic" operator="atop" />
        </filter>

        {/* A lamp behind something — used where a zone changes hands. */}
        <filter id="art-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  )
}
