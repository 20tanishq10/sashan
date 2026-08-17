import { customAlphabet } from 'nanoid'

const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const generateLobbyCode = customAlphabet(alphabet, 6)

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
