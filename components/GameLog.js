export default function GameLog({ log }) {
  if (!log?.length) return null

  const entries = [...log].reverse().slice(0, 8)

  return (
    <div className="game-log">
      <div className="log-heading">
        <span className="hud-label">Press desk</span>
        <h4>Campaign log</h4>
      </div>
      <ul>
        {entries.map((entry, i) => (
          <li key={`${entry.at}-${i}`}>{entry.message}</li>
        ))}
      </ul>
    </div>
  )
}
