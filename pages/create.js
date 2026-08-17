import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getOrCreateSessionToken, storePlayer } from '../lib/session'

export default function Create() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const sessionToken = getOrCreateSessionToken()
    const res = await fetch('/api/create-lobby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, sessionToken }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error || 'Could not create lobby')
      return
    }

    storePlayer({
      playerId: json.playerId,
      lobbyId: json.lobbyId,
      code: json.code,
      nickname: json.nickname,
      sessionToken,
      isHost: true,
    })

    router.push(`/lobby/${json.code}`)
  }

  return (
    <main className="page form-page">
      <div className="form-card">
        <Link href="/" className="back-link">← Back</Link>

        <span className="label">New game</span>
        <h2>Launch a campaign</h2>
        <p className="sub">You'll host the table and share the election code with your players.</p>

        <form onSubmit={handleCreate} className="form-fields">
          <div className="field">
            <label htmlFor="nickname">Candidate name</label>
            <input
              id="nickname"
              className="input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Rivera"
              maxLength={20}
              required
              autoFocus
            />
          </div>

          {error && <p className="error">{error}</p>}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading || !nickname.trim()}
          >
            {loading ? 'Creating…' : 'Create lobby'}
          </button>
        </form>
      </div>
    </main>
  )
}
