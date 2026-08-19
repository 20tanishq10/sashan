// SHASN — feedback, where you are actually looking.
//
// There was one error slot, a red line inside the turn panel near the bottom of
// the page. Click an illegal area on the board — which is in the middle of the
// screen — and the complaint appeared somewhere you were not looking. Worse, the
// client-side validation messages ("that area is taken", "voters cannot be split
// across zones") were only ever cleared inside `send()`, so they were cleared by
// making a SERVER call. Fix your mistake the obvious way and the complaint sat
// there stale, still telling you off for something you had already undone.
//
// And nothing ever acknowledged anything going right. You could take a zone and
// the interface would not react at all.
//
// So: a stack anchored below the header, over the table, where the eye already
// is. Notices clear themselves. Errors linger longest because they need reading;
// gains go quickly because they are a pat on the back, not information.
//
// `aria-live="polite"` because this is exactly what it is for, and because
// opacity and colour say nothing at all out loud.

import { useEffect } from 'react'
import { NOTICE_MS, pushNotice, dropNotice } from '../lib/ui/notices'

// Re-exported so callers have one import for the whole feature.
export { pushNotice, dropNotice, NOTICE_MS }

const TONES = {
  error: { bg: 'var(--danger-bg)', fg: 'var(--danger)', br: 'var(--danger-brd)' },
  warn: { bg: 'var(--amber-bg)', fg: 'var(--amber)', br: 'var(--amber-brd)' },
  gain: { bg: 'var(--good-bg)', fg: 'var(--good)', br: 'var(--good-brd)' },
  event: { bg: 'var(--accent-bg)', fg: 'var(--accent-ink)', br: 'var(--accent-brd)' },
}

export default function Announcer({ notices = [], onDismiss, max = 3 }) {
  // Newest first, and only a few — a stack that grows without bound is just a
  // log, and the log already exists elsewhere.
  const shown = notices.slice(-max).reverse()

  return (
    <div style={S.wrap} aria-live="polite" aria-atomic="false">
      {shown.map((n) => (
        <Notice key={n.id} notice={n} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function Notice({ notice, onDismiss }) {
  const tone = TONES[notice.tone] || TONES.event
  const ms = NOTICE_MS[notice.tone] || NOTICE_MS.event

  useEffect(() => {
    if (notice.sticky) return
    const t = setTimeout(() => onDismiss?.(notice.id), ms)
    return () => clearTimeout(t)
  }, [notice.id, notice.sticky, ms, onDismiss])

  return (
    <div
      className="shasn-notice"
      style={{
        ...S.notice,
        background: tone.bg,
        color: tone.fg,
        borderColor: tone.br,
      }}
    >
      <span style={S.text}>{notice.text}</span>
      <button
        type="button"
        onClick={() => onDismiss?.(notice.id)}
        style={{ ...S.close, color: tone.fg }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}


const S = {
  wrap: {
    position: 'sticky',
    top: 52,
    zIndex: 45,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    height: 0,
    pointerEvents: 'none',
  },
  notice: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    maxWidth: 520,
    padding: '7px 8px 7px 14px',
    border: '1px solid',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 550,
    boxShadow: 'var(--sh-3)',
    pointerEvents: 'auto',
  },
  text: { lineHeight: 1.35 },
  close: {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: 17,
    lineHeight: 1,
    padding: '0 6px',
    opacity: 0.65,
  },
}
