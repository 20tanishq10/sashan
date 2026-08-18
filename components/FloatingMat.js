// SHASN — your player mat as a floating window.
//
// At a table your mat sits in front of you and you shove it around as you need
// the space. Pinned to the bottom of the viewport it fought the board for room,
// so it is now a window you can move, resize and fold away.
//
//   drag      grab the title bar
//   resize    drag the bottom-right corner (width; the mat reflows to fit)
//   minimise  collapses to a horizontal bar carrying the summary you actually
//             need mid-turn — score, resources, Ideologue counts, whose turn
//
// Position, width and folded state are remembered per game in localStorage, so
// reloading mid-game does not throw your mat back to the default spot.

import { useCallback, useEffect, useRef, useState } from 'react'
import { IDEOLOGUES, IDEOLOGUE_IDS, RESOURCES, RESOURCE_IDS } from '../lib/shasn/constants'
import * as Ideology from '../lib/shasn/ideology'
import * as R from '../lib/shasn/resources'
import IdeologueMark from './IdeologueMark'

const MIN_W = 430
const MAX_W = 1180
const DEFAULT_W = 760
const BAR_H = 44

export default function FloatingMat({ storageKey = 'shasn-mat', player, color, isMyTurn, score, children }) {
  const [state, setState] = useState({ x: null, y: null, w: DEFAULT_W, minimised: false })
  const [loaded, setLoaded] = useState(false)
  const dragRef = useRef(null)
  const boxRef = useRef(null)

  // Restore where this player last left their mat.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null')
      if (saved) setState((s) => ({ ...s, ...saved }))
    } catch {
      // A corrupt entry should never stop the game rendering.
    }
    setLoaded(true)
  }, [storageKey])

  const persist = useCallback(
    (next) => {
      setState(next)
      if (typeof window === 'undefined') return
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Private mode, quota, whatever — losing the position is not fatal.
      }
    },
    [storageKey]
  )

  // Drag and resize share one pointer loop.
  useEffect(() => {
    function onMove(e) {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()

      if (d.mode === 'move') {
        const w = boxRef.current?.offsetWidth || state.w
        const h = boxRef.current?.offsetHeight || 200
        persistLive({
          ...state,
          x: clamp(d.startX + (e.clientX - d.pointerX), 0, window.innerWidth - Math.min(w, 200)),
          y: clamp(d.startY + (e.clientY - d.pointerY), 0, window.innerHeight - Math.min(h, BAR_H)),
        })
      } else {
        persistLive({
          ...state,
          w: clamp(d.startW + (e.clientX - d.pointerX), MIN_W, Math.min(MAX_W, window.innerWidth - 16)),
        })
      }
    }
    function onUp() {
      if (!dragRef.current) return
      dragRef.current = null
      persist(latest.current)
    }
    // Live updates while dragging without writing to storage on every frame.
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  })

  const latest = useRef(state)
  latest.current = state
  const persistLive = (next) => {
    latest.current = next
    setState(next)
  }

  function startDrag(e, mode) {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = boxRef.current.getBoundingClientRect()
    dragRef.current = {
      mode,
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: state.x ?? rect.left,
      startY: state.y ?? rect.top,
      startW: state.w,
    }
    // Anchor to pixels the moment a drag starts, so the default bottom-centred
    // placement does not fight the pointer.
    if (state.x == null) {
      persistLive({ ...state, x: rect.left, y: rect.top })
    }
  }

  if (!loaded) return null

  const anchored = state.x != null && state.y != null
  const frame = {
    ...S.frame,
    width: state.minimised ? 'auto' : state.w,
    ...(anchored
      ? { left: state.x, top: state.y }
      : { left: '50%', bottom: 12, transform: 'translateX(-50%)' }),
  }

  // The mat lifts once, as the turn arrives — not for as long as it lasts.
  const justBecameMyTurn = useJustTurnedTrue(isMyTurn)

  const counts = Ideology.ideologueCounts(player.ideologyCards)
  const powers = Ideology.activePowerList(player.ideologyCards).length
  const total = R.poolTotal(player.pool)
  const overCap = total > player.resourceCap

  return (
    <div
      ref={boxRef}
      style={frame}
      className={`shasn-floating-mat${justBecameMyTurn ? ' shasn-your-turn' : ''}`}
    >
      {/* ── Title bar: drag handle, and the whole control set ────────────── */}
      <div
        style={{ ...S.bar, background: color, cursor: dragRef.current ? 'grabbing' : 'grab' }}
        onPointerDown={(e) => startDrag(e, 'move')}
      >
        <span style={S.grip} aria-hidden>⠿</span>
        <strong style={S.name}>
          {player.name}
          {isMyTurn && <span style={S.turnDot} title="Your turn" />}
        </strong>

        {state.minimised && (
          <span style={S.summary}>
            <span style={S.sumItem} title="Majority voters">
              <em style={S.sumLabel}>pts</em>
              <strong>{score}</strong>
            </span>

            <span style={S.sumDivider} />

            {RESOURCE_IDS.map((id) => (
              <span
                key={id}
                style={{ ...S.resDot, background: RESOURCES[id].color }}
                title={RESOURCES[id].label}
              >
                {player.pool[id] || 0}
              </span>
            ))}
            <span style={{ ...S.sumItem, color: overCap ? 'var(--danger-bg)' : undefined }}>
              <strong>{total}</strong>
              <em style={S.sumLabel}>/{player.resourceCap}</em>
            </span>

            <span style={S.sumDivider} />

            {IDEOLOGUE_IDS.map((id) => (
              <span key={id} style={S.ideoItem} title={`${IDEOLOGUES[id].label}: ${counts[id]}`}>
                <IdeologueMark ideologue={id} size={13} color="var(--surface)" stroke={2.4} />
                <strong>{counts[id]}</strong>
              </span>
            ))}

            {powers > 0 && (
              <>
                <span style={S.sumDivider} />
                <span style={S.sumItem} title="Unlocked Ideologue powers">
                  <em style={S.sumLabel}>powers</em>
                  <strong>{powers}</strong>
                </span>
              </>
            )}
          </span>
        )}

        <span style={S.controls}>
          {anchored && (
            <button
              style={S.ctrl}
              title="Reset position"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => persist({ ...state, x: null, y: null, w: DEFAULT_W })}
            >
              ⤢
            </button>
          )}
          <button
            style={S.ctrl}
            title={state.minimised ? 'Expand mat' : 'Minimise to a bar'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => persist({ ...state, minimised: !state.minimised })}
          >
            {state.minimised ? '▴' : '▾'}
          </button>
        </span>
      </div>

      {!state.minimised && (
        <>
          <div style={S.body}>{children}</div>
          <div
            style={S.resize}
            title="Drag to resize"
            onPointerDown={(e) => startDrag(e, 'resize')}
          />
        </>
      )}
    </div>
  )
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

