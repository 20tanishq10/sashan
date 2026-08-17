// SHASN — Conspiracy Cards, India deck (REAL CONTENT)
//
// Transcribed from the community "Headlines and Conspiracies Explained" doc.
// 16 unique cards; Chai-Paani ships 2 copies and Vikas Model 4, giving the 20
// Conspiracy Cards listed in the rulebook (p.3).
//
// Rules context (rulebook p.18):
//   - buy only the TOP card of the draw pile, for any 4-5 resources
//   - no hand limit; play at any point in your turn
//   - may also be played right before an opponent answers their Ideology Card
//   - simultaneous plays resolve in turn order
//
// RESOLUTION MODES — how much the engine can do unaided:
//   auto        engine resolves entirely
//   choice      engine resolves once the player names a target or option
//   interrupt   played out of turn, in response to something
//   persistent  installs an ongoing effect for the rest of the game
//   delayed     changes a future turn
//   table       genuine negotiation or a vote; the engine presents the card and
//               records whatever the table agrees. Forcing these through UI
//               would gut them — they are the social heart of the game.

export const IS_STUB_CONTENT = false
export const DECK = 'india'

// Default cost band. p.18: "bought for any 4-5 resources, as denoted by the cost
// on the back of the card." The per-card back values are not in either source,
// so all cards use 4 wildcards until the physical backs are transcribed.
const COST = { any: 4 }

