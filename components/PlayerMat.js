// SHASN — player mat, modelled on the printed component (rulebook p.3).
//
// The physical mat is a landscape board in the player's party colour:
//
//   - a black scalloped strip across the top, whose semicircles are the slots
//     where answered Ideology Cards are tucked. It carries the passive rule:
//     "FOR EVERY 2 IDEOLOGY CARDS YOU HOLD OF AN IDEOLOGUE, GET 1 EXTRA
//      RESOURCE OF THAT TYPE."
//   - four Ideologue panels side by side: The Capitalist, The Supremo,
//     The Showstopper, The Idealist, each with a name plate in its own colour
//   - beneath each, its two powers tagged with a 3 and a 5 card icon
//
// Digital additions, since a screen can show live state the cardboard cannot:
// the tucked-card count per Ideologue, whether each power has actually unlocked,
// resources held, and remaining uses this turn.
//
// `variant="full"` is your own mat along the bottom of the table.
// `variant="compact"` is an opponent's, down the sides.

import { IDEOLOGUES, IDEOLOGUE_IDS, RESOURCES, RESOURCE_IDS } from '../lib/shasn/constants'
import * as Ideology from '../lib/shasn/ideology'
import * as R from '../lib/shasn/resources'

export default function PlayerMat({
  player,
  color,
  isActive = false,
  isYou = false,
  score = 0,
  variant = 'full',
  onUsePower,
  powerActionFor,
}) {
  const counts = Ideology.ideologueCounts(player.ideologyCards)
  const unlocked = Ideology.unlockedPowers(player.ideologyCards)
  const total = R.poolTotal(player.pool)
  const overCap = total > player.resourceCap

  if (variant === 'compact') {
    return (
      <div style={{ ...S.mat, ...S.compact, background: color, outline: isActive ? '3px solid #2b2b2b' : 'none' }}>
        <div style={S.compactHead}>
          <strong style={S.compactName}>{player.name}</strong>
          <span style={S.scorePill}>{score}</span>
        </div>

        <div style={S.compactRes}>
          {RESOURCE_IDS.map((id) => (
            <span key={id} style={{ ...S.resDot, background: RESOURCES[id].color }} title={RESOURCES[id].label}>
              {player.pool[id] || 0}
            </span>
          ))}
        </div>

        <div style={S.compactIdeo}>
          {IDEOLOGUE_IDS.map((id) => (
            <div key={id} style={S.compactIdeoRow}>
              <span style={{ ...S.ideoTick, background: IDEOLOGUES[id].color }} />
              <span style={S.compactCount}>{counts[id]}</span>
              <span style={S.lvlWrap}>
                <Lvl n={3} on={unlocked[id].level3} />
                <Lvl n={5} on={unlocked[id].level5} />
              </span>
            </div>
          ))}
        </div>

        <div style={S.compactFoot}>
          <span>{player.conspiracyCardCount ?? player.conspiracyCards?.length ?? 0} conspiracies</span>
          <span>{total}/{player.resourceCap}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...S.mat, background: color, outline: isActive ? '3px solid #2b2b2b' : 'none' }}>
      {/* Scalloped Ideology Card slots + the passive rule */}
      <div style={S.scallopBar}>
        <div style={S.scallops}>
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} style={S.scallop} />
          ))}
        </div>
        <span style={S.passiveRule}>
          FOR EVERY 2 IDEOLOGY CARDS YOU HOLD OF AN IDEOLOGUE, GET 1 EXTRA RESOURCE OF THAT TYPE
        </span>
      </div>

      <div style={S.matHead}>
        <strong style={S.matName}>
          {player.name}
          {isYou && <span style={S.you}>YOU</span>}
        </strong>
        <div style={S.matRes}>
          {RESOURCE_IDS.map((id) => (
            <span key={id} style={{ ...S.resChip, background: RESOURCES[id].color }}>
              {RESOURCES[id].label}
              <strong style={{ marginLeft: 6 }}>{player.pool[id] || 0}</strong>
            </span>
          ))}
          <span style={{ ...S.capChip, color: overCap ? '#b3452f' : '#e9e3d4' }}>
            {total} / {player.resourceCap}
          </span>
        </div>
      </div>

      {/* Four Ideologue panels */}
      <div style={S.panels}>
        {IDEOLOGUE_IDS.map((id) => {
          const ideo = IDEOLOGUES[id]
          const held = counts[id]
          const passive = Math.floor(held / 2)
          return (
            <div key={id} style={S.panel}>
              <div style={{ ...S.namePlate, borderColor: ideo.color }}>
                <span style={{ color: ideo.color, letterSpacing: 1 }}>
                  {ideo.label.toUpperCase()}
                </span>
              </div>

              <div style={S.heldRow}>
                <span style={S.heldCount}>{held}</span>
                <span style={S.heldLabel}>
                  card{held === 1 ? '' : 's'}
                  {passive > 0 && (
                    <em style={{ ...S.passiveTag, color: ideo.color }}>
                      +{passive} {RESOURCES[ideo.resource].label}/turn
                    </em>
                  )}
                </span>
              </div>

              {[3, 5].map((lvl) => {
                const def = ideo[`level${lvl}`]
                const on = unlocked[id][`level${lvl}`]
                const action = powerActionFor?.(id, lvl)
                const remaining = on
                  ? Ideology.powerUsesRemaining(player.ideologyCards, player.powerUses, id, lvl)
                  : 0
                const clickable = on && action && onUsePower && remaining > 0
                return (
                  <div
                    key={lvl}
                    onClick={clickable ? () => onUsePower(id, lvl, action, def) : undefined}
                    style={{
                      ...S.powerRow,
                      opacity: on ? 1 : 0.4,
                      cursor: clickable ? 'pointer' : 'default',
                      background: clickable ? '#ffffff26' : 'transparent',
                    }}
                    title={def.text}
                  >
                    <span style={{ ...S.lvlCard, borderColor: on ? ideo.color : '#ffffff55' }}>{lvl}</span>
                    <span style={S.powerText}>
                      <strong style={S.powerName}>{def.name.toUpperCase()}</strong>
                      <span style={S.powerShort}>{def.short || def.text}</span>
                    </span>
                    {on && remaining > 0 && Number.isFinite(def.usesPerTurn) && (
                      <span style={S.uses}>{remaining}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Lvl({ n, on }) {
  return (
    <span
      style={{
        ...S.lvlPip,
        background: on ? '#ffffff' : 'transparent',
        color: on ? '#2b2b2b' : '#ffffff77',
        borderColor: on ? '#ffffff' : '#ffffff55',
      }}
    >
      {n}
    </span>
  )
}

const S = {
  mat: {
    borderRadius: 12,
    padding: 0,
    color: '#fff',
    boxShadow: '0 3px 10px rgba(30,22,14,0.30)',
    overflow: 'hidden',
  },

  // --- full mat ---
  scallopBar: { background: '#17150f', padding: '0 0 7px', position: 'relative' },
  scallops: { display: 'flex', justifyContent: 'space-between', padding: '0 10px', marginTop: -11 },
  scallop: {
    width: 22, height: 22, borderRadius: '50%', background: '#17150f', display: 'block',
  },
  passiveRule: {
    display: 'block', textAlign: 'center', fontSize: 8.5, letterSpacing: 0.7,
    color: '#d6d1c2', padding: '2px 10px 0',
  },
  matHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 10, padding: '9px 12px 6px', flexWrap: 'wrap',
  },
  matName: { fontSize: 16, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 8 },
  you: {
    fontSize: 9, background: '#ffffff', color: '#2b2b2b', borderRadius: 3,
    padding: '1px 5px', letterSpacing: 1,
  },
  matRes: { display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' },
  resChip: {
    fontSize: 10, padding: '3px 8px', borderRadius: 10, color: '#fff',
    textShadow: '0 1px 1px rgba(0,0,0,.35)', whiteSpace: 'nowrap',
  },
  capChip: { fontSize: 11, marginLeft: 4, fontVariantNumeric: 'tabular-nums' },

  panels: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '0 10px 12px' },
  panel: { background: '#ffffff1f', borderRadius: 8, padding: 8 },
  namePlate: {
    background: '#141310', borderRadius: 5, borderBottom: '3px solid',
    padding: '5px 6px', textAlign: 'center', fontSize: 9.5, fontWeight: 700,
  },
  heldRow: { display: 'flex', alignItems: 'baseline', gap: 6, padding: '7px 2px 6px' },
  heldCount: { fontSize: 21, fontWeight: 700, lineHeight: 1 },
  heldLabel: { fontSize: 9, opacity: 0.9, display: 'flex', flexDirection: 'column' },
  passiveTag: { fontStyle: 'normal', fontSize: 9, fontWeight: 700 },

  powerRow: {
    display: 'flex', gap: 6, alignItems: 'center', padding: '4px 4px',
    borderRadius: 5, marginTop: 3,
  },
  lvlCard: {
    width: 19, height: 25, borderRadius: 3, border: '2px solid', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, background: '#00000038',
  },
  powerText: { display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 },
  powerName: { fontSize: 8.5, letterSpacing: 0.6 },
  powerShort: { fontSize: 8.5, opacity: 0.85 },
  uses: { marginLeft: 'auto', fontSize: 9, background: '#ffffff33', borderRadius: 8, padding: '1px 6px' },

  // --- compact mat ---
  compact: { padding: 9, display: 'flex', flexDirection: 'column', gap: 7 },
  compactHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  compactName: { fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  scorePill: { background: '#ffffff', color: '#2b2b2b', borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 700 },
  compactRes: { display: 'flex', gap: 4 },
  resDot: {
    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff',
    textShadow: '0 1px 1px rgba(0,0,0,.4)',
  },
  compactIdeo: { display: 'flex', flexDirection: 'column', gap: 3 },
  compactIdeoRow: { display: 'flex', alignItems: 'center', gap: 5 },
  ideoTick: { width: 8, height: 8, borderRadius: 2, flexShrink: 0 },
  compactCount: { fontSize: 11, minWidth: 12, fontWeight: 700 },
  lvlWrap: { display: 'flex', gap: 3, marginLeft: 'auto' },
  lvlPip: {
    width: 15, height: 15, borderRadius: 3, border: '1px solid', fontSize: 9,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
  },
  compactFoot: {
    display: 'flex', justifyContent: 'space-between', fontSize: 9.5,
    opacity: 0.9, borderTop: '1px solid #ffffff33', paddingTop: 5,
  },
}
