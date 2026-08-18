import { customAlphabet } from 'nanoid'

const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const generateLobbyCode = customAlphabet(alphabet, 6)

// Re-exported from the engine so the lobby gate and the start-game check can
// never disagree. The box ships 5 player mats (rulebook p.3); 2-player uses a
// separate board side that is not wired into the lobby flow yet.
export { MIN_PLAYERS, MAX_PLAYERS } from './shasn/constants'