export const CONSPIRACY_CARDS = {
  chai_paani: {
    id: 'chai_paani',
    name: 'Chai-Paani',
    copies: 2,
    cost: COST,
    mode: 'persistent',
    text:
      'Pick an opponent and pick a resource. Whenever they spend that resource, it comes to you instead of going to the Public Reserve.\n\nIf another such card is played, this one will get discarded.',
    clarification:
      'Only resources being spent into the Public Reserve can be stolen. Resources being placed on other cards or discarded to meet resource cap cannot be stolen.',
    effect: { type: 'divertSpend', unique: true },
  },

  jumla: {
    id: 'jumla',
    name: 'Jumla',
    copies: 1,
    cost: COST,
    mode: 'persistent',
    text:
      'This is an extra Ideology Card of your choice. Opponents can take this card by paying you as many resources as the Ideologue level this card is on. At the end of your turn, you may place this card under a different Ideologue.',
    clarification: 'Moving this card around at the end of the turn is strictly optional.',
    effect: { type: 'wildIdeologyCard' },
  },

  block: {
    id: 'block',
    name: 'Block',
    copies: 1,
    cost: COST,
    mode: 'interrupt',
    text:
      'Play this immediately out of turn when an opponent plays a Conspiracy Card to negate its effect.\nor\nDiscard an open Conspiracy Card or Headline Card.',
    clarification:
      'A block cannot be reversed or deflected. You may block a conspiracy card attempting to steal this card by using the block card. Actions not directed at you may also be blocked. A block may also be used to cleanse an already active conspiracy or headline card.',
    effect: { type: 'negate', unblockable: true },
  },

  reverse: {
    id: 'reverse',
    name: 'Reverse',
    copies: 1,
    cost: COST,
    mode: 'interrupt',
    text:
      'When a player uses a Conspiracy Card on you, you may play this card immediately to reverse its effect back to them.',
    clarification: 'Reverse can be blocked or deflected.',
    effect: { type: 'reflect' },
  },

  maha_alliance: {
    id: 'maha_alliance',
    name: 'Maha Alliance',
    copies: 1,
    cost: COST,
    mode: 'auto',
    text: 'You may use all your Level 3 Ideologue Powers twice this turn.',
    clarification:
      'Level 3 Showstopper powers do not give you +2 voters per card. Only powers unlocked before this card is played may be reused.',
    effect: { type: 'doubleLevel3Uses' },
  },

  wheeler_dealer_stealer: {
    id: 'wheeler_dealer_stealer',
    name: 'Wheeler Dealer Stealer',
    copies: 1,
    cost: COST,
    mode: 'choice',
    text: 'Steal a random Conspiracy Card from an opponent.',
    effect: { type: 'stealRandomConspiracy' },
  },

  char_dham: {
    id: 'char_dham',
    name: 'Char Dham',
    copies: 1,
    cost: COST,
    mode: 'auto',
    text:
      'Get 1 voter for every following action that you complete. Take them in any order, in the same turn.\n1. Reach your maximum resource limit.\n2. Trade 2 resources with an opponent.\n3. Use 2 Ideologue Powers.\n4. Break a majority.',
    clarification:
      'You may reveal this card at any time in your turn. You do not need to announce this card before taking the actions.',
    effect: {
      type: 'checklistVoters',
      goals: ['reachResourceCap', 'tradeTwoResources', 'useTwoPowers', 'breakMajority'],
    },
  },

  benaami: {
    id: 'benaami',
    name: 'Benaami',
    copies: 1,
    cost: COST,
    mode: 'persistent',
    text:
      'Your resource cap increases by +2. Place the +2 resource cap tracker token besides your Player Mat.',
    clarification: 'Any other effects to the resource cap still apply.',
    effect: { type: 'resourceCapDelta', amount: 2 },
  },

  demonetisation: {
    id: 'demonetisation',
    name: 'Demonetisation',
    copies: 1,
    cost: COST,
    mode: 'choice',
    text:
      'Every opponent discards all their resources. Pick and keep half of the discarded resources (rounded up).',
    effect: { type: 'demonetise', keepFraction: 0.5, rounding: 'up' },
  },

  booth_capturing: {
    id: 'booth_capturing',
    name: 'Booth Capturing',
    copies: 1,
    cost: COST,
    mode: 'choice',
    text:
      'Every opponent must pay you 2 resources of their choice. Convert 1 voter belonging to every player who fails to pay you.',
    clarification: 'Players without enough resources may NOT use their IOU token.',
    effect: { type: 'extortOrConvert', amount: 2 },
  },

  the_hawala_network: {
    id: 'the_hawala_network',
    name: 'The Hawala Network',
    copies: 1,
    cost: COST,
    mode: 'persistent',
    text:
      'For the rest of the game, you can trade any 2 resources of the same type with the Public Reserve for any 1 other resource.',
    clarification:
      'You may make multiple trades in the same turn. A different combination of resources can be used in each trade.',
    effect: { type: 'reserveExchange', give: 2, get: 1, sameType: true },
  },

  not_indian_enough: {
    id: 'not_indian_enough',
    name: 'Not Indian Enough',
    copies: 1,
    cost: COST,
    mode: 'choice',
    text:
      'Pick up to 2 opponents. They will get 1 less voter on the next 2 Voter Cards that they influence.',
    clarification: 'This applies to 2 separate voter cards for 2 different players.',
    effect: { type: 'voterPenalty', targets: 2, cardsAffected: 1, amount: 1 },
  },

  nayi_soch: {
    id: 'nayi_soch',
    name: 'Nayi Soch',
    copies: 1,
    cost: COST,
    mode: 'auto',
    text: 'The next 3 voters you Gerrymander will die.',
    clarification:
      'This also applies to your own voters you gerrymander. If a voter gerrymandered into a volatile area is killed this way, a headline does not trigger.',
    effect: { type: 'lethalGerrymander', count: 3 },
  },

  peg_away: {
    id: 'peg_away',
    name: 'Peg Away',
    copies: 1,
    cost: COST,
    mode: 'choice',
    text:
      'If an opponent has exactly twice the number of voters as you in a zone, discard up to 4 of their voters in that zone.',
    effect: { type: 'conditionalDiscard', ratio: 2, maxDiscard: 4 },
  },

  cost_of_coal: {
    id: 'cost_of_coal',
    name: 'Cost of Coal',
    copies: 1,
    cost: COST,
    mode: 'choice',
    text: 'Pay 2 resources to move up to 4 non-majority voters anywhere on the board.',
    clarification: 'These voters can be your own.',
    effect: { type: 'freeMove', count: 4, payment: { any: 2 }, majorityAllowed: false },
  },

  vikas_model: {
    id: 'vikas_model',
    name: 'Vikas Model',
    copies: 4,
    cost: COST,
    mode: 'choice',
    text:
      "Get any 4 resources of your choice.\nor\nCollect and use 3 Vikas Model cards to select a '6/11' zone and convert all its voters into yours.",
    clarification:
      'Vikas Model x3 cannot be affected by Reverse/Ditto/Deflect/Block. This does not fill up any empty area or convert voters in a volatile area.',
    effect: {
      type: 'choice',
      options: [
        { id: 'resources', effect: { type: 'gainAny', amount: 4 } },
        {
          id: 'seize_zone',
          requiresCopies: 3,
          unblockable: true,
          effect: { type: 'convertZone', zoneFilter: { majority: 6, areas: 11 } },
        },
      ],
    },
  },
}

export const CONSPIRACY_CARD_IDS = Object.keys(CONSPIRACY_CARDS)

/** The physical deck: one entry per printed card, honouring copy counts. */
export function buildConspiracyDeckList() {
  const out = []
  for (const id of CONSPIRACY_CARD_IDS) {
    for (let i = 0; i < CONSPIRACY_CARDS[id].copies; i++) out.push(id)
  }
  return out
}

export const CONSPIRACY_DECK_SIZE = buildConspiracyDeckList().length // 20

export function getConspiracyCard(cardId) {
  return CONSPIRACY_CARDS[cardId] || null
}
