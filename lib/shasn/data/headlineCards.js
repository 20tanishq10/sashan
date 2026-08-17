// SHASN — Headline Cards, India deck (REAL CONTENT)
//
// Transcribed from the community "Headlines and Conspiracies Explained" doc.
// 20 cards, matching the rulebook component list (p.3) exactly.
//
// Rules context (rulebook p.17):
//   - 11 Volatile Areas on the board; placing a voter in one triggers a Headline
//   - the Headline is drawn and resolved at the END of the ongoing turn
//   - multiple Volatile placements in a turn trigger that many Headlines, in the
//     order the voters were placed
//   - a voter in a Volatile Area is permanent: it cannot be Gerrymandered,
//     converted, evicted, discarded or affected in any way
//
// "You" throughout means the player whose voter landed in the Volatile Area.
//
// See conspiracyCards.js for the resolution-mode vocabulary.

export const IS_STUB_CONTENT = false
export const DECK = 'india'

export const HEADLINE_CARDS = {
  crushed_under_belly: {
    id: 'crushed_under_belly',
    name: 'Crushed Under Belly',
    mode: 'choice',
    text:
      'You must discard any 2 voters. Players receive any 2 resources for each of their discarded voters.',
    clarification:
      'The player whose votes have been discarded picks resources of their choice. Resources are received from the Public Reserve.',
    effect: { type: 'discardVoters', count: 2, compensationPerVoter: 2 },
  },

  the_fault_in_your_stars: {
    id: 'the_fault_in_your_stars',
    name: 'The Fault In Your Stars',
    mode: 'choice',
    text: 'Pick one:\nDiscard 2 of your own voters\nor\nDonate 1 of your voters to the player on your left.',
    clarification: 'If you are unable to do either, ignore this card.',
    effect: {
      type: 'choice',
      options: [
        { id: 'discard_two', effect: { type: 'discardOwnVoters', count: 2 } },
        { id: 'donate_one', effect: { type: 'donateVoter', count: 1, to: 'left' } },
      ],
    },
  },

  iftar_party: {
    id: 'iftar_party',
    name: 'Iftar Party',
    mode: 'table',
    text:
      'Every player gets 2 resources of their choice. They may now trade these resources with each other. If a player trades both resources, they get 1 extra resource of their choice from the Public Reserve.',
    effect: { type: 'allGainAny', amount: 2, tradeBonus: 1 },
  },

  tukde_tukde: {
    id: 'tukde_tukde',
    name: 'Tukde Tukde',
    mode: 'delayed',
    text: 'You cannot use one of your unlocked Level 3 Ideologue Powers in your next turn.',
    clarification: 'If you do not have a Level 3 Ideologue Power, discard 2 resources in your next turn.',
    effect: { type: 'lockLevel3', count: 1, fallback: { type: 'loseAny', amount: 2 } },
  },

  a_coward_or_a_journalist: {
    id: 'a_coward_or_a_journalist',
    name: 'A Coward Or A Journalist?',
    mode: 'table',
    text:
      'Each player can donate 1 of their Ideology Cards to the opponent on their left. They will receive 6 resources of their choice for doing so.',
    clarification:
      'This action begins with the player whose vote has been placed in the volatile area. The ideology card may not be flipped over while passing.',
    effect: { type: 'optionalIdeologyDonation', reward: 6, direction: 'left' },
  },

  a_reliable_dream: {
    id: 'a_reliable_dream',
    name: 'A Reliable Dream',
    mode: 'table',
    text:
      'Convince 2 other players to become investors by giving any 1 resource each to the bank. If you are successful, you receive 7 resources of your choice in return. Distribute them as you see fit.',
    clarification: 'Promises made while taking investments are not binding.',
    effect: { type: 'negotiatedInvestment', investors: 2, stake: 1, reward: 7 },
  },

  pythonpost: {
    id: 'pythonpost',
    name: 'Pythonpost',
    mode: 'persistent',
    text:
      'For the rest of the game, you have to pay an extra resource for every Conspiracy Card that you buy.',
    effect: { type: 'conspiracySurcharge', amount: 1 },
  },

  polo_retreat: {
    id: 'polo_retreat',
    name: 'Polo Retreat',
    mode: 'delayed',
    text:
      "Choose 2 players. They can use each other's unlocked Level 3 Ideologue Powers in addition to their own in their next turns.",
    clarification:
      "If either of the players don't have any unlocked Level 3 powers, both players can use any one Level 3 power of their choice.",
    effect: { type: 'sharePowers', level: 3, players: 2 },
  },

  submerged: {
    id: 'submerged',
    name: 'Submerged',
    mode: 'choice',
    text:
      'Starting with you, every player can Gerrymander 1 majority or non-majority voter immediately. These voters cannot be placed into Volatile Areas.',
    clarification: 'All gerrymanders must be according to regular gerrymandering rules.',
    effect: { type: 'roundOfGerrymanders', allowMajority: true, blockVolatile: true },
  },

  gau_mitron: {
    id: 'gau_mitron',
    name: 'Gau Mitron',
    mode: 'choice',
    text:
      'Select the zone where you have the most number of voters. Move 2 voters from that zone into an adjacent zone.',
    clarification: 'In case of a tie, pick any of the tied zones.',
    effect: { type: 'forcedMove', count: 2, from: 'strongestZone', to: 'adjacent' },
  },

  khaki_terror: {
    id: 'khaki_terror',
    name: 'Khaki Terror',
    mode: 'auto',
    text:
      'Donate 1 resource of each type to the Public Reserve. You cannot make any purchases until you do so.',
    effect: { type: 'tithe', perType: 1, blocksPurchases: true },
  },

  too_much_freedom: {
    id: 'too_much_freedom',
    name: 'Too Much Freedom',
    mode: 'delayed',
    text: 'All Voter Cards cost any 1 extra resource in your next turn.',
    effect: { type: 'voterCardSurcharge', amount: 1, duration: 'nextTurn' },
  },

  a_call_from_karachi: {
    id: 'a_call_from_karachi',
    name: 'A Call From Karachi',
    mode: 'table',
    text:
      "Draw the top 3 Conspiracy Cards. Keep 1 and shuffle the other 2 back in the deck. You don't need to reveal this card to other players. You must now auction the card off, starting at 2 resources.",
    effect: { type: 'drawAndAuction', draw: 3, keep: 1, minBid: 2 },
  },

  a_constituency_far_far_away: {
    id: 'a_constituency_far_far_away',
    name: 'A Constituency Far Far Away',
    mode: 'table',
    text:
      'Your opponents will vote and decide where to place the voter(s) influenced from your next Voter Card.',
    effect: { type: 'opponentsDirectPlacement', cards: 1 },
  },

  it_raid: {
    id: 'it_raid',
    name: 'IT Raid',
    mode: 'delayed',
    text: 'You will not receive the resources denoted on your next Ideology Card.',
    clarification:
      'You will still earn the resources from your ideologue powers and any other active effects.',
    effect: { type: 'suppressIdeologyPayout', cards: 1, passiveStillPays: true },
  },

  next_billion_data_points: {
    id: 'next_billion_data_points',
    name: 'Next Billion Data Points',
    mode: 'table',
    text:
      'The next Conspiracy Card in the draw pile is up for grabs at no cost. All players must vote for who should receive it. They cannot vote for themselves. In case of a tie, vote again.',
    effect: { type: 'votedGift', item: 'conspiracy' },
  },

  bankable: {
    id: 'bankable',
    name: 'Bankable',
    mode: 'table',
    text:
      'At the start of your next turn, all of your opponents will collectively choose 1 Open Voter card. If you influence the chosen Voter Card, then they get 1 voter each. They have to place that voter immediately.',
    clarification: 'The opponents have to place their voters in order of turn.',
    effect: { type: 'markedVoterCard', payoutPerOpponent: 1 },
  },

  times_up: {
    id: 'times_up',
    name: "Time's Up",
    mode: 'choice',
    text:
      'Pick one:\nGet 3 Funds resources\nor\nGet 3 Clout resources\nor\nGet 3 Media resources\nor\nGet 3 Trust resources',
    effect: {
      type: 'choice',
      options: [
        { id: 'funds', effect: { type: 'gain', resources: { funds: 3 } } },
        { id: 'clout', effect: { type: 'gain', resources: { clout: 3 } } },
        { id: 'media', effect: { type: 'gain', resources: { media: 3 } } },
        { id: 'trust', effect: { type: 'gain', resources: { trust: 3 } } },
      ],
    },
  },

  a_trip_to_goalpara: {
    id: 'a_trip_to_goalpara',
    name: 'A Trip To Goalpara',
    mode: 'choice',
    text:
      'The next 3 players after you can select and discard an open Voter Card. They will receive the resources denoted on these cards. New Voter Cards will only open after all 3 cards have been discarded.',
    clarification: 'In a 3 player game, you discard the last open card to receive the resources.',
    effect: { type: 'cashOutVoterCards', players: 3, holdRefill: true },
  },

  cough_it_up: {
    id: 'cough_it_up',
    name: 'Cough It Up',
    mode: 'choice',
    text:
      'All your opponents evict 1 voter. If a player breaks a majority using this action, all of their opponents get 1 resource of their choice.',
    effect: { type: 'massEvict', count: 1, majorityBreakBounty: 1 },
  },
}

export const HEADLINE_CARD_IDS = Object.keys(HEADLINE_CARDS)
export const HEADLINE_DECK_SIZE = HEADLINE_CARD_IDS.length // 20

export function getHeadlineCard(cardId) {
  return HEADLINE_CARDS[cardId] || null
}
