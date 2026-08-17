import { MIN_PLAYERS } from '../lib/lobbyCodes'

export default function LobbyPlayerList({ players, hostId, currentPlayerId }) {
  if (!players?.length) {
    return <p className="muted">Waiting for players to join…</p>
  }

  return (
    <ul className="player-list">
      {players.map((player, index) => {
        const isHost = player.id === hostId
        const isYou = player.id === currentPlayerId
        return (
          <li key={player.id} className={`player-row ${player.is_ready ? 'ready' : ''}`}>
            <div>
              <span className="seat-number">Seat {index + 1}</span>
              <strong>{player.nickname}</strong>
              {isYou && <span className="badge">You</span>}
              {isHost && <span className="badge badge-host">Host</span>}
            </div>
            <span className={`status ${player.is_ready ? 'ready' : 'waiting'}`}>
              {player.is_ready ? 'Ready' : 'Not ready'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function canStartGame(players) {
  return players.length >= MIN_PLAYERS && players.every((p) => p.is_ready)
}
