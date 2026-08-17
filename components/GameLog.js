const TYPE_META = {
  play_card:         { label: 'Policy',    className: 'log-type--policy' },
  scandal:           { label: 'Attack',    className: 'log-type--scandal' },
  rally:             { label: 'Rally',     className: 'log-type--rally' },
  end_turn:          { label: 'Turn',      className: 'log-type--turn' },
  event:             { label: 'Event',     className: 'log-type--event' },
  checkpoint:        { label: 'Checkpoint',className: 'log-type--checkpoint' },
  alliance_proposed: { label: 'Alliance',  className: 'log-type--alliance' },
  alliance_accepted: { label: 'Alliance',  className: 'log-type--alliance' },
  alliance_declined: { label: 'Alliance',  className: 'log-type--alliance' },
  alliance_resolved: { label: 'Reveal',    className: 'log-type--resolve' },
  system:            { label: 'System',    className: 'log-type--system' },
}

export default function GameLog({ log }) {
  if (!log?.length) return null

  const entries = [...log].reverse().slice(0, 10)

  return (
    <div className="game-log">
      <div className="log-heading">
        <span className="hud-label">Press desk</span>
        <h4>Campaign log</h4>
      </div>
      <ul>
        {entries.map((entry, i) => {
          const meta = TYPE_META[entry.type] || { label: '', className: '' }
          return (
            <li key={`${entry.at}-${i}`} className={`log-entry ${meta.className}`}>
              {meta.label && (
                <span className="log-type-tag">{meta.label}</span>
              )}
              <span className="log-message">{entry.message}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
