import { BLOCS } from '../lib/game/constants'

const OUTCOME_LABEL = {
  mutual_honor:     'Both honoured',
  mutual_betray:    'Both betrayed',
  proposer_betrayed:'Proposer betrayed',
  target_betrayed:  'Target betrayed',
}

function StandingsTable({ snapshot, myPlayerId }) {
  return (
    <div className="end-standings">
      {snapshot.map((e, i) => (
        <div key={e.playerId} className={`end-standings-row${e.playerId === myPlayerId ? ' is-me' : ''}`}>
          <span className="end-rank">{i + 1}</span>
          <span className="end-name">{e.nickname}</span>
          <span className="end-score">{e.total}</span>
        </div>
      ))}
    </div>
  )
}

export default function EndGameSummary({ summary, myPlayerId }) {
  if (!summary) return null
  const { winner, finalStandings, checkpointSnapshots, resolvedAlliances, eventsFired, totalRounds } = summary

  return (
    <div className="end-summary">
      {/* Winner */}
      <div className="end-winner">
        <span className="label label--green" style={{ marginBottom: 4 }}>Election result</span>
        <h2>{winner?.nickname || finalStandings[0]?.nickname} wins the Republic</h2>
        <p>{winner?.total ?? finalStandings[0]?.total} total support · {totalRounds} rounds played</p>
      </div>

      {/* Final standings */}
      <div className="end-section">
        <span className="label" style={{ marginBottom: 8 }}>Final standings</span>
        <StandingsTable snapshot={finalStandings} myPlayerId={myPlayerId} />
      </div>

      {/* Checkpoint timeline */}
      {checkpointSnapshots.length > 0 && (
        <div className="end-section">
          <span className="label" style={{ marginBottom: 8 }}>Checkpoint timeline</span>
          <div className="checkpoint-timeline">
            {checkpointSnapshots.map(({ round, snapshot }) => (
              <div key={round} className="checkpoint-entry">
                <div className="checkpoint-round">Round {round}</div>
                <StandingsTable snapshot={snapshot} myPlayerId={myPlayerId} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alliance reveals */}
      {resolvedAlliances.length > 0 && (
        <div className="end-section">
          <span className="label" style={{ marginBottom: 8 }}>Alliance record</span>
          <div className="alliance-reveals">
            {resolvedAlliances.map((a) => {
              const isBetray = a.outcome.includes('betray')
              return (
                <div key={a.id} className={`alliance-reveal-card ${isBetray ? 'outcome--betray' : 'outcome--honor'}`}>
                  <div className="alliance-reveal-head">
                    <span>{isBetray ? '🗡' : '🤝'}</span>
                    <span>{OUTCOME_LABEL[a.outcome]}</span>
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Round {a.round}</span>
                  </div>
                  <div className="alliance-reveal-parties">
                    <div className="alliance-reveal-party">
                      <strong>{a.proposerNickname}</strong>
                      <span className="alliance-reveal-bloc">{BLOCS[a.proposerBloc]?.label}</span>
                      <span className={`choice-chip choice-chip--${a.proposerChoice}`}>{a.proposerChoice}</span>
                    </div>
                    <span className="alliance-reveal-vs">vs</span>
                    <div className="alliance-reveal-party">
                      <strong>{a.targetNickname}</strong>
                      <span className="alliance-reveal-bloc">{BLOCS[a.targetBloc]?.label}</span>
                      <span className={`choice-chip choice-chip--${a.targetChoice}`}>{a.targetChoice}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Events */}
      {eventsFired.length > 0 && (
        <div className="end-section">
          <span className="label" style={{ marginBottom: 8 }}>Events that fired</span>
          <div className="summary-events">
            {eventsFired.map((ev) => (
              <div key={ev.id} className="summary-event-card">
                <strong>{ev.name}</strong>
                <p>{ev.description}</p>
                <div className="event-effects">
                  {ev.effects.map((e, i) => (
                    <span key={i} className={`eff-chip ${e.deltaAll >= 0 ? 'eff-chip--pos' : 'eff-chip--neg'}`}>
                      {e.deltaAll > 0 ? '+' : ''}{e.deltaAll} {BLOCS[e.bloc]?.label}
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
