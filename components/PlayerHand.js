import { getCard } from '../lib/game/cards'
import { RALLY_AP_COST } from '../lib/game/constants'

export default function PlayerHand({
  hand,
  actionPoints,
  isMyTurn,
  onPlayCard,
  onRally,
  loading,
}) {
  if (!hand?.length) {
    return <p className="muted">No cards in hand.</p>
  }

  return (
    <div className="player-hand">
      <h3>Your Hand</h3>
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
              <span className="card-name">{card.name}</span>
              <span className="card-desc">{card.description}</span>
              <span className="card-cost">{card.apCost} AP</span>
              <span className="card-effect">
                {card.effects.map((e) => `+${e.amount} ${e.bloc.replace(/_/g, ' ')}`).join(', ')}
              </span>
            </button>
          )
        })}
      </div>

      {isMyTurn && (
        <div className="rally-section">
          <h4>Rally (no card needed)</h4>
          <p className="muted">Spend {RALLY_AP_COST} AP for +10 support in one bloc.</p>
          <div className="rally-buttons">
            {['youth', 'farmers', 'business', 'working_class', 'retirees', 'urban_professionals'].map((bloc) => (
              <button
                key={bloc}
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={actionPoints < RALLY_AP_COST || loading}
                onClick={() => onRally(bloc)}
              >
                {bloc.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
