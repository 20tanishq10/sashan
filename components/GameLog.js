export default function GameLog({ log }) {
  if (!log?.length) return null

  const entries = [...log].reverse().slice(0, 8)

  return (
    <div className="game-log">
      <h4>Campaign Log</h4>
      <ul>
        {entries.map((entry, i) => (
          <li key={`${entry.at}-${i}`}>{entry.message}</li>
        ))}
      </ul>
    </div>
  )
}
