// SHASN — the four deck glyphs.
//
// Conspiracy was identified by a red hairline and Headline by an amber one,
// which are the Street Clout and Public Trust hues. That is the same collision
// the voter tokens had: two different families of thing, told apart by colour
// alone, in a palette where those colours already mean something else.
//
// So each deck gets a mark. Line art, matching the Ideologue devices, because in
// this system an outline is furniture — a resource, a deck, a rule — while a
// solid silhouette is a player. The tone colour stays, but it is now the second
// thing carrying the message rather than the only one.
//
//   Ideology    a forking path      you are choosing a direction, not a payout
//   Conspiracy  a keyhole           bought in private, played out of turn
//   Headline    a megaphone         it happens TO you, loudly
//   Voter       three figures       the thing you are actually buying

export const DECK_TONES = {
  ideology: 'var(--border-3)', // neutral until an answer reveals the Ideologue
  conspiracy: 'var(--danger)',
  headline: 'var(--amber)',
  voter: 'var(--border-3)',
}

export const DECK_LABELS = {
  ideology: 'Ideology',
  conspiracy: 'Conspiracy',
  headline: 'Headline',
  voter: 'Voters',
}

export default function DeckGlyph({ deck, size = 14, color = 'currentColor', stroke = 3.4 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 48 48',
    fill: 'none',
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: { display: 'block', flexShrink: 0 },
    'aria-hidden': true,
  }

  switch (deck) {
    // ── A forking path ─────────────────────────────────────────────────────
    case 'ideology':
      return (
        <svg {...common}>
          <path d="M24 42V27" />
          <path d="M24 27 11 15" />
          <path d="M24 27 37 15" />
          <path d="M11 15V9h6" />
          <path d="M37 15V9h-6" />
        </svg>
      )

    // ── A keyhole ──────────────────────────────────────────────────────────
    case 'conspiracy':
      return (
        <svg {...common}>
          <circle cx="24" cy="19" r="8" />
          <path d="M20 27 17 40h14l-3-13" />
        </svg>
      )

    // ── A megaphone ────────────────────────────────────────────────────────
    case 'headline':
      return (
        <svg {...common}>
          <path d="M9 20v8h7l14 8V12L16 20H9z" />
          <path d="M36 18a9 9 0 0 1 0 12" />
          <path d="M16 28v9h5" />
        </svg>
      )

    // ── Three figures ──────────────────────────────────────────────────────
    case 'voter':
    default:
      return (
        <svg {...common}>
          <circle cx="16" cy="18" r="5" />
          <circle cx="32" cy="18" r="5" />
          <circle cx="24" cy="30" r="5" />
        </svg>
      )
  }
}
