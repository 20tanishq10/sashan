import { useState } from 'react'
import { getCard } from '../lib/game/cards'
import { BLOCS, BLOC_IDS, RALLY_AP_COST } from '../lib/game/constants'

export default function PlayerHand({
  hand, actionPoints, isMyTurn,
  onPlayCard, onRally, onProposeAlliance,
  players, myPlayerId, loading,
}) {
  const [scandalArmed, setScandalArmed] = useState(null)
  const [allianceOpen, setAllianceOpen] = useState(false)
  const [allyTarget, setAllyTarget] = useState('')
  const [allyMyBloc, setAllyMyBloc] = useState('')
  const [allyTheirBloc, setAllyTheirBloc] = useState('')

  const opponents = (players || []).filter((p) => p.id !== myPlayerId)

  const policyCards = (hand || []).filter((id) => getCard(id)?.cardType !== 'scandal')
  const scandalCards = (hand || []).filter((id) => getCard(id)?.cardType === 'scandal')

  function submitAlliance() {
    if (!allyTarget || !allyMyBloc || !allyTheirBloc) return
    onProposeAlliance({ targetPlayerId: allyTarget, proposerBloc: allyMyBloc, targetBloc: allyTheirBloc })
    setAllianceOpen(false); setAllyTarget(''); setAllyMyBloc(''); setAllyTheirBloc('')
  }

  if (!hand?.length) {
    return (
      <div className="panel">
        <p className="muted">No cards in hand — rally or yield the floor.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Your hand</h3>
        {actionPoints != null && (
          <span className="pill pill--accent">{actionPoints} AP remaining</span>
        )}
      </div>

      {/* ── Policy cards ── */}
      {policyCards.length > 0 && (
        <>
          <p className="hand-section-label">Policy cards</p>
          <div className="card-grid">
            {policyCards.map((cardId) => {
              const card = getCard(cardId)
              if (!card) return null
              const canPlay = isMyTurn && actionPoints >= card.apCost && !loading
              return (
                <button
                  key={cardId}
                  type="button"
                  className="policy-card"
                  disabled={!canPlay}
                  onClick={() => onPlayCard(cardId)}
                >
                  <span className="card-tag card-tag--ideology">
                    {card.ideologyMeta?.label || 'Policy'}
                  </span>
                  <span className="card-name">{card.name}</span>
                  <span className="card-desc">{card.description}</span>
                  <div className="card-footer">
                    <span className="card-ap">{card.apCost} AP</span>
                    <span className="card-effect">
                      {card.effects.map((e) => `+${e.amount} ${BLOCS[e.bloc]?.label || e.bloc}`).join(', ')}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ── Attack cards ── */}
      {scandalCards.length > 0 && (
        <>
          <hr className="section-divider" />
          <p className="hand-section-label">Attack cards</p>
          <div className="card-grid">
            {scandalCards.map((cardId) => {
              const card = getCard(cardId)
              if (!card) return null
              const canPlay = isMyTurn && actionPoints >= card.apCost && !loading
              const isArmed = scandalArmed === cardId
              return (
                <div key={cardId}>
                  <button
                    type="button"
                    className={`policy-card policy-card--scandal${isArmed ? ' is-armed' : ''}`}
                    disabled={!canPlay}
                    onClick={() => setScandalArmed(isArmed ? null : cardId)}
                  >
                    <span className="card-tag card-tag--scandal">Attack</span>
                    <span className="card-name">{card.name}</span>
                    <span className="card-desc">{card.description}</span>
                    <div className="card-footer">
                      <span className="card-ap">{card.apCost} AP</span>
                      <span className="card-effect--neg">
                        {card.effects.map((e) => `${e.amount} ${BLOCS[e.bloc]?.label || e.bloc}`).join(', ')}
                      </span>
                    </div>
                    {canPlay && (
                      <span className="card-arm-hint">
                        {isArmed ? 'Choose target below ↓' : 'Click to arm'}
                      </span>
                    )}
                  </button>
                  {isArmed && (
                    <div className="scandal-targets">
                      {opponents.length === 0 ? (
                        <span className="muted">No opponents to target.</span>
                      ) : (
                        <>
                          <span className="label label--red" style={{ width: '100%', marginBottom: 0 }}>Fire at</span>
                          {opponents.map((opp) => (
                            <button
                              key={opp.id}
                              type="button"
                              className="btn btn--danger btn--sm"
                              disabled={loading}
                              onClick={() => { setScandalArmed(null); onPlayCard(cardId, opp.id) }}
                            >
                              {opp.nickname}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setScandalArmed(null)}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Rally ── */}
      {isMyTurn && (
        <>
          <hr className="section-divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p className="hand-section-label" style={{ margin: 0 }}>Rally (+{10} support · {RALLY_AP_COST} AP)</p>
          </div>
          <div className="rally-grid">
            {BLOC_IDS.map((bloc) => (
              <button
                key={bloc}
                type="button"
                className="rally-btn"
                disabled={actionPoints < RALLY_AP_COST || loading}
                onClick={() => onRally(bloc)}
              >
                <span className="rally-dot" style={{ background: BLOCS[bloc].color }} />
                {BLOCS[bloc].label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Propose alliance ── */}
      {isMyTurn && opponents.length > 0 && (
        <>
          <hr className="section-divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="hand-section-label" style={{ margin: 0 }}>Secret alliance (1 AP)</p>
            {!allianceOpen && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={actionPoints < 1 || loading}
                onClick={() => setAllianceOpen(true)}
              >
                Propose
              </button>
            )}
          </div>
          {allianceOpen && (
            <div className="alliance-form">
              <div className="alliance-form-row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Rival</label>
                  <select className="select" value={allyTarget} onChange={(e) => setAllyTarget(e.target.value)}>
                    <option value="">— pick —</option>
                    {opponents.map((o) => <option key={o.id} value={o.id}>{o.nickname}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Your bloc</label>
                  <select className="select" value={allyMyBloc} onChange={(e) => setAllyMyBloc(e.target.value)}>
                    <option value="">— pick —</option>
                    {BLOC_IDS.map((b) => <option key={b} value={b}>{BLOCS[b].label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Their bloc</label>
                  <select className="select" value={allyTheirBloc} onChange={(e) => setAllyTheirBloc(e.target.value)}>
                    <option value="">— pick —</option>
                    {BLOC_IDS.map((b) => <option key={b} value={b}>{BLOCS[b].label}</option>)}
                  </select>
                </div>
              </div>
              <div className="row gap-8">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={loading || !allyTarget || !allyMyBloc || !allyTheirBloc}
                  onClick={submitAlliance}
                >
                  Send proposal
                </button>
                <button type="button" className="btn btn--ghost btn--sm"
                  onClick={() => { setAllianceOpen(false); setAllyTarget(''); setAllyMyBloc(''); setAllyTheirBloc('') }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
