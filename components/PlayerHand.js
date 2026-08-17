import { useState } from 'react'
import { getCard } from '../lib/game/cards'
import { BLOCS, BLOC_IDS, RALLY_AP_COST, IDEOLOGIES } from '../lib/game/constants'

// Ideology band colours
const IDEOLOGY_COLOR = {
  capitalist:   '#8b5e34',
  supremo:      '#7a1f1a',
  showstopper:  '#2f6f77',
  idealist:     '#4a6e2a',
}

export default function PlayerHand({
  hand, actionPoints, isMyTurn,
  onPlayCard, onRally, onProposeAlliance,
  players, myPlayerId, loading,
}) {
  const [conspiracyArmed, setConspiracyArmed] = useState(null)
  const [allianceOpen, setAllianceOpen]       = useState(false)
  const [allyTarget, setAllyTarget]           = useState('')
  const [allyMyBloc, setAllyMyBloc]           = useState('')
  const [allyTheirBloc, setAllyTheirBloc]     = useState('')

  const opponents = (players || []).filter((p) => p.id !== myPlayerId)

  const policyCards    = (hand || []).filter((id) => getCard(id)?.cardType !== 'scandal')
  const conspiracyCards = (hand || []).filter((id) => getCard(id)?.cardType === 'scandal')

  function submitAlliance() {
    if (!allyTarget || !allyMyBloc || !allyTheirBloc) return
    onProposeAlliance({ targetPlayerId: allyTarget, proposerBloc: allyMyBloc, targetBloc: allyTheirBloc })
    setAllianceOpen(false); setAllyTarget(''); setAllyMyBloc(''); setAllyTheirBloc('')
  }

  if (!hand?.length) {
    return (
      <div className="panel">
        <div className="panel-header">
          <h3>Your Hand</h3>
        </div>
        <p className="muted" style={{ fontStyle: 'italic' }}>No cards in hand — canvass a zone or pass the turn.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Your Hand</h3>
        {actionPoints != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="label" style={{ marginBottom: 0 }}>Action Points</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className={`ap-token${i >= actionPoints ? ' is-spent' : ''}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Policy / Headline cards ── */}
      {policyCards.length > 0 && (
        <>
          <p className="hand-section-label">Policy Cards</p>
          <div className="card-grid">
            {policyCards.map((cardId) => {
              const card = getCard(cardId)
              if (!card) return null
              const canPlay = isMyTurn && actionPoints >= card.apCost && !loading
              const bandColor = IDEOLOGY_COLOR[card.ideology] || '#888'
              return (
                <button
                  key={cardId}
                  type="button"
                  className="game-card"
                  disabled={!canPlay}
                  onClick={() => onPlayCard(cardId)}
                  title={canPlay ? `Play ${card.name}` : undefined}
                >
                  {/* Left ideology band */}
                  <div className="card-ideology-band" style={{ background: bandColor }} />

                  <div className="card-inner">
                    {/* Top row: type tag + AP cost */}
                    <div className="card-top">
                      <span className="card-type-tag card-type-tag--policy">
                        {card.ideologyMeta?.label || 'Policy'}
                      </span>
                      <span className="card-ap-badge">{card.apCost} AP</span>
                    </div>

                    {/* Card name */}
                    <div className="card-name">{card.name}</div>

                    <hr className="card-rule" />

                    {/* Description */}
                    <div className="card-desc">{card.description}</div>
                  </div>

                  {/* Effect bar at bottom */}
                  <div className="card-effect-bar">
                    {card.effects.map((e, i) => (
                      <div key={i} className="card-effect-line">
                        <span
                          className="card-effect-dot"
                          style={{ background: BLOCS[e.bloc]?.color || '#888' }}
                        />
                        <span className="card-effect-text">
                          +{e.amount} {BLOCS[e.bloc]?.label || e.bloc}
                        </span>
                      </div>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ── Conspiracy / Attack cards ── */}
      {conspiracyCards.length > 0 && (
        <>
          <hr className="section-divider" />
          <p className="hand-section-label">Conspiracy Cards</p>
          <div className="card-grid">
            {conspiracyCards.map((cardId) => {
              const card = getCard(cardId)
              if (!card) return null
              const canPlay = isMyTurn && actionPoints >= card.apCost && !loading
              const isArmed = conspiracyArmed === cardId
              return (
                <div key={cardId}>
                  <button
                    type="button"
                    className={`game-card game-card--conspiracy${isArmed ? ' is-armed' : ''}`}
                    disabled={!canPlay}
                    onClick={() => setConspiracyArmed(isArmed ? null : cardId)}
                    title={canPlay ? (isArmed ? 'Cancel' : `Arm ${card.name}`) : undefined}
                  >
                    {/* Left band — conspiracy purple */}
                    <div className="card-ideology-band" style={{ background: '#6c3483' }} />

                    <div className="card-inner">
                      <div className="card-top">
                        <span className="card-type-tag card-type-tag--conspiracy">Conspiracy</span>
                        <span className="card-ap-badge">{card.apCost} AP</span>
                      </div>
                      <div className="card-name">{card.name}</div>
                      <hr className="card-rule" />
                      <div className="card-desc">{card.description}</div>
                      {canPlay && (
                        <div className="card-arm-hint">
                          {isArmed ? '▼ Choose Target Below' : 'Click to Arm'}
                        </div>
                      )}
                    </div>

                    <div className="card-effect-bar">
                      {card.effects.map((e, i) => (
                        <div key={i} className="card-effect-line">
                          <span
                            className="card-effect-dot"
                            style={{ background: BLOCS[e.bloc]?.color || '#888' }}
                          />
                          <span className="card-effect-text--neg">
                            {e.amount} {BLOCS[e.bloc]?.label || e.bloc}
                          </span>
                        </div>
                      ))}
                    </div>
                  </button>

                  {isArmed && (
                    <div className="conspiracy-targets">
                      <span className="label label--crimson" style={{ width: '100%', marginBottom: 0 }}>
                        Deploy against
                      </span>
                      {opponents.length === 0 ? (
                        <span className="muted">No rivals to target.</span>
                      ) : (
                        opponents.map((opp) => (
                          <button
                            key={opp.id}
                            type="button"
                            className="btn btn--danger btn--sm"
                            disabled={loading}
                            onClick={() => { setConspiracyArmed(null); onPlayCard(cardId, opp.id) }}
                          >
                            {opp.nickname}
                          </button>
                        ))
                      )}
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setConspiracyArmed(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Canvassing (Rally) ── */}
      {isMyTurn && (
        <>
          <hr className="section-divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p className="hand-section-label" style={{ margin: 0 }}>
              Canvassing  ·  +10 support  ·  {RALLY_AP_COST} AP
            </p>
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

      {/* ── Alliance proposal ── */}
      {isMyTurn && opponents.length > 0 && (
        <>
          <hr className="section-divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="hand-section-label" style={{ margin: 0 }}>Secret Alliance  ·  1 AP</p>
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
                  <label>Rival Campaign</label>
                  <select className="select" value={allyTarget} onChange={(e) => setAllyTarget(e.target.value)}>
                    <option value="">— select —</option>
                    {opponents.map((o) => <option key={o.id} value={o.id}>{o.nickname}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Your Staked Bloc</label>
                  <select className="select" value={allyMyBloc} onChange={(e) => setAllyMyBloc(e.target.value)}>
                    <option value="">— select —</option>
                    {BLOC_IDS.map((b) => <option key={b} value={b}>{BLOCS[b].label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Their Staked Bloc</label>
                  <select className="select" value={allyTheirBloc} onChange={(e) => setAllyTheirBloc(e.target.value)}>
                    <option value="">— select —</option>
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
                  Send Proposal
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => { setAllianceOpen(false); setAllyTarget(''); setAllyMyBloc(''); setAllyTheirBloc('') }}
                >
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
