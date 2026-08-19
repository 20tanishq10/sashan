// SHASN — one card, four faces.
//
// The four decks were drawn by four unrelated layouts. A Conspiracy had a badge
// on the left and its text in a tinted well; a Voter Card had a huge numeral
// centred with no header at all; the Ideology question was a modal with its own
// typography. Nothing was shared, so nothing was consistent, and every new card
// state meant inventing a fifth way of doing it.
//
// They now come off one template. Five slots, top to bottom:
//
//   edge      the deck's tone, 4px
//   eyebrow   the deck glyph and name, with a cost or advisory badge opposite
//   title     the card name, the question, or the voter count
//   body      rules text, the two answers, or the cost pips
//   footer    a clarification, or what happens next
//
// Every slot is optional, so a Voter Card at 74px wide and a full Conspiracy
// resolver at 520px are the same component with different slots filled. What
// they share is the grammar: you always know where to look for the cost, and the
// deck name is always in the same corner.
//
// States are here too rather than reinvented per caller: `selected`, `disabled`,
// `spent` and `interactive` are the four a card can actually be in, and each has
// one appearance across the whole game.

import DeckGlyph, { DECK_LABELS, DECK_TONES } from './DeckGlyph'

export default function Card({
  deck = 'voter',
  tone = null, // override the deck tone — the Ideologue colour on a revealed card
  eyebrow = null, // defaults to the deck name; pass false to drop the row entirely
  badge = null, // cost, advisory, or anything else that belongs top-right
  title = null,
  subtitle = null,
  children = null, // the body
  footer = null,

  // states
  selected = false,
  disabled = false,
  spent = false,
  onClick = null,

  width = null,
  compact = false, // tighter padding, for the small market cards
  className = '',
  style = null,
  title_ = null, // the DOM tooltip; `title` is the card's own heading
}) {
  const edge = tone || DECK_TONES[deck] || 'var(--border-3)'
  const interactive = Boolean(onClick) && !disabled
  const pad = compact ? '8px 9px' : '10px 13px'

  return (
    <div
      onClick={interactive ? onClick : undefined}
      title={title_ || undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={className}
      style={{
        ...S.card,
        width: width || undefined,
        cursor: interactive ? 'pointer' : 'default',
        opacity: disabled ? 0.45 : spent ? 0.6 : 1,
        filter: spent ? 'grayscale(0.7)' : 'none',
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        boxShadow: selected ? '0 0 0 2px var(--accent-bg), var(--sh-2)' : 'var(--sh-1)',
        transform: selected ? 'translateY(-3px)' : 'none',
        ...style,
      }}
    >
      <span style={{ ...S.edge, background: edge }} />

      {eyebrow !== false && (
        <div style={{ ...S.head, padding: `${compact ? 8 : 10}px ${compact ? 9 : 13}px 0` }}>
          <span style={S.eyebrow}>
            <DeckGlyph deck={deck} size={compact ? 11 : 13} />
            {eyebrow ?? DECK_LABELS[deck]}
          </span>
          {badge != null && <span style={S.badge}>{badge}</span>}
        </div>
      )}

      {(title != null || subtitle != null) && (
        <div style={{ ...S.titleWrap, padding: `${compact ? 4 : 6}px ${compact ? 9 : 13}px 0` }}>
          {title != null && <div style={compact ? S.titleSm : S.title}>{title}</div>}
          {subtitle != null && <div style={S.subtitle}>{subtitle}</div>}
        </div>
      )}

      {children != null && <div style={{ ...S.body, padding: pad }}>{children}</div>}

      {footer != null && (
        <div style={{ ...S.footer, padding: `0 ${compact ? 9 : 13}px ${compact ? 8 : 11}px` }}>
          {footer}
        </div>
      )}
    </div>
  )
}

/** The rules text of a Conspiracy or Headline, in its inset well. */
export function CardText({ children }) {
  return <pre style={S.text}>{children}</pre>
}

const S = {
  card: {
    position: 'relative',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    transition:
      'transform 140ms var(--ease), box-shadow 140ms var(--ease), opacity 140ms var(--ease-out), border-color 140ms var(--ease-out)',
  },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, zIndex: 1 },

  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 18,
  },
  eyebrow: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: 'var(--ink-3)',
    whiteSpace: 'nowrap',
  },
  badge: {
    fontSize: 10.5,
    fontWeight: 600,
    color: 'var(--ink)',
    border: '1px solid var(--border-2)',
    borderRadius: 999,
    padding: '0 7px',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },

  titleWrap: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: { fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: 'var(--ink)' },
  titleSm: { fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, color: 'var(--ink)' },
  subtitle: { fontSize: 11, color: 'var(--ink-3)' },

  body: { flex: 1 },
  footer: { fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.45 },

  text: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: 12.5,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    padding: 10,
    color: 'var(--ink-2)',
  },
}
