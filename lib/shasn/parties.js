// SHASN — party identity.
//
// Every seat gets a colour AND an emblem. The colour alone was not enough for
// two reasons:
//
//   1. The four resources already own four hues. With voters and resource
//      tokens both drawn as flat coloured discs, a red disc was ambiguous —
//      Street Clout, or Player 1's voter? An emblem answers that by form, so
//      the question never arises.
//   2. Roughly one man in twelve cannot separate two of any five-hue set. A
//      shape is not subject to that.
//
// The emblems are invented. Real Indian parties campaign under real symbols and
// this game is played by real people about a real place, so borrowing an actual
// party's mark would put words in somebody's mouth. These are ordinary objects
// with no existing allegiance attached.
//
// Colours are deliberately chosen from hues the resources do NOT use: violet,
// teal, magenta, slate and umber, against the resources' green, red, blue and
// gold. See tests/theme.test.mjs, which enforces the separation.

export const PARTIES = [
  { id: 'lantern', label: 'The Lantern', color: 'var(--p0)' },
  { id: 'kite', label: 'The Kite', color: 'var(--p1)' },
  { id: 'sickle', label: 'The Sickle', color: 'var(--p2)' },
  { id: 'drum', label: 'The Drum', color: 'var(--p3)' },
  { id: 'banyan', label: 'The Banyan', color: 'var(--p4)' },
]

export const PARTY_IDS = PARTIES.map((p) => p.id)

/** The party at a given seat. Seats beyond the five printed mats wrap. */
export function partyForSeat(seatIndex) {
  return PARTIES[seatIndex % PARTIES.length]
}

export function getParty(id) {
  return PARTIES.find((p) => p.id === id) || null
}
