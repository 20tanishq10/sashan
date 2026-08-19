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
import IdeologueMark from './IdeologueMark'
import { useChange, useDeparting } from '../lib/ui/useChanges'
import { arrivedSlots, departedSlots, layoutTokens } from '../lib/ui/changes'
import * as R from '../lib/shasn/resources'

const NOTHING = new Set()

export default function ResourceChain({
  pool,
  cap = 12,
  selected = null,        // pool of tokens marked for discard
  onTokenClick = null,    // (resourceId) => void
  size = 30,        // the LARGEST a slot may be; they shrink to fit the width
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

  // The slots share the width equally rather than sitting at a fixed size, so
  // the chain reaches the full width of the mat instead of clumping at the left
  // with a long empty rail beside it. `size` is now a ceiling, not a fixed size.
  const gap = Math.round(size * 0.16)

  // Resources change every single turn, and until now the chain simply held a
  // different set of tokens next frame. Arrivals drop in; departures fly back
  // toward the Public Reserve from the slot they were actually sitting in,
  // which is why the previous pool is kept for the length of the animation.
  const arrived = useChange(pool, arrivedSlots, 700, NOTHING) || NOTHING
  const wasPool = useDeparting(pool, 560)
  const departed = wasPool ? departedSlots(wasPool, pool) : NOTHING
  const ghosts = wasPool ? layoutTokens(wasPool) : []

  return (
    <div style={S.wrap}>
      <div style={{ ...S.track, height: size + 8 }}>
        {/* the linking bar behind the slots */}
        <div style={{ ...S.rail, height: size * 0.52 }} />

        <div style={{ ...S.slots, gap }}>
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
              className={
                arrived.has(i)
                  ? `shasn-token-in${arrivalOrder(arrived, i) ? ` shasn-stagger-${arrivalOrder(arrived, i)}` : ''}`
                  : undefined
              }
              style={{
                ...S.slot,
                maxWidth: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
            >
              {/* The mark is what makes a token identifiable without colour —
                  and it is what the printed cardboard chits carry (p.3). Below
                  about 16px the line art turns to mush, so tiny chains stay
                  plain rather than showing a smudge. */}
              {id && size >= 16 && (
                <IdeologueMark
                  ideologue={RESOURCES[id].ideologue}
                  size={Math.round(size * 0.56)}
                  color={RESOURCES[id].ink || '#ffffff'}
                  stroke={size >= 26 ? 3 : 3.6}
                />
              )}
            </button>
          )
        })}
        </div>

        {/* Tokens on their way back to the Reserve, drawn over the row at the
            positions they held before it reflowed. */}
        {departed.size > 0 && (
          <div style={{ ...S.slots, gap, ...S.ghostRow }} aria-hidden>
            {ghosts.map((id, i) => (
              <span
                key={i}
                className={departed.has(i) ? 'shasn-token-out' : undefined}
                style={{
                  ...S.slot,
                  maxWidth: size,
                  visibility: departed.has(i) ? 'visible' : 'hidden',
                  background: RESOURCES[id].color,
                  borderColor: 'rgba(0,0,0,.14)',
                  borderWidth: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {size >= 16 && (
                  <IdeologueMark
                    ideologue={RESOURCES[id].ideologue}
                    size={Math.round(size * 0.56)}
                    color={RESOURCES[id].ink || '#ffffff'}
                    stroke={size >= 26 ? 3 : 3.6}
                  />
                )}
              </span>
            ))}
          </div>
        )}
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

/**
 * Where slot `i` sits in the run of arrivals, capped at the number of stagger
 * steps there are classes for. Gaining four resources at once should look like
 * four things being put down, not one thick thud.
 */
function arrivalOrder(arrived, i) {
  let n = 0
  for (const slot of arrived) if (slot < i) n += 1
  return Math.min(n, 5)
}

/** Small legend so the token colours are readable at a glance. */
export function ResourceLegend({ pool }) {
  return (
    <div style={S.legend}>
      {RESOURCE_IDS.map((id) => (
        <span key={id} style={S.legendItem}>
          <span style={{ ...S.legendDot, background: RESOURCES[id].color }}>
            <IdeologueMark
              ideologue={RESOURCES[id].ideologue}
              size={8}
              color={RESOURCES[id].ink || '#ffffff'}
              stroke={4.5}
            />
          </span>
          {RESOURCES[id].label}
          <strong style={{ marginLeft: 4 }}>{pool[id] || 0}</strong>
        </span>
      ))}
    </div>
  )
}

const S = {
  wrap: { display: 'flex', alignItems: 'center', gap: 10 },
  // Holds the rail behind the slots; grows to take whatever width is going.
  track: { position: 'relative', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'var(--border)',
    borderRadius: 999,
    zIndex: 0,
  },
  slots: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
    width: '100%',
    justifyContent: 'space-between',
  },
  ghostRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2,
    pointerEvents: 'none',
  },
  slot: {
    // Equal shares of the width, square, capped at `size`.
    flex: '1 1 0',
    minWidth: 0,
    aspectRatio: '1 / 1',
    borderRadius: '50%',
    borderStyle: 'solid',
    padding: 0,
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
  legendDot: {
    width: 13, height: 13, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
}
