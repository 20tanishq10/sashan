// SHASN — player mat, modelled on the printed component (rulebook p.3).
//
// The printed mat is a landscape board in the player's party colour:
//
//   - a scalloped strip across the top holding your twelve resource tokens. The
//     slots share the width equally, so the chain reaches the full width of the
//     mat rather than clumping at the left with an empty rail beside it. The
//     strip carries the passive rule: "FOR EVERY 2 IDEOLOGY CARDS YOU HOLD OF AN
//     IDEOLOGUE, GET 1 EXTRA RESOURCE OF THAT TYPE."
//
//     (The printed mat also tucks answered Ideology Cards in behind these slots.
//     Drawing those edges on screen was noise: the unlock track under each
//     Ideologue already says how many you hold and what it is worth, so the card
//     bundles were saying the same thing twice in less legible form. Removed for
//     now; IdeologyCardStack is still there if it earns its place back.)
//   - four Ideologue panels side by side, each with a name plate in its colour
//   - beneath each, its two powers tagged with a 3 and a 5 card icon
//
// Two things a screen can do that the cardboard cannot, and both were missing:
//
//   STATUS. A player can be carrying ten states that change what they may do —
//   purchases blocked, a tithe owed, payouts suppressed, gerrymanders turned
//   lethal. The mat said nothing about any of them, so you could be unable to
//   buy anything with no explanation on screen. The card that did it scrolls out
//   of the log within a turn or two.
//
//   PROGRESS. It showed a count and a dimmed power row, so "one more card and
//   Tough Love opens" was arithmetic rather than something you could see.
//
// On screen the mat is a pale card carrying the player's colour as a band along
// its top edge rather than flooding the whole surface. Five saturated rectangles
// around the board would drown the map, and the map is what people are reading.
//
// `variant="full"` is your own mat along the bottom of the table.
// `variant="compact"` is an opponent's, down the sides. They now show the same
// facts in the same order, so you can scan across the table and compare.

import { IDEOLOGUES, IDEOLOGUE_IDS, RESOURCES } from '../lib/shasn/constants'
import ResourceChain from './ResourceChain'
import PartyEmblem from './PartyEmblem'
import IdeologueMark from './IdeologueMark'
import UnlockTrack from './UnlockTrack'
import MatStatus from './MatStatus'
import * as Ideology from '../lib/shasn/ideology'
import * as R from '../lib/shasn/resources'

// A power you have not unlocked yet. Deliberately readable rather than hidden —
// the unlock track underneath says how far off it is, so the row is a goal.
const LOCKED = 0.42

