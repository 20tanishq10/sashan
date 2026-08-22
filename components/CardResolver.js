// Resolving a Headline or Conspiracy that needs input.
//
// Cards declare a `mode`. Mechanically resolvable ones get a real picker here —
// without it they fall through to the manual box and do nothing, which is how
// Vikas Model (4 of the 20 Conspiracies) and Time's Up ended up inert.
//
// Cards that are genuine negotiations or votes ("convince 2 other players to
// become investors", "your opponents will vote and decide") still get the
// manual box. Automating those would destroy them.

import { useState } from 'react'
import Card, { CardText } from './Card'
import IdeologueMark from './IdeologueMark'
import * as R from '../lib/shasn/resources'
import { RESOURCES, RESOURCE_IDS, IDEOLOGUES, IDEOLOGUE_IDS } from '../lib/shasn/constants'

export default function CardResolver({
  card,
  kind,
  prompt,
  onResolve,
  onManual,
  busy,
  players = [], // needed only by the cards that choose people
  myPlayerId = null,
}) {
  const effect = card?.effect
  const options = effect?.type === 'choice' ? effect.options : null
  const [picked, setPicked] = useState(null)
  const [take, setTake] = useState(R.emptyPool())
  const [note, setNote] = useState('')
  // Jumla picks an Ideologue; Polo Retreat picks two players. Both are held here
  // rather than in the page, because they only exist while this card is up.
  const [ideologue, setIdeologue] = useState(null)
  const [pair, setPair] = useState([])

  if (!card) return null

  const chosen = options?.find((o) => o.id === picked)
  const needsResourcePick =
    chosen?.effect?.type === 'gainAny' ? chosen.effect.amount : null
  const takeTotal = R.poolTotal(take)

  const deck = kind === 'headline' ? 'headline' : 'conspiracy'

  return (
    <Card
      className="shasn-deal"
      deck={deck}
      title={card.name}
      badge={badgeFor(card.cost)}
      footer={card.clarification || null}
      style={{ marginTop: 12 }}
    >
      <CardText>{card.text}</CardText>

      {effect?.type === 'wildIdeologyCard' ? (
        /* Jumla (p.18) — "This is an extra Ideology Card of your choice."
           The choice is which Ideologue it stacks under, which decides both what
           it unlocks and what an opponent pays to take it off you. */
        <>
          <p style={S.prompt}>{prompt || 'Place Jumla under an Ideologue:'}</p>
          <div style={S.options}>
            {IDEOLOGUE_IDS.map((id) => (
              <button
                key={id}
                onClick={() => setIdeologue(id)}
                style={{
                  ...S.option,
                  borderColor: ideologue === id ? 'var(--accent)' : 'var(--border)',
                  background: ideologue === id ? 'var(--accent-bg)' : 'var(--surface)',
                }}
              >
                <IdeologueMark ideologue={id} size={16} />
                {IDEOLOGUES[id].label}
              </button>
            ))}
          </div>
          <button
            style={S.primary}
            disabled={busy || !ideologue}
            onClick={() => onResolve(ideologue)}
          >
            Place it
          </button>
        </>
      ) : effect?.type === 'sharePowers' ? (
        /* Polo Retreat (p.17) — "Choose 2 players." Including yourself is legal:
           the card says players, not opponents. */
        <>
          <p style={S.prompt}>
            {prompt || `Choose ${effect.players} players to pair (${pair.length}/${effect.players}):`}
          </p>
          <div style={S.options}>
            {players.map((p) => {
              const on = pair.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    setPair(
                      on
                        ? pair.filter((x) => x !== p.id)
                        : pair.length >= effect.players
                          ? pair
                          : [...pair, p.id]
                    )
                  }
                  style={{
                    ...S.option,
                    borderColor: on ? 'var(--accent)' : 'var(--border)',
                    background: on ? 'var(--accent-bg)' : 'var(--surface)',
                  }}
                >
                  {p.name}
                  {p.id === myPlayerId && <span style={S.badge}>you</span>}
                </button>
              )
            })}
          </div>
          <button
            style={S.primary}
            disabled={busy || pair.length !== effect.players}
            onClick={() => onResolve(null, { targets: pair })}
          >
            Pair them
          </button>
        </>
      ) : options ? (
        <>
          <p style={S.prompt}>{prompt || 'Pick one:'}</p>
          <div style={S.options}>
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setPicked(o.id)
                  setTake(R.emptyPool())
                }}
                style={{
                  ...S.option,
                  borderColor: picked === o.id ? 'var(--accent)' : 'var(--border)',
                  background: picked === o.id ? 'var(--accent-bg)' : 'var(--surface)',
                }}
              >
                {labelFor(o)}
                {o.requiresCopies && (
                  <span style={S.badge}>needs {o.requiresCopies} copies</span>
                )}
              </button>
            ))}
          </div>

          {needsResourcePick && (
            <>
              <p style={S.prompt}>
                Take any {needsResourcePick} ({takeTotal}/{needsResourcePick})
              </p>
              <div style={S.steppers}>
                {RESOURCE_IDS.map((id) => (
                  <div key={id} style={S.stepper}>
                    <span style={{ ...S.chip, background: RESOURCES[id].color, color: RESOURCES[id].ink }}>
                      <IdeologueMark
                        ideologue={RESOURCES[id].ideologue}
                        size={11}
                        color={RESOURCES[id].ink || '#ffffff'}
                        stroke={4}
                      />
                      {RESOURCES[id].label}
                    </span>
                    <button
                      style={S.step}
                      onClick={() => setTake({ ...take, [id]: Math.max(0, take[id] - 1) })}
                    >
                      −
                    </button>
                    <span style={S.num}>{take[id]}</span>
                    <button
                      style={S.step}
                      disabled={takeTotal >= needsResourcePick}
                      onClick={() => setTake({ ...take, [id]: take[id] + 1 })}
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            style={S.primary}
            disabled={
              busy || !picked || (needsResourcePick && takeTotal !== needsResourcePick)
            }
            onClick={() =>
              onResolve({
                optionId: picked,
                ...(needsResourcePick ? { resources: take } : {}),
              })
            }
          >
            Resolve
          </button>
        </>
      ) : (
        <>
          <p style={S.prompt}>
            {prompt ||
              'This one is settled at the table — negotiate or vote it out, then record what you agreed.'}
          </p>
          <input
            style={S.input}
            placeholder="What did you agree?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button style={S.primary} disabled={busy} onClick={() => onManual(note)}>
            Mark resolved
          </button>
        </>
      )}
    </Card>
  )
}

/**
 * A card's cost as something React can render.
 *
 * Conspiracy costs are objects — `{ any: 4 }` — not numbers, so passing the raw
 * value through crashed the whole room with "Objects are not valid as a React
 * child" the moment any Conspiracy Card needed resolving by hand. Headlines have
 * no cost at all.
 */
function badgeFor(cost) {
  if (cost == null) return null
  if (typeof cost === 'number') return cost
  const total = RESOURCE_IDS.reduce((n, id) => n + (cost[id] || 0), 0) + (cost.any || 0)
  return total || null
}

function labelFor(option) {
  const e = option.effect || {}
  if (e.type === 'gainAny') return `Take any ${e.amount} resources`
  if (e.type === 'gain') {
    const parts = RESOURCE_IDS.filter((r) => e.resources?.[r]).map(
      (r) => `${e.resources[r]} ${RESOURCES[r].label}`
    )
    return `Get ${parts.join(' + ')}`
  }
  if (e.type === 'convertZone') return 'Seize a 6/11 zone'
  if (e.type === 'discardOwnVoters') return `Discard ${e.count} of your own voters`
  if (e.type === 'donateVoter') return `Donate ${e.count} voter to your left`
  return option.id.replace(/_/g, ' ')
}

const S = {
  // The hairline that says which deck this came off.
  prompt: { fontSize: 13, margin: '13px 0 8px', fontWeight: 600 },
  options: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  option: {
    flex: '1 1 190px', textAlign: 'left', padding: '10px 12px',
    border: '1.5px solid var(--border)', borderRadius: 'var(--r-md)', cursor: 'pointer',
    fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4,
    background: 'var(--surface)',
    transition: 'border-color 140ms var(--ease-out), background 140ms var(--ease-out)',
  },
  badge: { fontSize: 10, color: 'var(--ink-3)' },
  steppers: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  stepper: { display: 'flex', alignItems: 'center', gap: 5 },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 9px 2px 6px', borderRadius: 999, fontSize: 11,
    whiteSpace: 'nowrap', fontWeight: 550,
  },
  step: {
    width: 22, height: 22, border: '1px solid var(--border-2)', background: 'var(--surface)',
    borderRadius: 'var(--r-sm)', cursor: 'pointer', lineHeight: 1,
  },
  num: { minWidth: 16, textAlign: 'center', fontSize: 13, fontVariantNumeric: 'tabular-nums' },
  input: {
    padding: '9px 11px', border: '1px solid var(--border-2)', borderRadius: 'var(--r-md)',
    fontSize: 13, width: '100%', boxSizing: 'border-box', marginBottom: 8,
    background: 'var(--surface)',
  },
  primary: {
    padding: '9px 18px', background: 'var(--accent)', color: 'var(--on-dark)',
    border: 'none', borderRadius: 'var(--r-md)', fontSize: 14, fontWeight: 550,
    cursor: 'pointer', marginTop: 10,
  },
}
