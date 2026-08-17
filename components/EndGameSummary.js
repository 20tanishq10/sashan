import { BLOCS } from '../lib/game/constants'

const OUTCOME_META = {
  mutual_honor: {
    label: 'Both honoured',
    className: 'outcome--honor',
    icon: '🤝',
  },
  mutual_betray: {
    label: 'Both betrayed',
    className: 'outcome--betray',
    icon: '🗡',
  },
  proposer_betrayed: {
    label: 'Proposer betrayed',
    className: 'outcome--betray',
    icon: '🗡',
  },
  target_betrayed: {
    label: 'Target betrayed',
    className: 'outcome--betray',
    icon: '🗡',
  },
}

function ChoiceChip({ choice }) {
  return (
    <span className={`choice-chip choice-chip--${choice}`}>
      {choice === 'honor' ? 'Honoured' : 'Betrayed'}
    </span>
  )
}

function StandingsTable({ snapshot, myPlayerId }) {
  return (
    <ol className="summary-standings">
      {snapshot.map((entry, i) => (
        <li
          key={entry.playerId}
          className={`summary-standings-row${entry.playerId === myPlayerId ? ' highlight' : ''}`}
        >
          <span className="summary-rank">#{i + 1}</span>
          <span className="summary-nickname">{entry.nickname}</span>
          <span className="summary-score">{entry.total} pts</span>
        </li>
      ))}
    </ol>
  )
}

export default function EndGameSummary({ summary, myPlayerId }) {
  if (!summary) return null

  const {
    winner,
    finalStandings,
    checkpointSnapshots,
    resolvedAlliances,
    eventsFired,
    totalRounds,
  } = summary

  return (
    <div className="end-summary">
      {/* ── Winner banner ── */}
      <div className="end-summary-winner">
        <span className="hud-label">Election result</span>
        <h2>{winner?.nickname || finalStandings[0]?.nickname} wins the Republic</h2>
        <p className="end-summary-tagline">
          {winner?.total ?? finalStandings[0]?.total} total support across{' '}
          {totalRounds} rounds
        </p>
      </div>

      {/* ── Final standings ── */}
      <div className="end-summary-section">
        <div className="end-summary-section-header">
          <span className="hud-label">Final count</span>
          <h3>National standings</h3>
        </div>
        <StandingsTable snapshot={finalStandings} myPlayerId={myPlayerId} />
      </div>

      {/* ── Round-by-round checkpoints ── */}
      {checkpointSnapshots.length > 0 && (
        <div className="end-summary-section">
          <div className="end-summary-section-header">
            <span className="hud-label">Campaign timeline</span>
            <h3>Scoring checkpoints</h3>
          </div>
          <div className="checkpoint-timeline">
            {checkpointSnapshots.map(({ round, snapshot }) => (
              <div key={round} className="checkpoint-entry">
                <div className="checkpoint-entry-label">
                  <span className="checkpoint-round-badge">Round {round}</span>
                </div>
                <StandingsTable snapshot={snapshot} myPlayerId={myPlayerId} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Alliance reveals ── */}
      {resolvedAlliances.length > 0 && (
        <div className="end-summary-section">
          <div className="end-summary-section-header">
            <span className="hud-label">Backroom files</span>
            <h3>Alliance &amp; betrayal record</h3>
          </div>
          <div className="alliance-reveals">
            {resolvedAlliances.map((a) => {
              const meta = OUTCOME_META[a.outcome] || OUTCOME_META.mutual_honor
              return (
                <div key={a.id} className={`alliance-reveal-card ${meta.className}`}>
                  <div className="alliance-reveal-header">
                    <span className="alliance-reveal-outcome-icon" aria-hidden="true">
                      {meta.icon}
                    </span>
                    <span className="alliance-reveal-outcome-label">{meta.label}</span>
                    <span className="muted" style={{ marginLeft: 'auto' }}>
                      Round {a.round}
                    </span>
                  </div>
                  <div className="alliance-reveal-parties">
                    <div className="alliance-reveal-party">
                      <strong>{a.proposerNickname}</strong>
                      <span className="alliance-reveal-bloc">
                        {BLOCS[a.proposerBloc]?.label || a.proposerBloc}
                      </span>
                      <ChoiceChip choice={a.proposerChoice} />
                    </div>
                    <span className="alliance-reveal-vs">vs</span>
                    <div className="alliance-reveal-party">
                      <strong>{a.targetNickname}</strong>
                      <span className="alliance-reveal-bloc">
                        {BLOCS[a.targetBloc]?.label || a.targetBloc}
                      </span>
                      <ChoiceChip choice={a.targetChoice} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Events that fired ── */}
      {eventsFired.length > 0 && (
        <div className="end-summary-section">
          <div className="end-summary-section-header">
            <span className="hud-label">National events</span>
            <h3>Events that shaped the race</h3>
          </div>
          <div className="summary-events">
            {eventsFired.map((ev) => (
              <div key={ev.id} className="summary-event-card">
                <strong>{ev.name}</strong>
                <p>{ev.description}</p>
                <div className="summary-event-effects">
                  {ev.effects.map((e, i) => (
                    <span
                      key={i}
                      className={`summary-event-effect ${e.deltaAll >= 0 ? 'effect--positive' : 'effect--negative'}`}
                    >
                      {e.deltaAll > 0 ? '+' : ''}{e.deltaAll} {BLOCS[e.bloc]?.label || e.bloc}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
