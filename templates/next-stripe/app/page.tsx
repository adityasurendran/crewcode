export default function Home() {
  return (
    <main className="wrap">
      <h1>CrewCode Store</h1>
      <p>Sell one thing to prove checkout works, then ask your agent to build the catalog.</p>
      <form action="/api/checkout" method="POST">
        <button type="submit">Buy the demo item — $5.00</button>
      </form>
      <p className="muted">Needs STRIPE_SECRET_KEY in .env.local (see README).</p>
    </main>
  );
}