export default function PlayerMat({
  player,
  color,
  party = null, // party emblem id; the same one their voters carry
  board = null, // needed for evicted voters waiting to be placed
  isActive = false,
  isYou = false,
  score = 0,
  variant = 'full',
  onUsePower,
  powerActionFor,
  discardSelection = null, // tokens marked to hand back during the cap discard
  onDiscardToken = null,
  justTucked = null, // ideologue whose stack just gained a card, for the animation
}) {
  const counts = Ideology.ideologueCounts(player.ideologyCards)
  const unlocked = Ideology.unlockedPowers(player.ideologyCards)
  const total = R.poolTotal(player.pool)
  const conspiracies = player.conspiracyCardCount ?? player.conspiracyCards?.length ?? 0

  // The turn passing should be impossible to miss: whoever is up is the only
  // mat at full strength.
  const seatClass = `shasn-seat ${isActive ? 'shasn-seat--active' : 'shasn-seat--idle'}`

  // ── An opponent's mat ────────────────────────────────────────────────────
  if (variant === 'compact') {
    return (
      <div className={seatClass} style={S.compact}>
        <span style={{ ...S.band, background: color }} />

        <div style={S.compactHead}>
          {party && <PartyEmblem party={party} size={14} color={color} />}
          <strong style={S.compactName}>{player.name}</strong>
          <span style={S.scorePill}>{score}</span>
        </div>

        {/* Effects are public — viewFor passes them straight through, and only
            Conspiracy card identities are hidden. Knowing the player to your
            left cannot buy anything is exactly what you are meant to see. */}
        <MatStatus player={player} board={board} compact max={3} />

        <ResourceChain pool={player.pool} cap={player.resourceCap} size={13} compact />

        <div style={S.compactIdeo}>
          {IDEOLOGUE_IDS.map((id) => (
            <div key={id} style={S.compactIdeoRow}>
              <IdeologueMark ideologue={id} size={12} color={IDEOLOGUES[id].color} stroke={2.4} />
              <span style={S.compactCount}>{counts[id]}</span>
              <span style={S.compactTrack}>
                <UnlockTrack held={counts[id]} color={IDEOLOGUES[id].color} height={5} showNote={false} />
              </span>
            </div>
          ))}
        </div>

        <div style={S.compactFoot}>
          <span>{conspiracies} conspiracies</span>
          <span style={S.num}>
            {total}/{player.resourceCap}
          </span>
        </div>
      </div>
    )
  }

  // ── Your own mat ─────────────────────────────────────────────────────────
  return (
    <div className={seatClass} style={S.mat}>
      <span style={{ ...S.band, background: color }} />

      {/* The chain: twelve slots, spread across the full width of the mat. */}
      <div style={S.chainBar}>
        <ResourceChain
          pool={player.pool}
          cap={player.resourceCap}
          selected={discardSelection}
          onTokenClick={onDiscardToken}
          size={30}
        />

        <span style={S.passiveRule}>
          For every 2 Ideology Cards you hold of an Ideologue, get 1 extra resource of that type
        </span>
      </div>

      <div style={S.matHead}>
        <strong style={S.matName}>
          {party ? (
            <PartyEmblem party={party} size={17} color={color} />
          ) : (
            <span style={{ ...S.nameDot, background: color }} />
          )}
          {player.name}
          {isYou && <span style={S.you}>you</span>}
        </strong>
        <span style={S.tally}>
          {score} pts · {conspiracies} conspiracies · {total}/{player.resourceCap} held
        </span>
      </div>

      <div style={S.statusRow}>
        <MatStatus player={player} board={board} />
      </div>

      {/* Four Ideologue panels */}
      <div style={S.panels}>
        {IDEOLOGUE_IDS.map((id) => {
          const ideo = IDEOLOGUES[id]
          const held = counts[id]
          const passive = Math.floor(held / 2)
          return (
            <div key={id} style={S.panel} className={justTucked === id ? 'shasn-card-tuck' : undefined}>
              <div style={{ ...S.namePlate, borderColor: ideo.color }}>
                <IdeologueMark ideologue={id} size={12} color={ideo.color} stroke={2.2} />
                <span style={{ color: ideo.color, letterSpacing: '0.06em' }}>
                  {ideo.label.replace('The ', '').toUpperCase()}
                </span>
              </div>

              <div style={S.trackWrap}>
                <UnlockTrack held={held} color={ideo.color} />
              </div>

              {passive > 0 && (
                <div style={{ ...S.passiveTag, color: ideo.color }}>
                  +{passive} {RESOURCES[ideo.resource].label}/turn
                </div>
              )}

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
                      opacity: on ? 1 : LOCKED,
                      cursor: clickable ? 'pointer' : 'default',
                      background: clickable ? 'rgba(217,173,62,.12)' : 'transparent',
                      borderColor: clickable ? 'var(--brass)' : 'transparent',
                    }}
                    title={on ? def.text : `Locked — needs ${lvl} ${ideo.label} cards. ${def.text}`}
                  >
                    <span
                      style={{
                        ...S.lvlCard,
                        borderColor: on ? ideo.color : 'var(--border-2)',
                        color: on ? ideo.color : 'var(--ink-3)',
                      }}
                    >
                      {lvl}
                    </span>
                    <span style={S.powerText}>
                      <strong style={S.powerName}>{def.name}</strong>
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

const S = {
  num: { fontVariantNumeric: 'tabular-nums' },

  mat: {
    position: 'relative',
    // A lacquered board, brass-edged, with a jali screen worked into it.
    backgroundColor: 'var(--lacquer-2)',
    backgroundImage: [
      'linear-gradient(180deg, rgba(255,220,150,.09), transparent 38%)',
      'repeating-linear-gradient(45deg, rgba(217,173,62,.055) 0 1.5px, transparent 1.5px 20px)',
      'repeating-linear-gradient(-45deg, rgba(217,173,62,.055) 0 1.5px, transparent 1.5px 20px)',
    ].join(','),
    border: '1px solid var(--brass-dark)',
    borderRadius: 'var(--r-lg)',
    color: 'var(--ink-on-dark)',
    boxShadow: 'var(--sh-3), inset 0 1px 0 rgba(255,220,150,.16)',
    overflow: 'hidden',
  },

  /* The player's colour, as an edge rather than a flood. */
  band: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    zIndex: 1,
    boxShadow: 'inset 0 -1px 0 rgba(0,0,0,.4), 0 1px 0 rgba(217,173,62,.5)',
  },

  // --- the scalloped strip ---
  chainBar: {
    background: 'linear-gradient(180deg, rgba(0,0,0,.4), rgba(0,0,0,.18))',
    borderBottom: '1px solid rgba(217,173,62,.3)',
    boxShadow: 'inset 0 3px 8px rgba(0,0,0,.5)',
    padding: '14px 14px 9px',
  },
  passiveRule: {
    display: 'block',
    textAlign: 'center',
    fontFamily: 'var(--head)',
    fontSize: 9.5,
    letterSpacing: '0.05em',
    color: 'var(--brass)',
    opacity: 0.75,
    padding: '8px 10px 0',
  },

  // --- header ---
  matHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    padding: '10px 13px 4px',
    flexWrap: 'wrap',
  },
  matName: {
    fontFamily: 'var(--display)',
    fontSize: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    color: 'var(--ivory)',
  },
  nameDot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  you: {
    fontSize: 9,
    background: 'var(--surface-3)',
    color: 'var(--ink-3)',
    borderRadius: 999,
    padding: '1px 7px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  tally: { fontSize: 12, color: 'var(--ink-on-dark-3)', fontVariantNumeric: 'tabular-nums' },
  statusRow: { padding: '0 13px', marginBottom: 2 },

  // --- Ideologue panels ---
  panels: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8,
    padding: '8px 11px 13px',
  },
  panel: {
    background: 'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.15))',
    border: '1px solid rgba(217,173,62,.22)',
    borderRadius: 'var(--r-md)',
    boxShadow: 'inset 0 2px 6px rgba(0,0,0,.45), inset 0 -1px 0 rgba(255,220,150,.08)',
    padding: 9,
  },
  // A little enamelled nameplate, like the zone plates on the board.
  namePlate: {
    background: 'linear-gradient(180deg, var(--ivory), var(--ivory-2))',
    border: '1px solid var(--brass-dark)',
    borderBottom: '2px solid',
    borderRadius: 'var(--r-sm)',
    boxShadow: '0 1px 3px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.6)',
    padding: '5px 6px',
    fontFamily: 'var(--head)',
    fontSize: 8.5,
    letterSpacing: '0.1em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  trackWrap: { padding: '9px 1px 3px' },
  passiveTag: { fontSize: 9, fontWeight: 700, textAlign: 'center', paddingBottom: 4 },

  powerRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    padding: '4px 5px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid transparent',
    marginTop: 3,
    transition: 'background 140ms var(--ease-out), border-color 140ms var(--ease-out)',
  },
  lvlCard: {
    width: 19,
    height: 25,
    borderRadius: 'var(--r-sm)',
    border: '1.5px solid',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 700,
    background: 'rgba(0,0,0,.4)',
  },
  powerText: { display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 },
  powerName: {
    fontFamily: 'var(--head)',
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--ivory)',
  },
  powerShort: { fontSize: 8.5, color: 'var(--ink-on-dark-3)' },
  uses: {
    marginLeft: 'auto',
    fontSize: 9,
    background: 'var(--surface-3)',
    color: 'var(--ink-2)',
    borderRadius: 999,
    padding: '1px 6px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },

  // --- an opponent's mat ---
  compact: {
    position: 'relative',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    boxShadow: 'var(--sh-1)',
    color: 'var(--ink)',
    padding: '13px 10px 9px',
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    overflow: 'hidden',
  },
  compactHead: { display: 'flex', alignItems: 'center', gap: 6 },
  compactName: {
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
  },
  scorePill: {
    background: 'var(--surface-3)',
    color: 'var(--ink)',
    borderRadius: 999,
    padding: '1px 8px',
    fontSize: 12,
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
  },
  compactIdeo: { display: 'flex', flexDirection: 'column', gap: 4 },
  compactIdeoRow: { display: 'flex', alignItems: 'center', gap: 5 },
  compactCount: {
    fontSize: 11,
    minWidth: 10,
    fontWeight: 650,
    color: 'var(--ink-2)',
    fontVariantNumeric: 'tabular-nums',
  },
  compactTrack: { flex: 1, minWidth: 0 },
  compactFoot: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 9.5,
    color: 'var(--ink-3)',
    borderTop: '1px solid var(--border)',
    paddingTop: 6,
  },
}
