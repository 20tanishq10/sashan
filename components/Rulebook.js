// SHASN rulebook summary, rendered from the engine's own constants so it can
// never drift from what the code actually does. Page references are to the
// Essential Edition India rulebook.

import { useState } from 'react'
import { ZONES, ZONE_IDS, TOTAL_AREAS, TOTAL_MAJORITY_POINTS } from '../lib/shasn/zones'
import {
  RESOURCES,
  RESOURCE_IDS,
  IDEOLOGUES,
  IDEOLOGUE_IDS,
  DEFAULT_RESOURCE_CAP,
  IDEOLOGY_REDRAW_COST,
  OPEN_VOTER_CARDS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  LEVEL_3_THRESHOLD,
  LEVEL_5_THRESHOLD,
} from '../lib/shasn/constants'

const SECTIONS = [
  {
    icon: '🎯',
    title: 'Objective',
    body: (
      <p>
        You are a politician contesting an election across <strong>{ZONE_IDS.length} zones</strong>.
        The game ends when every possible majority has been formed. Each voter used to form a
        majority is worth 1 point, and the player with the most majority voters wins — not the
        player who captured the most zones. There are{' '}
        <strong>{TOTAL_MAJORITY_POINTS} points</strong> on the board across{' '}
        {TOTAL_AREAS} voter areas. {MIN_PLAYERS}–{MAX_PLAYERS} players.
      </p>
    ),
  },
  {
    icon: '🗺',
    title: 'Forming majorities',
    body: (
      <>
        <p>
          Each zone holds a fixed number of voters, and the fraction printed on it is its majority
          requirement — more than half. Form a majority by influencing that many voters there. A
          majority forms the instant the requirement is met.
        </p>
        <p style={{ marginTop: 8 }}>
          Extra voters beyond the requirement score nothing. A majority <em>breaks</em> if you drop
          below the requirement.
        </p>
        <table className="rulebook-table">
          <thead>
            <tr><th>Zone</th><th>Majority</th><th>Areas</th></tr>
          </thead>
          <tbody>
            {ZONE_IDS.map((id) => (
              <tr key={id}>
                <td>{ZONES[id].label}</td>
                <td>{ZONES[id].majority}</td>
                <td>{ZONES[id].areas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  {
    icon: '🔄',
    title: 'Your turn',
    body: (
      <>
        <p>There are no action points. A turn runs:</p>
        <ol style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>
            <strong>Answer an Ideology Card.</strong> Two answers, each belonging to a different
            Ideologue, each paying different resources. You may pay any {IDEOLOGY_REDRAW_COST}{' '}
            resources to redraw it first.
          </li>
          <li>
            <strong>Check your resource cap.</strong> Over {DEFAULT_RESOURCE_CAP}? Discard down
            before doing anything else.
          </li>
          <li>
            <strong>Act as often as you can afford</strong> — influence Voter Cards, place voters,
            trade, buy and play Conspiracy Cards, Gerrymander, use Ideologue powers.
          </li>
          <li>
            <strong>Resolve Headlines</strong> for any voter you placed in a Volatile Area.
          </li>
        </ol>
      </>
    ),
  },
  {
    icon: '💰',
    title: 'Resources and Voter Cards',
    body: (
      <>
        <p>
          Four resources, all equally important, all earned from Ideology Cards and passive
          Ideologue powers. Your cap is {DEFAULT_RESOURCE_CAP} <em>in total</em>, not per type.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
          {RESOURCE_IDS.map((id) => (
            <span
              key={id}
              style={{
                background: RESOURCES[id].color,
                color: 'var(--surface)',
                padding: '3px 10px',
                borderRadius: 10,
                fontSize: 12,
              }}
            >
              {RESOURCES[id].label}
            </span>
          ))}
        </div>
        <p>
          {OPEN_VOTER_CARDS} Voter Cards are always face up. Pay a card&apos;s cost to the Public
          Reserve to influence its voters, then place them all in a{' '}
          <strong>single zone</strong> — they cannot be split. If the zone lacks room for the whole
          card, every voter on it is discarded. A white pip means any resource of your choice.
        </p>
      </>
    ),
  },
  {
    icon: '⚡',
    title: 'Ideologues',
    body: (
      <>
        <p>
          Every Ideology Card you answer is kept and counts toward its Ideologue. For every 2 cards
          of one Ideologue you gain 1 extra resource of that type each turn. {LEVEL_3_THRESHOLD}{' '}
          cards unlock their Level 3 power, {LEVEL_5_THRESHOLD} their Level 5.
        </p>
        <table className="rulebook-table">
          <thead>
            <tr><th>Ideologue</th><th>Level 3</th><th>Level 5</th></tr>
          </thead>
          <tbody>
            {IDEOLOGUE_IDS.map((id) => (
              <tr key={id}>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: IDEOLOGUES[id].color,
                      marginRight: 7,
                    }}
                  />
                  {IDEOLOGUES[id].label}
                </td>
                <td>{IDEOLOGUES[id].level3.name}</td>
                <td>{IDEOLOGUES[id].level5.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  {
    icon: '🗳',
    title: 'Gerrymandering',
    body: (
      <p>
        Holding strictly the most voters in a zone gives you Gerrymandering Rights there: once per
        turn you may move one non-majority voter into, out of, or between zones adjacent to it. Ties
        mean nobody holds the rights. Voters in Volatile Areas can never be moved.
      </p>
    ),
  },
  {
    icon: '📰',
    title: 'Volatile Areas, Headlines and Conspiracies',
    body: (
      <p>
        Eleven areas are Volatile. Placing a voter in one triggers a Headline, drawn and resolved at
        the end of that turn — and that voter becomes permanent, immune to being moved, converted,
        evicted or discarded. Conspiracy Cards are bought from the top of the deck for any 4
        resources, held without limit, and played at any point in your turn.
      </p>
    ),
  },
]

export default function Rulebook() {
  const [open, setOpen] = useState(null)
  return (
    <div className="rulebook">
      <h2 style={{ fontSize: 16, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--ink-2)' }}>
        How to play
      </h2>
      {SECTIONS.map((s, i) => (
        <div key={s.title} style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              padding: '11px 0',
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{s.icon} &nbsp;{s.title}</span>
            <span style={{ color: 'var(--ink-3)' }}>{open === i ? '−' : '+'}</span>
          </button>
          {open === i && (
            <div style={{ padding: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)' }}>
              {s.body}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function RulebookModal({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 10,
          padding: 22,
          maxWidth: 620,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        <Rulebook />
        <button
          onClick={onClose}
          style={{
            marginTop: 14,
            padding: '8px 16px',
            background: 'var(--ink)',
            color: 'var(--surface)',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
