// SHASN — the five party emblems.
//
// Drawn as SOLID silhouettes, deliberately. The four Ideologue marks are line
// art, so the two families never get mistaken for one another even at a glance:
// an outline means a resource, a solid shape means a player.
//
// They also have to survive being shrunk. A flipped majority voter on the board
// is about 19 units across, and these sit at roughly half that, so every emblem
// is built from three or four large masses with no detail that disappears —
// which is the same constraint a real ballot symbol has to meet.
//
//   Lantern   a hanging lamp
//   Kite      a rhombus on a string
//   Sickle    a curved blade
//   Drum      a barrel drum
//   Banyan    a spreading tree

export default function PartyEmblem({ party, size = 20, color = 'currentColor', title = null }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 48 48',
    fill: color,
    style: { display: 'block', flexShrink: 0 },
    role: title ? 'img' : 'presentation',
    'aria-hidden': title ? undefined : true,
  }

  const label = title ? <title>{title}</title> : null

  switch (party) {
    // ── A hanging lamp ─────────────────────────────────────────────────────
    case 'lantern':
      return (
        <svg {...common}>
          {label}
          <path d="M20 5h8v3h-8z" />
          <path d="M17 9h14v4H17z" />
          <path d="M19 15h10l4 16H15z" />
          <path d="M16 33h16v4H16z" />
          <path d="M22 39h4v4h-4z" />
        </svg>
      )

    // ── A rhombus on a string ──────────────────────────────────────────────
    case 'kite':
      return (
        <svg {...common}>
          {label}
          <path d="M24 4 40 21 24 38 8 21z" />
          <path
            d="M24 38c3 3 0 5-2 6s-3 3 0 5"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )

    // ── A curved blade ─────────────────────────────────────────────────────
    case 'sickle':
      return (
        <svg {...common}>
          {label}
          <path d="M8 8c18 0 32 13 33 30h-7C33 24 22 15 8 15z" />
          <path d="M6 30h9v13H6z" />
        </svg>
      )

    // ── A barrel drum ──────────────────────────────────────────────────────
    case 'drum':
      return (
        <svg {...common}>
          {label}
          <ellipse cx="24" cy="13" rx="15" ry="5" />
          <path d="M9 13h30v22H9z" />
          <ellipse cx="24" cy="35" rx="15" ry="5" />
          <path
            d="M13 15 24 24 13 33M35 15 24 24l11 9"
            fill="none"
            stroke="var(--surface)"
            strokeWidth="2.4"
            opacity="0.55"
          />
        </svg>
      )

    // ── A spreading tree ───────────────────────────────────────────────────
    case 'banyan':
    default:
      return (
        <svg {...common}>
          {label}
          <ellipse cx="24" cy="17" rx="18" ry="11" />
          <path d="M21 20h6v23h-6z" />
          <path d="M10 26h3v11h-3zM35 26h3v11h-3z" />
        </svg>
      )
  }
}
