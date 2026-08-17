import { useState } from 'react'
import { BLOCS, AP_PER_ROUND, RALLY_AP_COST, RALLY_BONUS, MAX_ROUNDS, ALLIANCE_HONOR_BONUS, ALLIANCE_BETRAY_BONUS, ALLIANCE_BETRAYED_PENALTY, SCORING_CHECKPOINT_ROUNDS } from '../lib/game/constants'

const SECTIONS = [
  {
    icon: '🎯',
    title: 'Objective',
    content: (
      <>
        <p>
          You are a political campaign competing for control of the <strong>Republic of Meridia</strong>.
          Over <strong>{MAX_ROUNDS} rounds</strong>, spend Action Points to play Policy cards,
          hold Rallies, and deploy Attack files against rivals. The candidate with the
          highest total voter support across all nine zones at the end of the final round wins.
        </p>
      </>
    ),
  },
  {
    icon: '🗺',
    title: 'The nine voter blocs',
    content: (
      <>
        <p style={{ marginBottom: 10 }}>
          The national map is divided into nine contested zones. Support in each zone is independent —
          a strong local bloc does not help you elsewhere.
        </p>
        <table className="rulebook-table">
          <thead>
            <tr><th>Zone</th><th>Character</th></tr>
          </thead>
          <tbody>
            {Object.entries(BLOCS).map(([id, b]) => (
              <tr key={id}>
                <td>
                  <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background: b.color, marginRight:7, verticalAlign:'middle' }} />
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
        <p>Play proceeds in turn order. On your turn you have <strong>{AP_PER_ROUND} Action Points (AP)</strong>. You may spend them in any combination:</p>
        <ul style={{ marginTop: 10 }}>
          <li><strong>Play a Policy card</strong> — costs 1 or 2 AP. Gains support in one or two zones.</li>
          <li><strong>Play an Attack card</strong> — costs 2 AP. Reduces a chosen rival's support in a zone.</li>
          <li><strong>Hold a Rally</strong> — costs {RALLY_AP_COST} AP. Instantly adds +{RALLY_BONUS} support in any one zone.</li>
          <li><strong>Propose an Alliance</strong> — costs 1 AP. See Alliances section.</li>
          <li><strong>Yield the floor</strong> — end your turn at any time. Unused AP is lost.</li>
        </ul>
        <p style={{ marginTop: 10 }}>
          After the last player in a round yields, a new round begins: everyone draws up to hand limit,
          AP resets to {AP_PER_ROUND}, and the first player in turn order acts again.
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
            <tr><th>Type</th><th>Cost</th><th>Effect</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Policy</td>
              <td>1–2 AP</td>
              <td>Adds support to one or two zones for <em>you</em>. Drawn at game start and refilled each round.</td>
            </tr>
            <tr>
              <td>Attack / Scandal</td>
              <td>2 AP</td>
              <td>Reduces support in a zone for a <em>chosen opponent</em>. Seeded into hands every other round.</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 10 }}>
          Every player starts with the same 5-card <strong>Starter Hand</strong>.
          New policy cards are drawn at round boundaries. Attack cards appear every 2 rounds (max 2 per hand).
        </p>
      </>
    ),
  },
  {
    icon: '⚡',
    title: 'National events',
    content: (
      <>
        <p>
          At the end of rounds <strong>3, 6, and 9</strong> — before the next round begins —
          a random <strong>Event card</strong> is drawn and applied to every player simultaneously.
          Events shift support up or down across one or two zones for all campaigns.
          Eight unique events exist; each fires at most once per game.
        </p>
      </>
    ),
  },
  {
    icon: '🤝',
    title: 'Alliances & betrayal',
    content: (
      <>
        <p>On your turn, spend 1 AP to propose a secret alliance with another player:</p>
        <ul style={{ marginTop: 8 }}>
          <li>Choose your rival, the bloc <em>you</em> stake, and the bloc <em>they</em> stake.</li>
          <li>Your rival sees the proposal in their Alliance Desk and can <strong>Accept</strong> or <strong>Decline</strong>.</li>
          <li>At each scoring checkpoint, both parties independently choose <strong>Honour</strong> or <strong>Betray</strong>. Neither sees the other's choice until both have submitted.</li>
        </ul>
        <table className="rulebook-table" style={{ marginTop: 10 }}>
          <thead>
            <tr><th>Outcome</th><th>Effect</th></tr>
          </thead>
          <tbody>
            <tr><td>Both honour</td><td>Each gains +{ALLIANCE_HONOR_BONUS} support in their staked bloc</td></tr>
            <tr><td>Betrayer wins</td><td>Betrayer +{ALLIANCE_BETRAY_BONUS}, honoured party −{ALLIANCE_BETRAYED_PENALTY} in their staked blocs</td></tr>
            <tr><td>Both betray</td><td>Both lose a small amount of support</td></tr>
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
          At the end of rounds <strong>{SCORING_CHECKPOINT_ROUNDS.join(', ')}</strong>, the game
          takes a standings snapshot. This snapshot is recorded and shown in the end-game summary
          so you can trace who was leading when.
        </p>
        <p style={{ marginTop: 8 }}>
          Checkpoints also trigger alliance resolution — any accepted alliances must be
          honoured or betrayed at each checkpoint.
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
          After round {MAX_ROUNDS} ends, support totals are tallied across all nine zones.
          The player with the <strong>highest combined support</strong> wins the Republic.
          There are no tiebreakers defined — the election goes to the higher scorer.
        </p>
        <p style={{ marginTop: 8 }}>
          Strategy tip: broad coalitions beat deep single-zone leads. A rival who controls
          one zone heavily is still vulnerable if you spread thinner but wider.
        </p>
      </>
    ),
  },
]

