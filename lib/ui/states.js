// SHASN — the six states a thing on screen can be in.
//
// Before this there were twelve different opacity values across the components
// all meaning roughly "you cannot have this": 0.32, 0.38, 0.4, 0.42, 0.45, 0.5,
// 0.55, 0.75, 0.8, 0.85, 0.9. Some of them meant "not allowed", some meant "not
// relevant right now", some meant "already used", and nothing on screen told
// them apart. A player learning the game had to work out, per component, which
// kind of grey they were looking at.
//
// Six states, each meaning one thing:
//
//   selectable   you may click this, and it is offering
//   selected     you have chosen this
//   disabled     you may not click this, and it is not going to change soon
//   unaffordable a specific kind of disabled: you simply cannot pay
//   outOfScope   fine in general, but not part of what you are doing right now
//   spent        used up, kept on screen only for the record
//
// `outOfScope` is the deepest fade on purpose. It is the board dimming every
// zone except the one you are placing into — those areas are not broken, they
// are just not this decision, and they should recede furthest.
//
// Exported as style fragments rather than classes because most of this app
// styles inline; the CSS-class versions in globals.css exist for the places
// that do use classes.

export const STATE = {
  selectable: {
    opacity: 1,
    cursor: 'pointer',
  },

  selected: {
    opacity: 1,
    cursor: 'pointer',
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 2px var(--accent-bg), var(--sh-2)',
  },

  disabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  },

  // Told apart from `disabled` because the remedy is different: you are not
  // barred, you are just short. It stays clickable so the cost can be inspected.
  unaffordable: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },

  outOfScope: {
    opacity: 0.3,
    cursor: 'default',
    pointerEvents: 'none',
  },

  spent: {
    opacity: 0.55,
    filter: 'grayscale(0.7)',
    cursor: 'default',
  },
}

/**
 * Pick a state from the usual booleans, in priority order.
 *
 * The order matters and is the reason this is a function rather than a lookup:
 * a card that is both selected and unaffordable is SELECTED — you picked it, and
 * hiding that because you cannot yet pay would be lying about what you clicked.
 */
export function stateFor({
  selected = false,
  spent = false,
  outOfScope = false,
  disabled = false,
  unaffordable = false,
} = {}) {
  if (selected) return 'selected'
  if (spent) return 'spent'
  if (outOfScope) return 'outOfScope'
  if (disabled) return 'disabled'
  if (unaffordable) return 'unaffordable'
  return 'selectable'
}

/** The style fragment for a set of booleans, ready to spread. */
export function stateStyle(flags) {
  return STATE[stateFor(flags)]
}

/**
 * What a screen reader should hear, since opacity says nothing out loud.
 * Returned as a string to hang off `title` or `aria-label`.
 */
export const STATE_LABEL = {
  selectable: null, // nothing to say; it just works
  selected: 'selected',
  disabled: 'not available',
  unaffordable: 'you cannot afford this',
  outOfScope: 'not part of this choice',
  spent: 'already used',
}
