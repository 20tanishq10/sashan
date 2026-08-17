import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getOrCreateSessionToken, storePlayer } from '../lib/session'

export default function Join() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleJoin(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const sessionToken = getOrCreateSessionToken()
    const res = await fetch('/api/join-lobby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase(), nickname, sessionToken }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error || 'Could not join lobby')
      return
    }

    storePlayer({
      playerId: json.playerId,
      lobbyId: json.lobbyId,
      code: json.code,
      nickname: json.nickname,
      sessionToken,
      isHost: json.isHost,
    })

    router.push(`/lobby/${json.code}`)
  }

  return (
    <main className="page form-page">
      <div className="form-card">
        <Link href="/" className="back-link">← Back</Link>

        <span className="label">Join game</span>
        <h2>Enter an election</h2>
        <p className="sub">Enter the 6-character code your host shared and register your name.</p>

        <form onSubmit={handleJoin} className="form-fields">
          <div className="field">
            <label htmlFor="code">Election code</label>
            <input
              id="code"
              className="input mono"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              required
              autoFocus
              style={{ letterSpacing: '0.2em', fontSize: 18 }}
            />
          </div>

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
            />
          </div>

          {error && <p className="error">{error}</p>}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={loading || !code.trim() || !nickname.trim()}
          >
            {loading ? 'Joining…' : 'Join lobby'}
          </button>
        </form>
      </div>
    </main>
  )
}
