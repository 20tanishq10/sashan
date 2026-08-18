// SHASN — the four Ideologue marks.
//
// Traced from the resource tokens printed in the rulebook (p.3), so an Ideology
// Card's back reads the same as the resource it pays:
//
//   The Capitalist / Campaign Funds   a faceted gem
//   The Supremo    / Street Clout     a raised fist with rays
//   The Showstopper/ Media Attention  an eye inside an aperture
//   The Idealist   / Public Trust     a star with rays
//
// Drawn as line art on a filled disc, matching the tokens.

export default function IdeologueMark({ ideologue, size = 28, color = 'currentColor', stroke = 1.6 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 48 48',
    fill: 'none',
    stroke: color,
    strokeWidth: stroke,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
    style: { display: 'block' },
  }

  switch (ideologue) {
    // ── Faceted gem ────────────────────────────────────────────────────────
    case 'capitalist':
      return (
        <svg {...common}>
          <path d="M24 7 L40 18 L40 30 L24 41 L8 30 L8 18 Z" />
          <path d="M24 7 L31 18 L24 24 L17 18 Z" />
          <path d="M8 18 L17 18 L24 24 L17 32 Z" />
          <path d="M40 18 L31 18 L24 24 L31 32 Z" />
          <path d="M24 41 L17 32 L24 24 L31 32 Z" />
        </svg>
      )

    // ── Raised fist with rays ──────────────────────────────────────────────
    case 'supremo':
      return (
        <svg {...common}>
          <path d="M18 42 L18 26 q0-4 4-4 h8 q4 0 4 4 v16 Z" />
          <path d="M19 24 v-6 q0-2 2-2 t2 2 v6" />
          <path d="M23 23 v-8 q0-2 2-2 t2 2 v8" />
          <path d="M27 23 v-7 q0-2 2-2 t2 2 v7" />
          <path d="M31 24 v-4 q0-2 2-2 t2 2 v5" />
          <path d="M12 20 L7 15 M36 20 L41 15 M24 10 L24 5 M15 13 L12 8 M33 13 L36 8" />
        </svg>
      )

    // ── Eye inside an aperture ─────────────────────────────────────────────
    case 'showstopper':
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="17" />
          <path d="M24 7 L34 14 M41 24 L31 31 M24 41 L14 34 M7 24 L17 17" />
          <path d="M10 24 q14-11 28 0 q-14 11-28 0 Z" />
          <circle cx="24" cy="24" r="4.5" />
        </svg>
      )

    // ── Star with rays ─────────────────────────────────────────────────────
    case 'idealist':
    default:
      return (
        <svg {...common}>
          <path d="M24 10 L28.6 20.2 L39.5 21.4 L31.4 28.8 L33.7 39.5 L24 34.1 L14.3 39.5 L16.6 28.8 L8.5 21.4 L19.4 20.2 Z" />
          <path d="M24 4 v3 M40 11 l-2.2 2.2 M8 11 l2.2 2.2 M44 26 h-3 M4 26 h3" />
        </svg>
      )
  }
}
