// ⚠ STUB CONTENT — Ideology Cards
//
// The real deck is 108 cards (rulebook p.3) and none of its text appears in the
// rulebook. These 24 placeholders exist so the engine can be played and tested.
//
// Spec they conform to (p.12, p.14):
//   - each card poses a policy question with exactly 2 answers
//   - the two answers belong to DIFFERENT Ideologues
//   - each answer yields a different set of resources
//   - cards may carry a content advisory ('mature' | 'trigger') and can be
//     removed before play without affecting the game (p.13)
//
// PAYOUT CURVE (tunable): each answer grants 3 resources — 2 of the answering
// Ideologue's own resource, plus 1 of a neighbouring type. This keeps players
// who commit to one Ideologue on track to unlock powers while still spreading
// enough resource variety to pay mixed Voter Card costs.
//
// The 24 cards cover all 6 Ideologue pairings 4 times over, so a stub game
// still produces realistic progression toward the 3- and 5-card thresholds.
// Replace this file wholesale when the real deck is transcribed.

export const IS_STUB_CONTENT = true

const PAIRINGS = [
  ['capitalist', 'supremo'],
  ['capitalist', 'showstopper'],
  ['capitalist', 'idealist'],
  ['supremo', 'showstopper'],
  ['supremo', 'idealist'],
  ['showstopper', 'idealist'],
]

// Own resource + the secondary type each Ideologue's answers also pay out.
const PAYOUT = {
  capitalist: { funds: 2, media: 1 },
  supremo: { clout: 2, funds: 1 },
  showstopper: { media: 2, clout: 1 },
  idealist: { trust: 2, media: 1 },
}

// Generic policy framings, deliberately mild. The real deck's questions are
// pointed and campaign-specific; these are scaffolding only.
const TOPICS = [
  'A major infrastructure project needs funding. How do you proceed?',
  'A public utility is failing. What is your response?',
  'Unemployment is rising in the industrial belt. What do you promise?',
  'A national broadcaster asks for your position on media regulation.',
  'Farmers are demanding price guarantees. What do you offer?',
  'A housing shortage grips the capital. What is your plan?',
  'A neighbouring region requests emergency aid. Do you intervene?',
  'Education funding is being cut. Where do you stand?',
  'A transport strike has paralysed the city. How do you respond?',
  'A tech company offers to run public services. Do you accept?',
  'Water rights are disputed between two provinces. Who do you back?',
  'A heritage site blocks a development plan. What do you decide?',
  'Healthcare waiting lists are growing. What do you propose?',
  'A border trade route needs a decision. What is your policy?',
  'Energy prices have spiked this winter. What is your answer?',
  'A corruption inquiry names your allies. How do you handle it?',
  'Rural clinics are closing. What do you commit to?',
  'A festival subsidy is up for renewal. Do you fund it?',
  'Public transport fares need revision. What do you announce?',
  'A river is heavily polluted by industry. What action do you take?',
  'A stadium project is over budget. Do you continue?',
  'Migrant workers seek formal protections. What is your stance?',
  'A university demands academic independence. Do you grant it?',
  'The pension age is under review. What do you decide?',
]

const ANSWER_TEXT = {
  capitalist: 'Back private investment and let the market deliver.',
  supremo: 'Assert central authority and act decisively.',
  showstopper: 'Make it a public spectacle and control the narrative.',
  idealist: 'Prioritise the people affected, whatever the cost.',
}

function buildDeck() {
  const cards = {}

  TOPICS.forEach((prompt, i) => {
    const [a, b] = PAIRINGS[i % PAIRINGS.length]
    const id = `ideology_${String(i + 1).padStart(3, '0')}`

    cards[id] = {
      id,
      prompt,
      // One card carries an advisory purely so the p.13 filtering path is
      // exercised by the engine and tests. It is not sensitive content.
      advisory: i === 15 ? 'mature' : null,
      answers: [
        { ideologue: a, text: ANSWER_TEXT[a], resources: { ...PAYOUT[a] } },
        { ideologue: b, text: ANSWER_TEXT[b], resources: { ...PAYOUT[b] } },
      ],
    }
  })

  return cards
}

export const IDEOLOGY_CARDS = buildDeck()

export const IDEOLOGY_CARD_IDS = Object.keys(IDEOLOGY_CARDS)
