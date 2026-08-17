import Link from 'next/link'

export default function Home() {
  return (
    <main className="page landing-page">
      <div className="landing-shell">
        <section className="hero-card">
          <span className="hero-kicker">Political strategy board game</span>
          <h1>Sashan</h1>
          <p className="hero-copy">
            Build your persona, influence the electorate, and outmaneuver rival campaigns in a
            national contest for power.
          </p>
          <div className="actions">
            <Link href="/create" className="btn btn-primary">Launch Campaign</Link>
            <Link href="/join" className="btn btn-secondary">Enter Election</Link>
          </div>
        </section>

        <section className="landing-grid">
          <article className="feature-card">
            <span className="hud-label">The board</span>
            <h3>Nine contested zones</h3>
            <p>Fight zone by zone as the national map slowly tips toward one campaign.</p>
          </article>
          <article className="feature-card">
            <span className="hud-label">The dilemma</span>
            <h3>Power versus ideals</h3>
            <p>Every play should feel like a hard political choice, not just a points trade.</p>
          </article>
          <article className="feature-card">
            <span className="hud-label">The room</span>
            <h3>Built for friends</h3>
            <p>Create a private lobby for 2 to 6 players, gather your table, and let the negotiations begin.</p>
          </article>
        </section>
      </div>
    </main>
  )
}
