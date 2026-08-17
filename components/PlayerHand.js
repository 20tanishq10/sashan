import { getCard } from '../lib/game/cards'
import { BLOCS, BLOC_IDS, RALLY_AP_COST } from '../lib/game/constants'

export default function PlayerHand({
  hand,
  actionPoints,
  isMyTurn,
  onPlayCard,
  onRally,
  loading,
}) {
  if (!hand?.length) {
    return <p className="muted">No issue cards in hand. Build pressure with a rally or yield the floor.</p>
  }

  return (
    <div className="player-hand">
      <div className="manifesto-heading">
        <div>
          <span className="hud-label">Player mat</span>
          <h3>Manifesto & field actions</h3>
        </div>
        <p className="board-copy">
          Advance your manifesto through issue cards, or spend political capital on an immediate field push.
        </p>
      </div>
      <div className="card-grid">
        {hand.map((cardId) => {
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
                  style={{ backgroundColor: `${card.ideologyMeta?.color || '#6e1f1b'}14`, color: card.ideologyMeta?.color || '#6e1f1b' }}
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
                  {card.effects.map((e) => `+${e.amount} ${BLOCS[e.bloc]?.label || e.bloc}`).join(', ')}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {isMyTurn && (
        <div className="rally-section">
          <div className="rally-heading">
            <div>
              <h4>Rally circuit</h4>
              <p className="muted">Spend {RALLY_AP_COST} AP to surge one territory by +10 support.</p>
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
                <span className="rally-button-dot" style={{ backgroundColor: BLOCS[bloc].color }} />
                <span className="rally-button-copy">
                  <strong>{BLOCS[bloc].label}</strong>
                  <span>{RALLY_AP_COST} AP surge</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
