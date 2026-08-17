export function canStartGame(players) {
  if (!players || players.length < 2) return false
  return players.every((p) => p.is_ready)
}

export default function LobbyPlayerList({ players, hostId, currentPlayerId }) {
  if (!players?.length) return <p className="muted">No players yet.</p>

  return (
    <ul className="player-list">
      {players.map((p, i) => (
        <li key={p.id} className={`player-row${p.is_ready ? ' is-ready' : ''}`}>
          <div className="player-row-left">
            <span className="player-seat">Seat {i + 1}</span>
            <span className="player-name">{p.nickname}</span>
          </div>
          <div className="player-badges">
            {p.id === hostId && (
              <span className="pill pill--amber">Host</span>
            )}
            {p.id === currentPlayerId && (
              <span className="pill pill--accent">You</span>
            )}
            <span className={`pill ${p.is_ready ? 'pill--green' : 'pill--default'}`}>
              {p.is_ready ? 'Ready' : 'Waiting'}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
