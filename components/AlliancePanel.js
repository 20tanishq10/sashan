import { BLOCS, SCORING_CHECKPOINT_ROUNDS } from '../lib/game/constants'

export default function AlliancePanel({ myAlliances, myPlayerId, players, currentRound, onAllianceAction, loading }) {
  if (!myAlliances?.length) return null

  const isCheckpoint = SCORING_CHECKPOINT_ROUNDS.includes(currentRound)
  const nick = (id) => (players || []).find((p) => p.id === id)?.nickname || '?'

  const incoming = myAlliances.filter((a) => a.status === 'pending' && a.targetId === myPlayerId)
  const outgoing = myAlliances.filter((a) => a.status === 'pending' && a.proposerId === myPlayerId)
  const active   = myAlliances.filter((a) => a.status === 'accepted')

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="label" style={{ marginBottom: 0 }}>Backroom</span>
        <h4>Alliances</h4>
      </div>

      <div className="alliance-section">
        {/* Outgoing */}
        {outgoing.map((a) => (
          <div key={a.id} className="alliance-row">
            <div className="alliance-row-top">
              <div>
                <strong>{nick(a.targetId)}</strong>
                <div className="alliance-blocs">
                  {BLOCS[a.proposerBloc]?.label} ↔ {BLOCS[a.targetBloc]?.label}
                </div>
              </div>
              <span className="pill pill--amber">Pending</span>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>Proposed round {a.round}</span>
          </div>
        ))}

        {/* Incoming */}
        {incoming.map((a) => (
          <div key={a.id} className="alliance-row alliance-row--incoming">
            <div className="alliance-row-top">
              <div>
                <strong>{nick(a.proposerId)}</strong> proposes a pact
                <div className="alliance-blocs">
                  Your stake: {BLOCS[a.targetBloc]?.label} · Theirs: {BLOCS[a.proposerBloc]?.label}
                </div>
              </div>
            </div>
            <div className="alliance-row-actions">
              <button className="btn btn--primary btn--sm" disabled={loading} onClick={() => onAllianceAction(a.id, 'accept')}>Accept</button>
              <button className="btn btn--ghost btn--sm" disabled={loading} onClick={() => onAllianceAction(a.id, 'decline')}>Decline</button>
            </div>
          </div>
        ))}

        {/* Active */}
        {active.map((a) => {
          const partnerId = a.proposerId === myPlayerId ? a.targetId : a.proposerId
          const myBloc    = a.proposerId === myPlayerId ? a.proposerBloc : a.targetBloc
          const theirBloc = a.proposerId === myPlayerId ? a.targetBloc : a.proposerBloc
          const chose = !!a.myChoice

          return (
            <div key={a.id} className="alliance-row alliance-row--active">
              <div className="alliance-row-top">
                <div>
                  <strong>{nick(partnerId)}</strong>
                  <div className="alliance-blocs">
                    You: {BLOCS[myBloc]?.label} · Them: {BLOCS[theirBloc]?.label}
                  </div>
                  {chose && (
                    <div className="alliance-choice">
                      You chose <strong>{a.myChoice}</strong>
                      {a.partnerChoseYet ? ' · partner ready' : ' · waiting for partner'}
                    </div>
                  )}
                </div>
                {!isCheckpoint && !chose && <span className="pill pill--green">Active</span>}
              </div>

              {isCheckpoint && !chose && (
                <div className="alliance-row-actions">
                  <span className="label label--amber" style={{ marginBottom: 0 }}>Choose now</span>
                  <button className="btn btn--primary btn--sm" disabled={loading} onClick={() => onAllianceAction(a.id, 'resolve', 'honor')}>Honour</button>
                  <button className="btn btn--danger btn--sm" disabled={loading} onClick={() => onAllianceAction(a.id, 'resolve', 'betray')}>Betray</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
