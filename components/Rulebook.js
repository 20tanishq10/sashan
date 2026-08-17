import { useState } from 'react'
import {
  BLOCS,
  AP_PER_ROUND,
  RALLY_AP_COST,
  RALLY_BONUS,
  MAX_ROUNDS,
  ALLIANCE_HONOR_BONUS,
  ALLIANCE_BETRAY_BONUS,
  ALLIANCE_BETRAYED_PENALTY,
  SCORING_CHECKPOINT_ROUNDS,
} from '../lib/game/constants'

// ── Must be declared before SECTIONS so no TDZ in the minified bundle ────────
const ZONE_DESC = {
  frontier:  'Border towns, veterans, hardline local bosses',
  agraria:   'Granaries, mandis, subsidy politics',
  capital:   'Cabinet whispers, donors, institutional power',
  coast:     'Ports, customs houses, merchant networks',
  foundry:   'Industrial belts and labour unions',
  riverland: 'Floodplains, canals, local patronage',
  highlands: 'Mountain councils and autonomy movements',
  metro:     'Studios, startups, urban middle-class opinion',
  delta:     'Fishing cooperatives, relief politics, migration',
}

// ── Sections defined as a function so JSX is evaluated at render time ────────
function getSections() {
  return [
    {
      icon: '🎯',
      title: 'Objective',
      content: (
        <p>
          You are a political campaign competing for control of the{' '}
          <strong>Republic of Meridia</strong>. Over <strong>{MAX_ROUNDS} rounds</strong>, spend
          Action Points to play Policy cards, hold Rallies, and deploy Attack files against rivals.
          The candidate with the highest total voter support across all nine zones wins.
        </p>
      ),
    },
    {
      icon: '🗺',
      title: 'The nine voter blocs',
      content: (
        <>
          <p style={{ marginBottom: 10 }}>
            The national map is divided into nine contested zones. Support in each zone is
            independent — a strong local bloc does not help you elsewhere.
          </p>
          <table className="rulebook-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Character</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(BLOCS).map(([id, b]) => (
                <tr key={id}>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: b.color,
                        marginRight: 7,
                        verticalAlign: 'middle',
                      }}
                    />
                    {b.label}
                  </td>
                  <td>{ZONE_DESC[id]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    },
    {
      icon: '⚡',
      title: 'Turn structure',
      content: (
        <>
          <p>
            Play proceeds in turn order. On your turn you have{' '}
            <strong>{AP_PER_ROUND} Action Points (AP)</strong>. You may spend them in any
            combination:
          </p>
          <ul style={{ marginTop: 10 }}>
            <li>
              <strong>Play a Policy card</strong> — costs 1 or 2 AP. Gains support in one or two
              zones.
            </li>
            <li>
              <strong>Play an Attack card</strong> — costs 2 AP. Reduces a chosen rival's support
              in a zone.
            </li>
            <li>
              <strong>Hold a Rally</strong> — costs {RALLY_AP_COST} AP. Instantly adds +
              {RALLY_BONUS} support in any one zone.
            </li>
            <li>
              <strong>Propose an Alliance</strong> — costs 1 AP. See the Alliances section.
            </li>
            <li>
              <strong>Yield the floor</strong> — end your turn at any time. Unused AP is lost.
            </li>
          </ul>
          <p style={{ marginTop: 10 }}>
            After the last player in a round yields, a new round begins: everyone draws up to hand
            limit, AP resets to {AP_PER_ROUND}, and the first player acts again.
          </p>
        </>
      ),
    },
    {
      icon: '🃏',
      title: 'Card types',
      content: (
        <>
          <table className="rulebook-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Cost</th>
                <th>Effect</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Policy</td>
                <td>1–2 AP</td>
                <td>
                  Adds support in one or two zones for <em>you</em>. Drawn at game start and
                  refilled each round.
                </td>
              </tr>
              <tr>
                <td>Attack</td>
                <td>2 AP</td>
                <td>
                  Reduces support for a <em>chosen opponent</em> in a zone. Seeded every other
                  round (max 2 per hand).
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginTop: 10 }}>
            Every player starts with the same 5-card <strong>Starter Hand</strong>.
          </p>
        </>
      ),
    },
    {
      icon: '🌩',
      title: 'National events',
      content: (
        <p>
          At the end of rounds <strong>3, 6, and 9</strong> a random Event card is drawn and
          applied to every player simultaneously. Events shift support up or down across one or two
          zones for all campaigns. Eight unique events exist; each fires at most once per game.
        </p>
      ),
    },
    {
      icon: '🤝',
      title: 'Alliances & betrayal',
      content: (
        <>
          <p>On your turn, spend 1 AP to propose a secret alliance with another player:</p>
          <ul style={{ marginTop: 8 }}>
            <li>Choose your rival, the bloc you stake, and the bloc they stake.</li>
            <li>
              Your rival can <strong>Accept</strong> or <strong>Decline</strong> from their
              Alliance panel.
            </li>
            <li>
              At each scoring checkpoint both parties independently choose{' '}
              <strong>Honour</strong> or <strong>Betray</strong>. Neither sees the other's choice
              until both have submitted.
            </li>
          </ul>
          <table className="rulebook-table" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Effect</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Both honour</td>
                <td>Each gains +{ALLIANCE_HONOR_BONUS} support in their staked bloc</td>
              </tr>
              <tr>
                <td>Betrayer wins</td>
                <td>
                  Betrayer +{ALLIANCE_BETRAY_BONUS}, honoured party −{ALLIANCE_BETRAYED_PENALTY}
                </td>
              </tr>
              <tr>
                <td>Both betray</td>
                <td>Both lose a small amount of support</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
    },
    {
      icon: '📊',
      title: 'Scoring checkpoints',
      content: (
        <>
          <p>
            At the end of rounds{' '}
            <strong>{SCORING_CHECKPOINT_ROUNDS.join(', ')}</strong>, a standings snapshot is
            recorded and shown in the end-game summary.
          </p>
          <p style={{ marginTop: 8 }}>
            Checkpoints also trigger alliance resolution — accepted alliances must be honoured or
            betrayed at each checkpoint.
          </p>
        </>
      ),
    },
    {
      icon: '🏆',
      title: 'Winning',
      content: (
        <>
          <p>
            After round {MAX_ROUNDS} ends, support totals are tallied. The player with the{' '}
            <strong>highest combined support</strong> across all nine zones wins the Republic.
          </p>
          <p style={{ marginTop: 8 }}>
            Broad coalitions beat deep single-zone leads — spread thin but wide.
          </p>
        </>
      ),
    },
  ]
}

