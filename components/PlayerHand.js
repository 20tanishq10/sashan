import { useState } from 'react'
import { getCard } from '../lib/game/cards'
import { BLOCS, BLOC_IDS, RALLY_AP_COST } from '../lib/game/constants'

export default function PlayerHand({
  hand,
  actionPoints,
  isMyTurn,
  onPlayCard,
  onRally,
  onProposeAlliance,
  players,
  myPlayerId,
  loading,
}) {
  // Track which scandal card is in "targeting mode" — waiting for player to pick a target
  const [scandalTargeting, setScandalTargeting] = useState(null) // cardId | null
  // Track which card is in "alliance propose" mode
  const [allianceMode, setAllianceMode] = useState(false)
  const [allianceProposerBloc, setAllianceProposerBloc] = useState('')
  const [allianceTargetBloc, setAllianceTargetBloc] = useState('')
  const [allianceTargetPlayer, setAllianceTargetPlayer] = useState('')

  const opponents = (players || []).filter((p) => p.id !== myPlayerId)

  if (!hand?.length) {
    return (
      <p className="muted">
        No issue cards in hand. Build pressure with a rally or yield the floor.
      </p>
    )
  }

  function handleScandalPlay(cardId, targetPlayerId) {
    setScandalTargeting(null)
    onPlayCard(cardId, targetPlayerId)
  }

  function handleAllianceSubmit() {
    if (!allianceTargetPlayer || !allianceProposerBloc || !allianceTargetBloc) return
    onProposeAlliance({
      targetPlayerId: allianceTargetPlayer,
      proposerBloc: allianceProposerBloc,
      targetBloc: allianceTargetBloc,
    })
    setAllianceMode(false)
    setAllianceProposerBloc('')
    setAllianceTargetBloc('')
    setAllianceTargetPlayer('')
  }

  const policyCards = hand.filter((id) => {
    const c = getCard(id)
    return c && c.cardType !== 'scandal'
  })
  const scandalCards = hand.filter((id) => {
    const c = getCard(id)
    return c && c.cardType === 'scandal'
  })

  return (
    <div className="player-hand">
      <div className="manifesto-heading">
        <div>
          <span className="hud-label">Player mat</span>
          <h3>Manifesto &amp; field actions</h3>
        </div>
        <p className="board-copy">
          Advance your manifesto through issue cards, or spend political capital on an immediate
          field push.
        </p>
      </div>

      {/* ── Policy cards ── */}
      {policyCards.length > 0 && (
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
                <div className="card-badges">
                  <span
                    className="card-ribbon"
                    style={{
                      backgroundColor: `${card.ideologyMeta?.color || '#6e1f1b'}14`,
                      color: card.ideologyMeta?.color || '#6e1f1b',
                    }}
                  >
                    {card.ideologyMeta?.label || 'Ideology'}
                  </span>
                  <span className="card-ribbon card-ribbon-secondary">
                    {card.resourceMeta?.label || 'Campaign Resource'}
                  </span>
                </div>
                <span className="card-name">{card.name}</span>
                <span className="card-desc">{card.description}</span>
                <div className="card-footer">
                  <span className="card-cost">{card.apCost} AP</span>
                  <span className="card-effect">
                    {card.effects
                      .map((e) => `+${e.amount} ${BLOCS[e.bloc]?.label || e.bloc}`)
                      .join(', ')}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Scandal / Attack cards ── */}
      {scandalCards.length > 0 && (
        <div className="scandal-section">
          <div className="scandal-heading">
            <div>
              <h4>Opposition files</h4>
              <p className="muted">
                Attack cards cost {2} AP and reduce a rival's support in their target zone.
                Select a card then choose your target.
              </p>
            </div>
            <span className="scandal-badge">Attack cards</span>
          </div>
          <div className="card-grid">
            {scandalCards.map((cardId) => {
              const card = getCard(cardId)
              if (!card) return null
              const canPlay = isMyTurn && actionPoints >= card.apCost && !loading
              const isTargeting = scandalTargeting === cardId
              return (
                <div key={cardId} className="scandal-card-wrapper">
                  <button
                    type="button"
                    className={`policy-card scandal-card${isTargeting ? ' scandal-card--targeting' : ''}`}
                    disabled={!canPlay}
                    onClick={() =>
                      setScandalTargeting(isTargeting ? null : cardId)
                    }
                  >
                    <div className="card-badges">
                      <span className="card-ribbon scandal-ribbon">Opposition File</span>
                      <span className="card-ribbon card-ribbon-secondary">
                        {card.resourceMeta?.label || 'Campaign Resource'}
                      </span>
                    </div>
                    <span className="card-name">{card.name}</span>
                    <span className="card-desc">{card.description}</span>
                    <div className="card-footer">
                      <span className="card-cost">{card.apCost} AP</span>
                      <span className="card-effect scandal-effect">
                        {card.effects
                          .map((e) => `${e.amount} ${BLOCS[e.bloc]?.label || e.bloc}`)
                          .join(', ')}
                      </span>
                    </div>
                    {canPlay && (
                      <span className="scandal-prompt">
                        {isTargeting ? 'Select a target below ↓' : 'Click to arm'}
                      </span>
                    )}
                  </button>

                  {isTargeting && opponents.length > 0 && (
                    <div className="scandal-targets">
                      <span className="hud-label">Choose target</span>
                      {opponents.map((opp) => (
                        <button
                          key={opp.id}
                          type="button"
                          className="btn btn-danger btn-sm scandal-target-btn"
                          disabled={loading}
                          onClick={() => handleScandalPlay(cardId, opp.id)}
                        >
                          Fire at {opp.nickname}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setScandalTargeting(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {isTargeting && opponents.length === 0 && (
                    <p className="muted" style={{ marginTop: 8 }}>
                      No opponents to target.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Rally circuit ── */}
      {isMyTurn && (
        <div className="rally-section">
          <div className="rally-heading">
            <div>
              <h4>Rally circuit</h4>
              <p className="muted">
                Spend {RALLY_AP_COST} AP to surge one territory by +10 support.
              </p>
            </div>
            <span className="rally-cost-badge">{RALLY_AP_COST} AP action</span>
          </div>
          <div className="rally-buttons">
            {BLOC_IDS.map((bloc) => (
              <button
                key={bloc}
                type="button"
                className="rally-button"
                disabled={actionPoints < RALLY_AP_COST || loading}
                onClick={() => onRally(bloc)}
              >
                <span
                  className="rally-button-dot"
                  style={{ backgroundColor: BLOCS[bloc].color }}
                />
                <span className="rally-button-copy">
                  <strong>{BLOCS[bloc].label}</strong>
                  <span>{RALLY_AP_COST} AP surge</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Propose alliance ── */}
      {isMyTurn && opponents.length > 0 && (
        <div className="alliance-propose-section">
          <div className="rally-heading">
            <div>
              <h4>Secret alliance</h4>
              <p className="muted">
                Costs 1 AP. Propose a private pact — your partner chooses to honour or betray
                at a scoring checkpoint.
              </p>
            </div>
            <span className="rally-cost-badge">1 AP action</span>
          </div>

          {!allianceMode ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={actionPoints < 1 || loading}
              onClick={() => setAllianceMode(true)}
            >
              Propose alliance
            </button>
          ) : (
            <div className="alliance-form">
              <label className="alliance-form-label">
                <span>Target opponent</span>
                <select
                  value={allianceTargetPlayer}
                  onChange={(e) => setAllianceTargetPlayer(e.target.value)}
                  className="alliance-select"
                >
                  <option value="">— pick a rival —</option>
                  {opponents.map((opp) => (
                    <option key={opp.id} value={opp.id}>
                      {opp.nickname}
                    </option>
                  ))}
                </select>
              </label>

              <label className="alliance-form-label">
                <span>Bloc you stake</span>
                <select
                  value={allianceProposerBloc}
                  onChange={(e) => setAllianceProposerBloc(e.target.value)}
                  className="alliance-select"
                >
                  <option value="">— your bloc —</option>
                  {BLOC_IDS.map((b) => (
                    <option key={b} value={b}>
                      {BLOCS[b].label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="alliance-form-label">
                <span>Bloc they stake</span>
                <select
                  value={allianceTargetBloc}
                  onChange={(e) => setAllianceTargetBloc(e.target.value)}
                  className="alliance-select"
                >
                  <option value="">— their bloc —</option>
                  {BLOC_IDS.map((b) => (
                    <option key={b} value={b}>
                      {BLOCS[b].label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="alliance-form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    loading ||
                    !allianceTargetPlayer ||
                    !allianceProposerBloc ||
                    !allianceTargetBloc
                  }
                  onClick={handleAllianceSubmit}
                >
                  Send proposal
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setAllianceMode(false)
                    setAllianceTargetPlayer('')
                    setAllianceProposerBloc('')
                    setAllianceTargetBloc('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
