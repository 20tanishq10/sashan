// SHASN — a deck or discard pile, drawn as a stack of cards.
//
// Modelled on the printed board, which reserves four slots along its bottom edge
// (Conspiracy draw / Conspiracy discard / Headline discard / Headline draw) and
// five along its top for the Voter Cards.
//
// The stack behind the top card is real: it thickens as the deck grows and thins
// as it is drawn down, so you can see at a glance how much game is left. When a
// card is taken the pile settles by one rather than silently losing a layer.
//
// Card backs are graphite. Which deck a pile belongs to is carried by a single
// hairline of colour along the top edge, not by flooding the whole card — the
// palette rule is that saturation means information.

import { useEffect, useRef, useState } from 'react'
import { T } from '../lib/ui/theme'

const TONE = {
  conspiracy: 'var(--danger)',
  headline: 'var(--amber)',
  neutral: 'var(--border-3)',
}

export default function CardStack({
  label,
  caption,
  count = 0,
  empty = false, // render as an outlined slot (a discard pile at zero)
  cost = null, // the "COST" badge on the Conspiracy draw pile
  vertical = true, // deck name set vertically, as printed
  tone = 'neutral', // which deck this pile belongs to
  width = 74,
  height = 106,
  onClick = null,
  disabled = false,
  highlight = false,
}) {
  const layers = Math.min(4, Math.max(0, count - 1))
  const clickable = Boolean(onClick) && !disabled && count > 0
  const showBack = count > 0 && !empty
  const drawn = useJustDecreased(count)

  return (
    <div style={{ ...S.slot, width }}>
      <div
        style={{ ...S.stage, width, height: height + layers * 3 }}
        className={drawn ? 'shasn-stack-draw' : undefined}
      >
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
                opacity: 0.3 + i * 0.16,
              }}
            />
          ))}

        <button
          type="button"
          disabled={!clickable}
          onClick={clickable ? onClick : undefined}
          title={
            clickable ? `${label} — ${count} card${count === 1 ? '' : 's'}` : `${label}: ${count}`
          }
          style={{
            ...S.card,
            width,
            height,
            bottom: 0,
            cursor: clickable ? 'pointer' : 'default',
            background: showBack
              ? 'linear-gradient(160deg, #2b313b 0%, #191d24 62%, #23282f 100%)'
              : 'var(--surface-3)',
            borderStyle: showBack ? 'solid' : 'dashed',
            borderColor: highlight ? TONE[tone] : showBack ? '#0f1216' : 'var(--border-2)',
            borderWidth: highlight ? 2 : 1,
            boxShadow: showBack ? T.sh2 : 'none',
          }}
        >
          {/* the deck's hairline — the only colour on the back */}
          {showBack && <span style={{ ...S.tone, background: TONE[tone] }} />}

          {/* faint concentric print, echoing the board's card backs */}
          {showBack && <span style={S.print} />}

          <span
            style={{
              ...S.label,
              writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
              textOrientation: vertical ? 'mixed' : 'initial',
              color: showBack ? 'rgba(255,255,255,.9)' : 'var(--ink-3)',
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

/** True for a moment after `n` drops, so the pile can react to being drawn from. */
function useJustDecreased(n) {
  const prev = useRef(n)
  const [hit, setHit] = useState(false)
  useEffect(() => {
    if (n < prev.current) {
      setHit(true)
      const t = setTimeout(() => setHit(false), 420)
      prev.current = n
      return () => clearTimeout(t)
    }
    prev.current = n
  }, [n])
  return hit
}

const S = {
  slot: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  stage: { position: 'relative' },
  layer: {
    position: 'absolute',
    borderRadius: 8,
    background: '#1b1f26',
    border: '1px solid #0f1216',
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
    transition: 'transform 140ms var(--ease), box-shadow 140ms var(--ease)',
  },
  tone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    pointerEvents: 'none',
  },
  print: {
    position: 'absolute',
    inset: '15% 19%',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,.10)',
    boxShadow: 'inset 0 0 0 6px rgba(255,255,255,.035), 0 0 0 7px rgba(255,255,255,.045)',
    pointerEvents: 'none',
  },
  label: {
    fontSize: 9.5,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    fontWeight: 600,
    zIndex: 1,
  },
  count: {
    position: 'absolute',
    top: 6,
    right: 6,
    fontSize: 10,
    color: 'rgba(255,255,255,.75)',
    background: 'rgba(255,255,255,.12)',
    borderRadius: 999,
    padding: '0 6px',
    fontVariantNumeric: 'tabular-nums',
    zIndex: 1,
  },
  cost: {
    position: 'absolute',
    top: -9,
    left: -9,
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: 'var(--surface)',
    color: 'var(--ink)',
    border: '1.5px solid var(--border-3)',
    boxShadow: 'var(--sh-1)',
    fontSize: 12,
    fontWeight: 650,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontVariantNumeric: 'tabular-nums',
    zIndex: 2,
  },
  caption: {
    fontSize: 8.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'var(--ink-3)',
    textAlign: 'center',
    lineHeight: 1.3,
    maxWidth: 92,
  },
}
