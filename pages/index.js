import Link from 'next/link'

export default function Home() {
  return (
    <main className="page">
      <div className="card">
        <h1>Sashan</h1>
        <p className="subtitle">Election strategy game for friends. Create a lobby, share the code, and campaign for victory.</p>
        <div className="actions">
          <Link href="/create" className="btn btn-primary">Create Game</Link>
          <Link href="/join" className="btn btn-secondary">Join Game</Link>
        </div>
      </div>
    </main>
  )
}
