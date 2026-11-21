const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function Home() {
  return (
    <main className="wrap">
      <h1>CrewCode Starter</h1>
      <p>
        This project runs on Next.js{configured ? " and is connected to Supabase." : "."}
        {!configured && " Add your Supabase keys to .env.local to connect the database (see README)."}
      </p>
      <p className="muted">Ask your CrewCode agent to build the next screen.</p>
    </main>
  );
}
