import { BLOCS } from '../lib/game/constants'
import { SCORING_CHECKPOINT_ROUNDS } from '../lib/game/constants'

/**
 * AlliancePanel
 *
 * Shows:
 * - Incoming pending proposals (accept / decline buttons)
 * - Active accepted alliances awaiting checkpoint resolution
 * - At scoring checkpoints: Honor / Betray choice for each active alliance
 *
 * Props:
 *   myAlliances      — from game-state API (sanitised, no opponent choice)
 *   myPlayerId
 *   players          — full player list for nickname lookup
 *   currentRound
 *   onAllianceAction — (allianceId, actionType, choice?) => void
 *   loading
 */
export default function AlliancePanel({
  myAlliances,
  myPlayerId,
  players,
  currentRound,
  onAllianceAction,
  loading,
}) {
  if (!myAlliances?.length) return null

  const isCheckpoint = SCORING_CHECKPOINT_ROUNDS.includes(currentRound)

  function nickname(id) {
    return (players || []).find((p) => p.id === id)?.nickname || '…'
  }

  const incoming = myAlliances.filter(
    (a) => a.status === 'pending' && a.targetId === myPlayerId
  )
  const outgoing = myAlliances.filter(
    (a) => a.status === 'pending' && a.proposerId === myPlayerId
  )
  const active = myAlliances.filter((a) => a.status === 'accepted')

  return (
    <div className="alliance-panel">
      <div className="log-heading">
        <span className="hud-label">Backroom</span>
        <h4>Alliance desk</h4>
      </div>

      {/* ── Outgoing proposals awaiting response ── */}
      {outgoing.length > 0 && (
        <div className="alliance-group">
          <span className="alliance-group-label">Awaiting reply</span>
          {outgoing.map((a) => (
            <div key={a.id} className="alliance-row alliance-row--outgoing">
              <div className="alliance-row-info">
                <strong>{nickname(a.targetId)}</strong>
                <span className="alliance-blocs">
                  {BLOCS[a.proposerBloc]?.label || a.proposerBloc} ↔{' '}
                  {BLOCS[a.targetBloc]?.label || a.targetBloc}
                </span>
                <span className="muted">Proposed in Round {a.round}</span>
              </div>
              <span className="alliance-status-badge alliance-status-badge--pending">
                Pending
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Incoming proposals ── */}
      {incoming.length > 0 && (
        <div className="alliance-group">
          <span className="alliance-group-label">Incoming proposals</span>
          {incoming.map((a) => (
            <div key={a.id} className="alliance-row alliance-row--incoming">
              <div className="alliance-row-info">
                <strong>{nickname(a.proposerId)}</strong> proposes a pact
                <span className="alliance-blocs">
                  Your stake: {BLOCS[a.targetBloc]?.label || a.targetBloc} &nbsp;|&nbsp;
                  Their stake: {BLOCS[a.proposerBloc]?.label || a.proposerBloc}
                </span>
                <span className="muted">Round {a.round}</span>
              </div>
              <div className="alliance-row-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={loading}
                  onClick={() => onAllianceAction(a.id, 'accept')}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={loading}
                  onClick={() => onAllianceAction(a.id, 'decline')}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Active alliances ── */}
      {active.length > 0 && (
        <div className="alliance-group">
          <span className="alliance-group-label">Active pacts</span>
          {active.map((a) => {
            const partnerId = a.proposerId === myPlayerId ? a.targetId : a.proposerId
            const myBloc =
              a.proposerId === myPlayerId ? a.proposerBloc : a.targetBloc
            const theirBloc =
              a.proposerId === myPlayerId ? a.targetBloc : a.proposerBloc
            const alreadyChose = !!a.myChoice

            return (
              <div key={a.id} className="alliance-row alliance-row--active">
                <div className="alliance-row-info">
                  <strong>{nickname(partnerId)}</strong>
                  <span className="alliance-blocs">
                    Your stake: {BLOCS[myBloc]?.label || myBloc} &nbsp;|&nbsp;
                    Their stake: {BLOCS[theirBloc]?.label || theirBloc}
                  </span>
                  {alreadyChose && (
                    <span className="alliance-choice-made">
                      You chose: <strong>{a.myChoice}</strong>
                      {a.partnerChoseYet
                        ? ' · Partner has also chosen'
                        : ' · Waiting for partner…'}
                    </span>
                  )}
                </div>

                {isCheckpoint && !alreadyChose && (
                  <div className="alliance-row-actions">
                    <span className="checkpoint-pulse">Checkpoint — choose now</span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={loading}
                      onClick={() => onAllianceAction(a.id, 'resolve', 'honor')}
                    >
                      Honour
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={loading}
                      onClick={() => onAllianceAction(a.id, 'resolve', 'betray')}
                    >
                      Betray
                    </button>
                  </div>
                )}

                {!isCheckpoint && !alreadyChose && (
                  <span className="alliance-status-badge alliance-status-badge--active">
                    Resolves at checkpoint
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