/** True for a moment after `on` flips from false to true. */
function useJustTurnedTrue(on, ms = 700) {
  const prev = useRef(on)
  const [hit, setHit] = useState(false)
  useEffect(() => {
    if (on && !prev.current) {
      setHit(true)
      const t = setTimeout(() => setHit(false), ms)
      prev.current = on
      return () => clearTimeout(t)
    }
    prev.current = on
  }, [on, ms])
  return hit
}

const S = {
  frame: {
    position: 'fixed',
    zIndex: 40,
    borderRadius: 'var(--r-lg)',
    boxShadow: 'var(--sh-4)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    maxWidth: 'calc(100vw - 16px)',
  },
  bar: {
    height: BAR_H,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 10px',
    color: 'var(--surface)',
    userSelect: 'none',
    touchAction: 'none',
  },
  grip: { opacity: 0.65, fontSize: 15, letterSpacing: -1 },
  name: { fontSize: 14, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 },
  turnDot: {
    width: 8, height: 8, borderRadius: '50%', background: 'var(--surface)',
    boxShadow: '0 0 0 3px rgba(255,255,255,.35)',
  },

  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'nowrap',
    overflowX: 'auto',
    fontSize: 12,
  },
  sumItem: { display: 'flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  sumLabel: { fontStyle: 'normal', fontSize: 9, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.5 },
  sumDivider: { width: 1, height: 18, background: 'rgba(255,255,255,.3)', flexShrink: 0 },
  resDot: {
    width: 21, height: 21, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 10, fontWeight: 700,
    textShadow: '0 1px 1px rgba(0,0,0,.4)', flexShrink: 0,
  },
  ideoItem: { display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, flexShrink: 0 },

  controls: { marginLeft: 'auto', display: 'flex', gap: 4 },
  ctrl: {
    width: 26, height: 24, borderRadius: 5, border: '1px solid rgba(255,255,255,.35)',
    background: 'rgba(0,0,0,.2)', color: 'var(--surface)', cursor: 'pointer', fontSize: 12, lineHeight: 1,
  },

  body: { maxHeight: '62vh', overflowY: 'auto', background: 'var(--surface)' },
  resize: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    cursor: 'nwse-resize',
    background:
      'linear-gradient(135deg, transparent 0 46%, var(--border-3) 46% 54%, transparent 54% 74%, var(--border-3) 74% 82%, transparent 82%)',
    touchAction: 'none',
  },
}
