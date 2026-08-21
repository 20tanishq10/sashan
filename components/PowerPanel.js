// SHASN — input for the activated Ideologue powers.
//
// Three of the five are driven by clicking voters on the board (Breaking Ground,
// Payback, Tough Love). The other two need resources chosen instead, and without
// this panel they are dead ends: the power arms and nothing can complete it.
//
//   Prospecting (Capitalist L3)  give 1 resource, take up to 2 (p.23)
//   Donations   (Supremo L3)     snatch 1 resource from a player (p.24)
//
// Prospecting matters beyond its own text — it is the rulebook's escape hatch
// from a starved economy, and isStalled() assumes a player holding it can always
// break a logjam.

import { useState } from 'react'
import { RESOURCES, RESOURCE_IDS } from '../lib/shasn/constants'
import * as R from '../lib/shasn/resources'

export default function PowerPanel({ power, players, me, onRun, onCancel, busy = false }) {
  const [give, setGive] = useState(null)
  const [take, setTake] = useState(R.emptyPool())
  const [target, setTarget] = useState(null)
  const [resource, setResource] = useState(null)

  if (!power) return null
  const takeTotal = R.poolTotal(take)

  // ── Prospecting ──────────────────────────────────────────────────────────
  if (power.action === 'prospect') {
    return (
      <div style={S.panel}>
        <p style={S.prompt}>
          <strong>Prospecting</strong> — give 1 resource to the Public Reserve, take up to 2 of
          your choice.
        </p>

        <p style={S.label}>Give one</p>
        <div style={S.row}>
          {RESOURCE_IDS.map((id) => {
            const held = me.pool[id] || 0
            return (
              <button
                key={id}
                disabled={held < 1}
                onClick={() => setGive(id)}
                style={{
                  ...S.chip,
                  background: RESOURCES[id].color,
                  opacity: held < 1 ? 0.3 : give === id ? 1 : 0.55,
                  outline: give === id ? '2px solid var(--ink)' : 'none',
                }}
              >
                {RESOURCES[id].label} ({held})
              </button>
            )
          })}
        </div>

        <p style={S.label}>Take ({takeTotal}/2)</p>
        <div style={S.row}>
          {RESOURCE_IDS.map((id) => (
            <Stepper
              key={id}
              id={id}
              value={take[id]}
              onDown={() => setTake({ ...take, [id]: Math.max(0, take[id] - 1) })}
              onUp={() => setTake({ ...take, [id]: take[id] + 1 })}
              upDisabled={takeTotal >= 2}
            />
          ))}
        </div>

        <div style={S.foot}>
          <button
            style={S.btn}
            disabled={busy || !give || takeTotal < 1}
            onClick={() => onRun('prospect', { give: { ...R.emptyPool(), [give]: 1 }, take })}
          >
            Prospect
          </button>
          <button style={S.ghost} onClick={onCancel}>cancel</button>
        </div>
      </div>
    )
  }

  // ── Donations ────────────────────────────────────────────────────────────
  if (power.action === 'donations') {
    const opponents = players.filter((p) => p.id !== me.id)
    const targetPool = target ? players.find((p) => p.id === target)?.pool || {} : {}

    return (
      <div style={S.panel}>
        <p style={S.prompt}>
          <strong>Donations</strong> — take 1 resource from another player, giving nothing back.
        </p>

        <p style={S.label}>From</p>
        <div style={S.row}>
          {opponents.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                setTarget(o.id)
                setResource(null)
              }}
              style={{ ...S.ghost, borderColor: target === o.id ? 'var(--ink)' : 'var(--border)' }}
            >
              {o.name} ({R.poolTotal(o.pool)})
            </button>
          ))}
        </div>

        {target && (
          <>
            <p style={S.label}>Take</p>
            <div style={S.row}>
              {RESOURCE_IDS.map((id) => {
                const held = targetPool[id] || 0
                return (
                  <button
                    key={id}
                    disabled={held < 1}
                    onClick={() => setResource(id)}
                    style={{
                      ...S.chip,
                      background: RESOURCES[id].color,
                      opacity: held < 1 ? 0.3 : resource === id ? 1 : 0.55,
                      outline: resource === id ? '2px solid var(--ink)' : 'none',
                    }}
                  >
                    {RESOURCES[id].label} ({held})
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div style={S.foot}>
          <button
            style={S.btn}
            disabled={busy || !target || !resource}
            onClick={() => onRun('donations', { targetPlayerId: target, resource })}
          >
            Snatch
          </button>
          <button style={S.ghost} onClick={onCancel}>cancel</button>
        </div>
      </div>
    )
  }

  // ── Board-targeted powers: just say what to click ────────────────────────
  const instructions = {
    breaking_ground:
      'Click any voter on the board to evict it back to its owner. Majority voters included; Volatile Areas are immune.',
    payback: "Click an opponent's voter to discard it permanently. Costs 1 resource.",
    tough_love: `Click 2 voters belonging to the same opponent in the same zone. Costs 2 Trust + any 2. (${
      (power.picked || []).length
    }/2 selected)`,
  }

  return (
    <div style={S.panel}>
      <p style={S.prompt}>
        <strong>{power.name}</strong> — {instructions[power.action] || 'Select a target.'}
      </p>
      <button style={S.ghost} onClick={onCancel}>cancel</button>
    </div>
  )
}

function Stepper({ id, value, onDown, onUp, upDisabled }) {
  return (
    <span style={S.stepper}>
      <span style={{ ...S.chip, background: RESOURCES[id].color, opacity: 0.9 }}>
        {RESOURCES[id].label}
      </span>
      <button style={S.step} onClick={onDown}>−</button>
      <span style={S.num}>{value}</span>
      <button style={S.step} disabled={upDisabled} onClick={onUp}>+</button>
    </span>
  )
}

const S = {
  panel: {
    border: '1px solid var(--border-2)',
    background: 'var(--surface)',
    borderRadius: 9,
    padding: 12,
    marginTop: 10,
  },
  prompt: { fontSize: 13, margin: '0 0 10px', lineHeight: 1.45 },
  label: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--ink-on-dark-3)', margin: '10px 0 5px' },
  row: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  chip: {
    padding: '4px 10px', borderRadius: 11, fontSize: 11, color: 'var(--surface)',
    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  stepper: { display: 'flex', alignItems: 'center', gap: 4 },
  step: {
    width: 21, height: 21, border: '1px solid var(--border)', background: 'var(--surface)',
    borderRadius: 4, cursor: 'pointer', lineHeight: 1,
  },
  num: { minWidth: 14, textAlign: 'center', fontSize: 13 },
  foot: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 },
  btn: {
    padding: '8px 15px', background: 'var(--ink)', color: 'var(--surface)', border: 'none',
    borderRadius: 6, fontSize: 13, cursor: 'pointer',
  },
  ghost: {
    padding: '6px 11px', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 12, cursor: 'pointer',
  },
}