// ── Shared section row ────────────────────────────────────────────────────────
function SectionRow({ section, index, isOpen, onToggle, paddingX }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={() => onToggle(index)}
        style={{
          appearance: 'none',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: `14px ${paddingX}px`,
          color: 'var(--text)',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>
          {section.icon}
        </span>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{section.title}</span>
        <span
          style={{
            color: 'var(--text-3)',
            fontSize: 14,
            transition: 'transform 200ms',
            transform: isOpen ? 'rotate(180deg)' : 'none',
          }}
        >
          ↓
        </span>
      </button>
      {isOpen && (
        <div
          className="rulebook-section-content"
          style={{ padding: `0 ${paddingX}px 16px ${paddingX + 36}px` }}
        >
          {section.content}
        </div>
      )}
    </div>
  )
}

// ── Inline collapsible (homepage) ─────────────────────────────────────────────
export default function Rulebook() {
  const [open, setOpen] = useState(false)
  const [openSections, setOpenSections] = useState({})
  const sections = getSections()

  function toggle(idx) {
    setOpenSections((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }

  return (
    <div className="rulebook">
      <button
        type="button"
        className="rulebook-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="row gap-12">
          <span className="label label--accent" style={{ marginBottom: 0 }}>
            Rulebook
          </span>
          <h2>How to play Sashan</h2>
        </div>
        <span className={`rulebook-toggle${open ? ' is-open' : ''}`} aria-hidden="true">
          ↓
        </span>
      </button>

      <div className={`rulebook-body${open ? ' is-open' : ''}`}>
        {sections.map((section, idx) => (
          <SectionRow
            key={idx}
            section={section}
            index={idx}
            isOpen={!!openSections[idx]}
            onToggle={toggle}
            paddingX={24}
          />
        ))}
      </div>
    </div>
  )
}

// ── Modal (game page) ─────────────────────────────────────────────────────────
export function RulebookModal({ onClose }) {
  const [openSections, setOpenSections] = useState({ 0: true })
  const sections = getSections()

  function toggle(idx) {
    setOpenSections((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }

  return (
    <div
      className="rulebook-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="rulebook-modal" role="dialog" aria-modal="true" aria-label="Rulebook">
        <div className="rulebook-modal-header">
          <div className="row gap-8">
            <span className="label label--accent" style={{ marginBottom: 0 }}>
              Rulebook
            </span>
            <h2>How to play</h2>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            aria-label="Close rulebook"
          >
            ✕
          </button>
        </div>

        {sections.map((section, idx) => (
          <SectionRow
            key={idx}
            section={section}
            index={idx}
            isOpen={!!openSections[idx]}
            onToggle={toggle}
            paddingX={22}
          />
        ))}
      </div>
    </div>
  )
}
