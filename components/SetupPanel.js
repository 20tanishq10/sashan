// SHASN — the pre-game ceremony (rulebook p.6, p.13).
//
// Three steps, in order:
//   1. Everyone votes for Player 1. You cannot vote for yourself. A tie means
//      voting again — the rulebook is blunt about it.
//   2. Seat order settles, and each player picks their own opening resources:
//      Player 1 takes any 1, Player 2 any 2, and so on up to Player 5.
//   3. The host may remove content-advisory cards, then start.
//
// The host can waive the whole thing if the table would rather just play.

import { useState } from 'react'
import { RESOURCES, RESOURCE_IDS } from '../lib/shasn/constants'
import * as Setup from '../lib/shasn/setup'

export default function SetupPanel({ setup, players, meId, isHost, busy, onAction }) {
  const s = Setup.normaliseSetup(setup)
  const name = (id) => players.find((p) => p.id === id)?.nickname || '—'

  return (
    <div className="lobby-panel">
      <h3>Setting up</h3>
      <ol style={S.steps}>
        <Step n={1} label="Vote for Player 1" state={stepState(s, Setup.SETUP_STEPS.VOTE)} />
        <Step n={2} label="Choose opening resources" state={stepState(s, Setup.SETUP_STEPS.RESOURCES)} />
        <Step n={3} label="Ready to play" state={stepState(s, Setup.SETUP_STEPS.READY)} />
      </ol>

      {s.step === Setup.SETUP_STEPS.VOTE && (
        <VoteStep s={s} players={players} meId={meId} busy={busy} onAction={onAction} name={name} />
      )}

      {s.step === Setup.SETUP_STEPS.RESOURCES && (
        <ResourceStep s={s} players={players} meId={meId} busy={busy} onAction={onAction} name={name} />
      )}

      {s.step === Setup.SETUP_STEPS.READY && (
        <ReadyStep s={s} players={players} name={name} />
      )}

      {isHost && (
        <>
          <AdvisoryToggle s={s} busy={busy} onAction={onAction} />
          <div style={S.hostRow}>
            {s.step !== Setup.SETUP_STEPS.READY && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => onAction('skip', {})}
              >
                Skip setup
              </button>
            )}
            {(s.step !== Setup.SETUP_STEPS.VOTE || s.round > 1) && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => onAction('reset', {})}
              >
                Start setup over
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function stepState(s, step) {
  const order = [Setup.SETUP_STEPS.VOTE, Setup.SETUP_STEPS.RESOURCES, Setup.SETUP_STEPS.READY]
  const at = order.indexOf(s.step)
  const mine = order.indexOf(step)
  if (mine < at) return 'done'
  if (mine === at) return 'now'
  return 'todo'
}

function Step({ n, label, state }) {
  return (
    <li style={{ ...S.step, ...(state === 'now' ? S.stepNow : null), opacity: state === 'todo' ? 0.45 : 1 }}>
      <span style={S.stepNum}>{state === 'done' ? '✓' : n}</span>
      {label}
    </li>
  )
}

// ---------------------------------------------------------------------------

function VoteStep({ s, players, meId, busy, onAction, name }) {
  const myVote = s.votes[meId]
  const voted = players.filter((p) => s.votes[p.id]).length

  return (
    <div style={S.body}>
      {s.round > 1 && s.tiedLast && (
        <p style={S.notice}>
          Round {s.round - 1} tied between {s.tiedLast.map(name).join(' and ')}. Vote again.
        </p>
      )}
      <p style={S.help}>
        Who goes first? You cannot vote for yourself. {voted}/{players.length} votes in — they stay
        secret until everyone has cast one.
      </p>
      <div style={S.choices}>
        {players
          .filter((p) => p.id !== meId)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => onAction('vote', { choice: p.id })}
              style={{ ...S.choice, ...(myVote === p.id ? S.choiceOn : null) }}
            >
              {p.nickname}
            </button>
          ))}
      </div>
      {myVote && <p style={S.help}>You voted for {name(myVote)}. Tap another name to change it.</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------

function ResourceStep({ s, players, meId, busy, onAction, name }) {
  const allowance = Setup.resourceAllowance(s, meId)
  const [pick, setPick] = useState(() => Object.fromEntries(RESOURCE_IDS.map((id) => [id, 0])))
  const chosen = Object.values(pick).reduce((a, b) => a + b, 0)
  const submitted = s.resources[meId]

  const seat = s.order ? s.order.indexOf(meId) + 1 : 0
  const waiting = players.filter((p) => !s.resources[p.id])

  if (submitted) {
    return (
      <div style={S.body}>
        <p style={S.help}>
          You took {describePool(submitted)}. Waiting on{' '}
          {waiting.map((p) => p.nickname).join(', ') || 'nobody'}.
        </p>
        <SeatOrder s={s} name={name} />
      </div>
    )
  }

  return (
    <div style={S.body}>
      <p style={S.help}>
        {s.order?.[0] === meId ? 'You go first. ' : `${name(s.order?.[0])} goes first. `}
        You are Player {seat}, so you take any <strong>{allowance}</strong> resource
        {allowance === 1 ? '' : 's'} to start (p.6).
      </p>

      <div style={S.picker}>
        {RESOURCE_IDS.map((id) => (
          <div key={id} style={S.pickRow}>
            <span style={{ ...S.swatch, background: RESOURCES[id].color }} />
            <span style={S.pickName}>{RESOURCES[id].label}</span>
            <button
              type="button"
              style={S.step2}
              disabled={busy || pick[id] === 0}
              onClick={() => setPick({ ...pick, [id]: pick[id] - 1 })}
            >
              −
            </button>
            <span style={S.pickCount}>{pick[id]}</span>
            <button
              type="button"
              style={S.step2}
              disabled={busy || chosen >= allowance}
              onClick={() => setPick({ ...pick, [id]: pick[id] + 1 })}
            >
              +
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={busy || chosen !== allowance}
        onClick={() => onAction('pick_resources', { pool: pick })}
      >
        {chosen === allowance ? 'Take these' : `Choose ${allowance - chosen} more`}
      </button>

      <SeatOrder s={s} name={name} />
    </div>
  )
}

function SeatOrder({ s, name }) {
  if (!s.order) return null
  return (
    <p style={S.seats}>
      Turn order: {s.order.map((id, i) => `${i + 1}. ${name(id)}`).join('  ·  ')}
    </p>
  )
}

function describePool(pool) {
  const parts = RESOURCE_IDS.filter((id) => pool[id] > 0).map(
    (id) => `${pool[id]} ${RESOURCES[id].label}`
  )
  return parts.join(', ') || 'nothing'
}

// ---------------------------------------------------------------------------

function ReadyStep({ s, name }) {
  return (
    <div style={S.body}>
      {s.skipped ? (
        <p style={S.help}>
          Setup was skipped — seats follow join order and opening resources are dealt automatically.
        </p>
      ) : (
        <p style={S.help}>Everyone has voted and chosen. The host can start the election.</p>
      )}
      <SeatOrder s={s} name={name} />
    </div>
  )
}

function AdvisoryToggle({ s, busy, onAction }) {
  const toggle = (id) => {
    const next = s.excludeAdvisory.includes(id)
      ? s.excludeAdvisory.filter((x) => x !== id)
      : [...s.excludeAdvisory, id]
    onAction('set_advisory', { exclude: next })
  }
  return (
    <div style={S.advisory}>
      <span style={S.advisoryTitle}>Content advisory (p.13)</span>
      <p style={S.help}>
        Some cards carry heavier themes. Removing them does not affect gameplay.
      </p>
      {Setup.ADVISORIES.map((a) => (
        <label key={a.id} style={S.checkRow}>
          <input
            type="checkbox"
            disabled={busy}
            checked={s.excludeAdvisory.includes(a.id)}
            onChange={() => toggle(a.id)}
          />
          Remove: {a.label}
        </label>
      ))}
    </div>
  )
}

const S = {
  steps: { listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'grid', gap: 5 },
  step: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 },
  stepNow: { fontWeight: 600 },
  stepNum: {
    display: 'grid', placeItems: 'center', width: 19, height: 19, borderRadius: '50%',
    background: 'rgba(0,0,0,.08)', fontSize: 11, flexShrink: 0,
  },
  body: { display: 'grid', gap: 10 },
  help: { fontSize: 12.5, lineHeight: 1.5, margin: 0, opacity: 0.8 },
  notice: {
    fontSize: 12.5, lineHeight: 1.5, margin: 0, padding: '7px 10px', borderRadius: 6,
    background: 'rgba(200,140,40,.14)',
  },
  choices: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  choice: {
    padding: '7px 13px', borderRadius: 20, border: '1px solid rgba(0,0,0,.18)',
    background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'inherit',
  },
  choiceOn: { background: 'var(--good)', color: 'var(--surface)', borderColor: 'var(--good)' },
  picker: { display: 'grid', gap: 5 },
  pickRow: { display: 'flex', alignItems: 'center', gap: 8 },
  swatch: { width: 12, height: 12, borderRadius: 3, flexShrink: 0 },
  pickName: { fontSize: 12.5, flex: 1 },
  step2: {
    width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(0,0,0,.18)',
    background: 'transparent', cursor: 'pointer', fontSize: 14, lineHeight: 1, color: 'inherit',
  },
  pickCount: { fontSize: 13, minWidth: 16, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
  seats: { fontSize: 11.5, opacity: 0.7, margin: 0, lineHeight: 1.5 },
  advisory: { marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,.1)', display: 'grid', gap: 6 },
  advisoryTitle: { fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', opacity: 0.6 },
  checkRow: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, cursor: 'pointer' },
  hostRow: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
}
