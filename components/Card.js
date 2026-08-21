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
import { STATE, stateFor, STATE_LABEL } from '../lib/ui/states'

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

  // One vocabulary for the whole app rather than a per-component opacity.
  const state = stateFor({ selected, spent, disabled })
  const stateNote = STATE_LABEL[state]

  return (
    <div
      onClick={interactive ? onClick : undefined}
      title={[title_, stateNote].filter(Boolean).join(' — ') || undefined}
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
      aria-disabled={disabled || undefined}
      style={{
        ...S.card,
        width: width || undefined,
        boxShadow: 'var(--sh-1)',
        ...STATE[state],
        // A card is never fully inert: you must still be able to read what it
        // costs, even when you cannot pay for it.
        pointerEvents: 'auto',
        cursor: interactive ? 'pointer' : 'default',
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

      {eyebrow !== false && <span style={S.rule} />}

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
    // Ivory card stock with a block-printed ground, and a warm sheen from the
    // top-left as though a lamp is over the table.
    backgroundColor: 'var(--ivory)',
    backgroundImage: [
      'linear-gradient(150deg, rgba(255,255,255,0.6), transparent 45%)',
      'radial-gradient(circle at 18% 18%, rgba(168,28,34,0.055) 0 2.4px, transparent 2.4px)',
      'radial-gradient(circle at 68% 62%, rgba(15,122,74,0.055) 0 2.4px, transparent 2.4px)',
    ].join(','),
    backgroundSize: 'auto, 34px 34px, 34px 34px',
    color: 'var(--ink)',
    border: '1px solid var(--brass-dark)',
    borderRadius: 'var(--r-lg)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    transition:
      'transform 140ms var(--ease), box-shadow 140ms var(--ease), opacity 140ms var(--ease-out), border-color 140ms var(--ease-out)',
  },
  // The deck's tone, laid over brass so the top edge reads as an inlaid band.
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    zIndex: 1,
    boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.35), 0 1px 0 rgba(217,173,62,0.55)',
  },

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
    fontFamily: 'var(--head)',
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--brass-dark)',
    whiteSpace: 'nowrap',
  },
  // A struck coin rather than a chip.
  badge: {
    fontSize: 11,
    fontWeight: 700,
    color: '#3a2508',
    background: 'linear-gradient(180deg, #f6e1a0, #d9ad3e 55%, #9c6e14)',
    border: '1px solid #7a5610',
    boxShadow: 'inset 0 1px 0 rgba(255,245,215,0.7), 0 1px 2px rgba(0,0,0,0.35)',
    borderRadius: 999,
    padding: '1px 9px',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },

  // A brass rule under the header. Cheap, and it does more for "this is a
  // printed card" than any amount of border radius.
  rule: {
    display: 'block',
    height: 1,
    margin: '7px 13px 0',
    background:
      'linear-gradient(90deg, transparent, var(--brass-dark) 18%, var(--brass) 50%, var(--brass-dark) 82%, transparent)',
    opacity: 0.7,
  },
  titleWrap: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: {
    fontFamily: 'var(--head)',
    fontSize: 16.5,
    lineHeight: 1.32,
    color: 'var(--ink)',
  },
  titleSm: { fontFamily: 'var(--display)', fontSize: 15, lineHeight: 1.25, color: 'var(--ink)' },
  subtitle: { fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em' },

  body: { flex: 1 },
  footer: { fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.45 },

  text: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    background: 'rgba(255,255,255,0.55)',
    border: '1px solid var(--border-2)',
    borderRadius: 'var(--r-md)',
    padding: 11,
    color: 'var(--ink-2)',
    boxShadow: 'inset 0 1px 3px rgba(138,95,17,0.15)',
  },
}
