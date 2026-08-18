// SHASN — the resource chain along the top of the player mat.
//
// The printed mat has a black chain of 12 linked circular slots running across
// its top edge, and your resource tokens sit in them. Measuring the scan: 12
// bulges at regular spacing.
//
// That number is not a coincidence — it IS the resource cap (p.11). You cannot
// hold more than 12 because there are only 12 slots on your mat. It also settles
// a question the rulebook leaves open: the cap is a TOTAL of 12 across all four
// resources, not 12 of each, because the chain holds twelve tokens whatever
// colour they are.
//
// Tokens are buttons. During the cap discard they are how you hand resources
// back — clicking one is the digital version of lifting it off the mat.

import { RESOURCES, RESOURCE_IDS } from '../lib/shasn/constants'
import * as R from '../lib/shasn/resources'

export default function ResourceChain({
  pool,
  cap = 12,
  selected = null,        // pool of tokens marked for discard
  onTokenClick = null,    // (resourceId) => void
  size = 30,
  compact = false,
}) {
  // One entry per token held, grouped by resource so like sits with like.
  const tokens = []
  for (const id of RESOURCE_IDS) {
    for (let i = 0; i < (pool[id] || 0); i++) tokens.push(id)
  }

  const total = tokens.length
  const slots = Math.max(cap, total) // over cap? show the overflow rather than hide it
  const marked = { ...R.emptyPool(), ...(selected || {}) }
  const remaining = { ...marked }
  const interactive = Boolean(onTokenClick)

  return (
    <div style={{ ...S.wrap, height: size + 8 }}>
      {/* the linking bar behind the slots */}
      <div style={{ ...S.rail, height: size * 0.52, top: (size + 8 - size * 0.52) / 2 }} />

      <div style={{ ...S.slots, gap: Math.round(size * 0.16) }}>
        {Array.from({ length: slots }).map((_, i) => {
          const id = tokens[i]
          const overflow = i >= cap

          // Mark the LAST tokens of a type as the ones being discarded, so the
          // chain visibly empties from the end.
          let isMarked = false
          if (id && remaining[id] > 0) {
            const lastOfType = tokens.lastIndexOf(id, i) === i || !tokens.includes(id, i + 1)
            if (lastOfType) {
              isMarked = true
              remaining[id] -= 1
            }
          }

          const label = id ? RESOURCES[id].label : 'Empty slot'
          const clickable = interactive && Boolean(id)

          return (
            <button
              key={i}
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onTokenClick(id) : undefined}
              title={
                clickable
                  ? `${label} — click to hand back to the Public Reserve`
                  : id
                  ? label
                  : 'Empty slot'
              }
              style={{
                ...S.slot,
                width: size,
                height: size,
                background: id ? RESOURCES[id].color : 'var(--surface)',
                borderColor: overflow
                  ? 'var(--danger)'
                  : isMarked
                  ? 'var(--ink)'
                  : id
                  ? 'rgba(0,0,0,.14)'
                  : 'var(--border-2)',
                borderWidth: isMarked || overflow ? 2.5 : id ? 1.5 : 1,
                cursor: clickable ? 'pointer' : 'default',
                opacity: isMarked ? 0.4 : 1,
                transform: isMarked ? 'translateY(-3px)' : 'none',
                boxShadow: id && !isMarked ? 'inset 0 -2px 3px rgba(0,0,0,.16)' : 'none',
              }}
            />
          )
        })}
      </div>

      {!compact && (
        <span style={S.count}>
          {total}
          <em style={S.capText}>/{cap}</em>
        </span>
      )}
    </div>
  )
}

/** Small legend so the token colours are readable at a glance. */
export function ResourceLegend({ pool }) {
  return (
    <div style={S.legend}>
      {RESOURCE_IDS.map((id) => (
        <span key={id} style={S.legendItem}>
          <span style={{ ...S.legendDot, background: RESOURCES[id].color }} />
          {RESOURCES[id].label}
          <strong style={{ marginLeft: 4 }}>{pool[id] || 0}</strong>
        </span>
      ))}
    </div>
  )
}

const S = {
  wrap: { position: 'relative', display: 'flex', alignItems: 'center', gap: 8 },
  rail: {
    position: 'absolute',
    left: 0,
    right: 42,
    background: 'var(--border)',
    borderRadius: 999,
    zIndex: 0,
  },
  slots: { position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', flexWrap: 'nowrap' },
  slot: {
    borderRadius: '50%',
    borderStyle: 'solid',
    padding: 0,
    flexShrink: 0,
    transition: 'transform 140ms var(--ease), opacity 140ms var(--ease-out)',
  },
  count: {
    marginLeft: 'auto',
    fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 650,
    color: 'var(--ink)',
    zIndex: 1,
  },
  capText: { fontStyle: 'normal', fontWeight: 400, color: 'var(--ink-3)', fontSize: 11 },
  legend: { display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 9.5, color: 'var(--ink-2)' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' },
  legendDot: { width: 9, height: 9, borderRadius: '50%', display: 'inline-block' },
}
