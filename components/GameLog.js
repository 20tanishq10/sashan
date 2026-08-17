const TYPE_META = {
  play_card:         { label: 'Policy',      cls: 'log-tag--policy' },
  scandal:           { label: 'Attack',      cls: 'log-tag--scandal' },
  rally:             { label: 'Rally',       cls: 'log-tag--rally' },
  end_turn:          { label: 'Turn',        cls: 'log-tag--turn' },
  event:             { label: 'Event',       cls: 'log-tag--event' },
  checkpoint:        { label: 'Checkpoint',  cls: 'log-tag--checkpoint' },
  alliance_proposed: { label: 'Alliance',    cls: 'log-tag--alliance' },
  alliance_accepted: { label: 'Alliance',    cls: 'log-tag--alliance' },
  alliance_declined: { label: 'Alliance',    cls: 'log-tag--alliance' },
  alliance_resolved: { label: 'Reveal',      cls: 'log-tag--resolve' },
  system:            { label: 'System',      cls: 'log-tag--system' },
}

const ENTRY_CLS = {
  event:             'log-entry--event',
  checkpoint:        'log-entry--checkpoint',
  alliance_resolved: 'log-entry--resolve',
  scandal:           'log-entry--scandal',
}

export default function GameLog({ log }) {
  if (!log?.length) return null
  const entries = [...log].reverse().slice(0, 12)

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="label" style={{ marginBottom: 0 }}>Activity</span>
        <h4>Game log</h4>
      </div>
      <div className="log-list">
        {entries.map((entry, i) => {
          const meta = TYPE_META[entry.type] || { label: '', cls: '' }
          return (
            <div
              key={`${entry.at}-${i}`}
              className={`log-entry ${ENTRY_CLS[entry.type] || ''}`}
            >
              {meta.label && (
                <span className={`log-tag ${meta.cls}`}>{meta.label}</span>
              )}
              <span className="log-msg">{entry.message}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
