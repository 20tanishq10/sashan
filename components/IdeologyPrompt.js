// SHASN — the Ideology Card moment.
//
// This is the beat the whole game turns on, so it gets the screen (p.12):
//
//   "the player on your right will read aloud both sides of the top Ideology
//    Card for you"
//   "Keep the Ideology Card hidden until the active player has confirmed their
//    answer."
//
// So while you are choosing you see ONLY the question and the two answers. No
// Ideologue, no colours, no resource payouts — you are picking a position, not
// a payout. The card unmasks the instant you commit, and then files itself onto
// your mat.
//
// Sequence: ask → reveal → file → done.
//
// Opponents get a different view entirely: they can already see the whole card,
// exactly as the player reading it aloud can, and simply watch you decide.

import { useEffect, useRef, useState } from 'react'
import {
  IDEOLOGUES,
  IDEOLOGUE_IDS,
  RESOURCES,
  RESOURCE_IDS,
  IDEOLOGY_ANSWER_MS,
} from '../lib/shasn/constants'
import IdeologueMark from './IdeologueMark'
import Card from './Card'

const REVEAL_MS = 2600
const FILE_MS = 900

export default function IdeologyPrompt({
  pending,          // { hidden, prompt, answers[] }
  reveal,           // set once the answer is locked in
  onAnswer,         // (answerIndex) => void
  onRedraw,
  onRevealDone,
  canRedraw = true,
  busy = false,
  spectatorName = null, // set when watching someone else answer
  deadline = null,      // house-rule shot clock: epoch ms, or null for no clock
  onTimeout = null,     // fired once the clock hits zero
}) {
  const [stage, setStage] = useState('ask')
  const [picked, setPicked] = useState(null)
  const [remaining, setRemaining] = useState(null)
  const firedRef = useRef(false)

  // House rule: a shot clock on answering. Everyone counts down to the same
  // server-stamped instant, and whoever's client reaches zero first fires it —
  // the server re-checks the deadline, so a stalled tab cannot hold the table up.
  useEffect(() => {
    firedRef.current = false
    if (!deadline || reveal) {
      setRemaining(null)
      return
    }
    const tick = () => {
      const left = Math.max(0, deadline - Date.now())
      setRemaining(left)
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true
        onTimeout?.()
      }
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, reveal])

  useEffect(() => {
    if (!reveal) return
    setStage('reveal')
    const t1 = setTimeout(() => setStage('file'), REVEAL_MS)
    const t2 = setTimeout(() => {
      setStage('ask')
      setPicked(null)
      onRevealDone?.()
    }, REVEAL_MS + FILE_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal])

  if (!pending && !reveal) return null

  // ── Reveal ───────────────────────────────────────────────────────────────
  //
  // Gated on `reveal` alone, deliberately. `stage` starts at 'ask' and only
  // moves to 'reveal' in an effect, which runs AFTER this render — so gating on
  // `stage !== 'ask'` meant that on the very render where a reveal arrived we
  // fell through to the answering branch and dereferenced a card that was
  // already gone. That took the whole room down with a client-side exception.
  // `stage` now only chooses the animation, never whether we render at all.
  if (reveal) {
    const ideo = IDEOLOGUES[reveal.chosen?.ideologue]
    if (!ideo) return null
    // The four Ideologue panels run left to right across the mat, so aim the
    // card at the column its stack lives in: -1 is far left, +1 far right.
    const column = IDEOLOGUE_IDS.indexOf(reveal.chosen.ideologue)
    const fileX = (column - (IDEOLOGUE_IDS.length - 1) / 2) / ((IDEOLOGUE_IDS.length - 1) / 2)

    return (
      <div className="shasn-scrim">
        <Card
          className={stage === 'file' ? 'shasn-card-file' : 'shasn-card-reveal'}
          deck="ideology"
          // Once answered the card belongs to an Ideologue, so it takes that
          // colour — the only point at which an Ideology Card is ever coloured.
          tone={ideo.color}
          eyebrow={
            <>
              <IdeologueMark ideologue={reveal.chosen.ideologue} size={13} color={ideo.color} stroke={3} />
              {ideo.label}
            </>
          }
          badge={reveal.timedOut ? 'clock decided' : null}
          title={reveal.prompt}
          subtitle={`“${reveal.chosen.text}”`}
          style={{ ...S.revealCard, '--shasn-file-x': fileX }}
          footer={
            <>
              {Object.values(reveal.passiveGain || {}).some((n) => n > 0) &&
                'Includes passive income from Ideology Cards you already hold. '}
              {reveal.heldAfter?.[reveal.chosen.ideologue]}× {ideo.label} on your mat
            </>
          }
        >
          <div style={S.gains}>
            {RESOURCE_IDS.filter((id) => (reveal.granted?.[id] || 0) > 0).map((id) => (
              <span
                key={id}
                className="shasn-gain"
                style={{ ...S.gainChip, background: RESOURCES[id].color, color: RESOURCES[id].ink }}
              >
                <IdeologueMark
                  ideologue={RESOURCES[id].ideologue}
                  size={12}
                  color={RESOURCES[id].ink || '#ffffff'}
                  stroke={4}
                />
                +{reveal.granted[id]} {RESOURCES[id].label}
              </span>
            ))}
          </div>

          {reveal.unlocked?.length > 0 && (
            <div style={S.unlockRow}>
              {reveal.unlocked.map((u) => (
                <span
                  key={`${u.ideologue}${u.level}`}
                  className="shasn-unlock"
                  style={{ ...S.unlockChip, borderColor: IDEOLOGUES[u.ideologue].color }}
                >
                  {IDEOLOGUES[u.ideologue][`level${u.level}`].name} unlocked
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>
    )
  }

  // ── Watching someone else decide ─────────────────────────────────────────
  // Past this point every branch reads `pending`. If it is gone there is nothing
  // to draw — return rather than throw and take the room down.
  if (!pending) return null

  if (spectatorName) {
    return (
      <Card
        deck="ideology"
        eyebrow={`${spectatorName} is answering`}
        badge={
          <span style={S.badgeRow}>
            {remaining !== null && <Clock remaining={remaining} small />}
            <span style={S.readAloud}>read this out</span>
          </span>
        }
        title={pending.prompt}
        footer="They cannot see the Ideologues or the payouts."
        style={{ marginTop: 10 }}
      >
        <div style={S.watchAnswers}>
          {pending.answers.map((a, i) => {
            const ideo = a.ideologue ? IDEOLOGUES[a.ideologue] : null
            return (
              <div key={i} style={{ ...S.watchAnswer, borderColor: ideo?.color || 'var(--border)' }}>
                <span style={S.optLetter}>{'AB'[i]}</span>
                <span style={S.watchText}>{a.text}</span>
                {ideo && (
                  <span style={S.watchMeta}>
                    <strong style={{ color: ideo.color }}>{ideo.label}</strong>
                    {'  '}
                    {RESOURCE_IDS.filter((id) => a.resources?.[id])
                      .map((id) => `+${a.resources[id]} ${RESOURCES[id].label}`)
                      .join(' · ')}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    )
  }

  // ── Answering ────────────────────────────────────────────────────────────
  return (
    <div className="shasn-scrim">
      <Card
        className="shasn-drop"
        deck="ideology"
        style={S.askCard}
        badge={
          <span style={S.badgeRow}>
            {pending.advisory && <span style={S.advisory}>sensitive theme</span>}
            {remaining !== null && <Clock remaining={remaining} />}
          </span>
        }
        title={pending.prompt}
        footer={
          <div style={S.askFoot}>
            <span>
              {remaining !== null && remaining < 4000
                ? 'Out of time and the card answers itself — at random.'
                : 'The card stays face down until you commit — you are choosing a position, not a payout.'}
            </span>
            {canRedraw && (
              <button style={S.redraw} disabled={busy || picked !== null} onClick={onRedraw}>
                Redraw for any 4 resources
              </button>
            )}
          </div>
        }
      >
        <div style={S.options}>
          {pending.answers.map((a, i) => (
            <button
              key={i}
              disabled={busy || picked !== null}
              onClick={() => {
                setPicked(i)
                onAnswer(i)
              }}
              style={{
                ...S.option,
                borderColor: picked === i ? 'var(--ink)' : 'var(--border-2)',
                opacity: picked !== null && picked !== i ? 0.4 : 1,
              }}
            >
              <span style={S.optLetter}>{'AB'[i]}</span>
              <span style={S.optText}>{a.text}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

/** Countdown ring. Turns amber then red as the clock runs down. */
function Clock({ remaining, small = false }) {
  const total = IDEOLOGY_ANSWER_MS || 1
  const frac = Math.max(0, Math.min(1, remaining / total))
  const secs = Math.ceil(remaining / 1000)
  const size = small ? 30 : 40
  const r = size / 2 - 3
  const circ = 2 * Math.PI * r
  const colour = frac > 0.5 ? 'var(--good)' : frac > 0.25 ? 'var(--amber)' : 'var(--danger)'

  return (
    <span
      style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}
      title="Answer before the clock runs out, or the card answers itself at random"
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: 'stroke-dashoffset .1s linear, stroke .3s' }}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: small ? 11 : 14,
          fontWeight: 700,
          color: colour,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {secs}
      </span>
    </span>
  )
}

const S = {
  // The clock and the advisory share the badge corner of the card shell.
  badgeRow: { display: 'flex', alignItems: 'center', gap: 8 },
  askCard: {
    background: 'var(--surface)',
    borderRadius: 14,
    padding: '20px 22px 16px',
    maxWidth: 620,
    width: '100%',
    boxShadow: '0 20px 50px rgba(20,14,8,.45)',
  },
  advisory: { fontSize: 9, background: 'var(--amber-bg)', color: 'var(--amber)', padding: '2px 7px', borderRadius: 4 },
  options: { display: 'flex', flexDirection: 'column', gap: 10 },
  option: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    textAlign: 'left',
    background: 'var(--surface)',
    border: '2px solid var(--border-2)',
    borderRadius: 10,
    padding: '14px 16px',
    fontSize: 15,
    cursor: 'pointer',
    transition: 'border-color .15s, opacity .15s, transform .1s',
  },
  optLetter: {
    width: 24, height: 24, borderRadius: '50%', background: 'var(--ink)', color: 'var(--surface)',
    fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, fontWeight: 700,
  },
  optText: { lineHeight: 1.45 },
  askFoot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' },
  redraw: {
    background: 'none', border: '1px solid var(--border-2)', borderRadius: 6,
    padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--ink-2)',
  },

  revealCard: {
    background: 'var(--surface)',
    borderRadius: 14,
    border: '3px solid',
    padding: 0,
    maxWidth: 460,
    width: '100%',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(20,14,8,.5)',
  },
  gains: { display: 'flex', gap: 7, flexWrap: 'wrap', padding: '0 18px 4px' },
  gainChip: {
    fontSize: 12, padding: '5px 11px', borderRadius: 12, color: 'var(--surface)', fontWeight: 700,
    textShadow: '0 1px 1px rgba(0,0,0,.3)',
  },
  unlockRow: { display: 'flex', gap: 6, flexWrap: 'wrap', padding: '12px 18px 0' },
  unlockChip: {
    fontSize: 11, border: '2px solid', borderRadius: 6, padding: '3px 9px',
    background: 'var(--surface)', fontWeight: 700,
  },

  readAloud: {
    fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase',
    background: 'var(--good)', color: 'var(--surface)', padding: '3px 8px', borderRadius: 4,
  },
  watchAnswers: { display: 'flex', flexDirection: 'column', gap: 8 },
  watchAnswer: {
    display: 'flex', gap: 10, alignItems: 'flex-start',
    border: '2px solid', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)',
  },
  watchText: { fontSize: 14, lineHeight: 1.4, flex: 1 },
  watchMeta: { fontSize: 10, color: 'var(--ink-2)', textAlign: 'right', minWidth: 130 },
}