const ZONE_DESC = {
  frontier:   'Border towns, veterans, hardline local bosses',
  agraria:    'Granaries, mandis, subsidy politics',
  capital:    'Cabinet whispers, donors, institutional power',
  coast:      'Ports, customs houses, merchant networks',
  foundry:    'Industrial belts and labour unions',
  riverland:  'Floodplains, canals, local patronage',
  highlands:  'Mountain councils and autonomy movements',
  metro:      'Studios, startups, urban middle-class opinion',
  delta:      'Fishing cooperatives, relief politics, migration',
}

// ── Inline collapsible (for homepage) ────────────────────────────────────────
export default function Rulebook() {
  const [open, setOpen] = useState(false)
  const [openSections, setOpenSections] = useState({})

  function toggleSection(i) {
    setOpenSections((s) => ({ ...s, [i]: !s[i] }))
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
          <span className="label label--accent" style={{ marginBottom: 0 }}>Rulebook</span>
          <h2>How to play Sashan</h2>
        </div>
        <span className={`rulebook-toggle${open ? ' is-open' : ''}`} aria-hidden="true">
          ↓
        </span>
      </button>

      <div className={`rulebook-body${open ? ' is-open' : ''}`}>
        {SECTIONS.map((s, i) => (
          <div key={i} className="rulebook-section" style={{ flexDirection: 'column', padding: 0 }}>
            <button
              type="button"
              onClick={() => toggleSection(i)}
              style={{
                appearance: 'none',
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 24px',
                color: 'var(--text)',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{s.icon}</span>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{s.title}</span>
              <span style={{ color: 'var(--text-3)', fontSize: 14, transition: 'transform 200ms', transform: openSections[i] ? 'rotate(180deg)' : 'none' }}>↓</span>
            </button>
            {openSections[i] && (
              <div className="rulebook-section-content" style={{ padding: '0 24px 18px 60px' }}>
                {s.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Modal version (for in-game use) ──────────────────────────────────────────
export function RulebookModal({ onClose }) {
  const [openSections, setOpenSections] = useState({ 0: true })

  function toggleSection(i) {
    setOpenSections((s) => ({ ...s, [i]: !s[i] }))
  }

  return (
    <div
      className="rulebook-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="rulebook-modal" role="dialog" aria-modal="true" aria-label="Rulebook">
        <div className="rulebook-modal-header">
          <div className="row gap-8">
            <span className="label label--accent" style={{ marginBottom: 0 }}>Rulebook</span>
            <h2>How to play</h2>
          </div>
          <button
            type="button"
            className="btn--ghost btn--sm btn"
            onClick={onClose}
            aria-label="Close rulebook"
          >
            ✕
          </button>
        </div>

        {SECTIONS.map((s, i) => (
          <div key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => toggleSection(i)}
              style={{
                appearance: 'none',
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 22px',
                color: 'var(--text)',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{s.icon}</span>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{s.title}</span>
              <span style={{ color: 'var(--text-3)', fontSize: 14, transition: 'transform 200ms', transform: openSections[i] ? 'rotate(180deg)' : 'none' }}>↓</span>
            </button>
            {openSections[i] && (
              <div className="rulebook-section-content" style={{ padding: '0 22px 16px 58px' }}>
                {s.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
