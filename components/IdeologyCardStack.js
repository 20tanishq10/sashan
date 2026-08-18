// SHASN — Ideology Cards tucked under the player mat.
//
// p.12: "After confirming your answer, keep the Ideology Card under your Player
// Mat with your answer face up."
//
// So the cards physically live UNDER the mat, and what you see at the table is
// their edges poking out below it. That is what this draws: a stack of backs
// sliding out from beneath the Ideologue's panel, one per card answered for that
// Ideologue, deepest at the back.
//
// Each back carries that Ideologue's mark — the same device as the resource it
// pays, taken from the printed tokens. You can read someone's whole political
// history off the four stacks along the bottom of their mat, which is the point:
// answered cards are public information (they sit face up).
//
// The newest card animates in, so a card you just answered visibly lands here
// after the reveal.

import IdeologueMark from './IdeologueMark'
import { IDEOLOGUES, LEVEL_3_THRESHOLD, LEVEL_5_THRESHOLD } from '../lib/shasn/constants'

const MAX_VISIBLE = 6

export default function IdeologyCardStack({
  ideologue,
  count = 0,
  width = 46,
  justAdded = false,
}) {
  const ideo = IDEOLOGUES[ideologue]
  const shown = Math.min(count, MAX_VISIBLE)
  const step = 7 // how far each card peeks past the one in front

  // Height of the visible sliver plus one full card face on top.
  const cardH = Math.round(width * 1.34)
  const stackH = cardH + Math.max(0, shown - 1) * step

  if (count === 0) {
    return (
      <div style={{ ...S.wrap, width, height: cardH }}>
        <div style={{ ...S.emptySlot, width, height: cardH }}>
          <IdeologueMark ideologue={ideologue} size={width * 0.42} color="#ffffff33" stroke={1.4} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...S.wrap, width, height: stackH }}>
      {Array.from({ length: shown }).map((_, i) => {
        const isTop = i === shown - 1
        const depth = shown - 1 - i
        return (
          <div
            key={i}
            className={isTop && justAdded ? 'shasn-card-tuck' : undefined}
            style={{
              ...S.card,
              width,
              height: cardH,
              top: i * step,
              zIndex: i,
              background: `linear-gradient(155deg, ${ideo.color} 0%, ${shade(ideo.color, -28)} 100%)`,
              // Cards further under the mat sit in its shadow.
              filter: depth ? `brightness(${1 - Math.min(depth, 4) * 0.11})` : 'none',
              boxShadow: isTop
                ? '0 3px 7px rgba(20,14,8,.45)'
                : '0 1px 2px rgba(20,14,8,.35)',
            }}
          >
            <span style={S.rule} />
            <IdeologueMark
              ideologue={ideologue}
              size={width * 0.5}
              color="rgba(255,255,255,.92)"
              stroke={1.5}
            />
          </div>
        )
      })}

      <span style={{ ...S.count, borderColor: ideo.color }}>{count}</span>

      {count >= LEVEL_5_THRESHOLD ? (
        <span style={{ ...S.tier, background: ideo.color }}>L5</span>
      ) : count >= LEVEL_3_THRESHOLD ? (
        <span style={{ ...S.tier, background: ideo.color }}>L3</span>
      ) : null}
    </div>
  )
}

/** Darken a hex colour by `amt` percent, for the card gradient. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v + (v * amt) / 100)))
  )
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const S = {
  wrap: { position: 'relative', margin: '0 auto' },
  card: {
    position: 'absolute',
    left: 0,
    borderRadius: 5,
    border: '1px solid rgba(255,255,255,.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // The band across the top of the back, echoing the printed card frames.
  rule: {
    position: 'absolute',
    top: 4,
    left: '18%',
    right: '18%',
    height: 2,
    background: 'rgba(255,255,255,.45)',
    borderRadius: 2,
  },
  emptySlot: {
    borderRadius: 5,
    border: '1px dashed rgba(255,255,255,.28)',
    background: 'rgba(0,0,0,.18)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    position: 'absolute',
    right: -7,
    bottom: -7,
    minWidth: 20,
    height: 20,
    padding: '0 5px',
    borderRadius: 10,
    background: '#17150f',
    border: '2px solid',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    fontVariantNumeric: 'tabular-nums',
  },
  tier: {
    position: 'absolute',
    left: -7,
    bottom: -6,
    borderRadius: 4,
    color: '#17150f',
    fontSize: 9,
    fontWeight: 700,
    padding: '1px 4px',
    zIndex: 20,
    border: '1px solid rgba(0,0,0,.35)',
  },
}
