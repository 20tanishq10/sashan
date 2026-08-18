// SHASN — a deck or discard pile, drawn as a stack of cards.
//
// Modelled on the printed board, which reserves four slots along its bottom edge
// (Conspiracy draw / Conspiracy discard / Headline discard / Headline draw) and
// five along its top for the Voter Cards. Card backs are sage green with a
// darker map print and the deck name set vertically; empty slots are just an
// outline.
//
// The stack behind the top card is real: it thickens as the deck grows and thins
// as it is drawn down, so you can see at a glance how much game is left.

const SAGE = '#7c8d82'
const SAGE_DARK = '#5f7167'

export default function CardStack({
  label,
  caption,
  count = 0,
  empty = false,          // render as an outlined slot (a discard pile at zero)
  cost = null,            // the "COST" badge on the Conspiracy draw pile
  vertical = true,        // deck name set vertically, as printed
  width = 74,
  height = 106,
  onClick = null,
  disabled = false,
  highlight = false,
}) {
  const layers = Math.min(4, Math.max(0, count - 1))
  const clickable = Boolean(onClick) && !disabled && count > 0
  const showBack = count > 0 && !empty

  return (
    <div style={{ ...S.slot, width }}>
      <div style={{ ...S.stage, width, height: height + layers * 3 }}>
        {/* depth: the rest of the pile sitting under the top card */}
        {showBack &&
          Array.from({ length: layers }).map((_, i) => (
            <div
              key={i}
              style={{
                ...S.layer,
                width,
                height,
                bottom: (layers - i) * 3,
                left: (layers - i) * 1.2,
                opacity: 0.35 + i * 0.15,
              }}
            />
          ))}

        <button
          type="button"
          disabled={!clickable}
          onClick={clickable ? onClick : undefined}
          title={
            clickable
              ? `${label} — ${count} card${count === 1 ? '' : 's'}`
              : `${label}: ${count}`
          }
          style={{
            ...S.card,
            width,
            height,
            bottom: 0,
            cursor: clickable ? 'pointer' : 'default',
            background: showBack
              ? `radial-gradient(circle at 50% 42%, ${SAGE} 0%, ${SAGE_DARK} 78%)`
              : 'rgba(0,0,0,.18)',
            borderStyle: showBack ? 'solid' : 'dashed',
            borderColor: highlight ? '#f0e2b8' : showBack ? '#93a397' : '#7a6d5c',
            borderWidth: highlight ? 3 : showBack ? 1 : 2,
            boxShadow: showBack ? '0 2px 5px rgba(0,0,0,.35)' : 'none',
          }}
        >
          {/* faint concentric print, echoing the board's card backs */}
          {showBack && <span style={S.print} />}

          <span
            style={{
              ...S.label,
              writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
              textOrientation: vertical ? 'mixed' : 'initial',
              opacity: showBack ? 1 : 0.55,
            }}
          >
            {label}
          </span>

          {count > 0 && <span style={S.count}>{count}</span>}
        </button>

        {cost != null && (
          <span style={S.cost} title="Cost to buy the top card">
            {cost}
          </span>
        )}
      </div>

      {caption && <span style={S.caption}>{caption}</span>}
    </div>
  )
}

const S = {
  slot: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  stage: { position: 'relative' },
  layer: {
    position: 'absolute',
    borderRadius: 8,
    background: SAGE_DARK,
    border: '1px solid #93a397',
  },
  card: {
    position: 'absolute',
    left: 0,
    borderRadius: 8,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    transition: 'transform .12s ease',
  },
  print: {
    position: 'absolute',
    inset: '14% 18%',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,.16)',
    boxShadow:
      'inset 0 0 0 6px rgba(255,255,255,.05), 0 0 0 7px rgba(255,255,255,.07)',
    pointerEvents: 'none',
  },
  label: {
    fontSize: 10,
    letterSpacing: 2.4,
    color: '#eef2ec',
    textTransform: 'uppercase',
    fontWeight: 600,
    textShadow: '0 1px 2px rgba(0,0,0,.4)',
    zIndex: 1,
  },
  count: {
    position: 'absolute',
    top: 5,
    right: 6,
    fontSize: 10,
    color: '#dfe6dc',
    background: 'rgba(0,0,0,.4)',
    borderRadius: 8,
    padding: '1px 6px',
    fontVariantNumeric: 'tabular-nums',
    zIndex: 1,
  },
  cost: {
    position: 'absolute',
    top: -9,
    left: -9,
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#f0e2b8',
    color: '#3a2f26',
    border: '2px solid #3a2f26',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  caption: {
    fontSize: 8,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: '#c8bda9',
    textAlign: 'center',
    lineHeight: 1.3,
    maxWidth: 92,
  },
}
