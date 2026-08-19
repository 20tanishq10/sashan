// SHASN — the notice stack.
//
// Feedback used to be one red line inside a panel near the bottom of the page.
// Click an illegal area on the board — the middle of the screen — and the
// complaint appeared where you were not looking. Worse, the client-side
// validation messages were only ever cleared inside `send()`, which meant they
// were cleared by making a SERVER call. Correct your mistake the obvious way and
// the complaint sat there stale, still telling you off for something you had
// already undone.
//
// The reducers live here rather than in the component for the same reason the
// majority track and the mat status do: they are rules about what the player is
// told, they can be got wrong, and they should be checkable without a renderer.

/** How long each kind of notice stays before clearing itself. */
export const NOTICE_MS = {
  // An error has to be actually read.
  error: 5000,
  warn: 4500,
  event: 3400,
  // A gain is a pat on the back, not information. It should get out of the way.
  gain: 2600,
}

export function pushNotice(notices, tone, text, { sticky = false, dedupe = true } = {}) {
  if (!text) return notices
  // Clicking the same illegal square four times should say so once, not four
  // times — otherwise the stack fills with one sentence and pushes out whatever
  // else was worth reading. Tone is part of the identity: a loss and a gain
  // naming the same zone are different news.
  if (dedupe && notices.some((n) => n.text === text && n.tone === tone)) return notices

  return [
    ...notices,
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tone,
      text,
      sticky,
    },
  ]
}

export function dropNotice(notices, id) {
  return notices.filter((n) => n.id !== id)
}
