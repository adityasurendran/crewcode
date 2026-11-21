# CrewCode Next.js + Supabase starter

Minimal runnable app. Database calls go through `lib/supabase.ts`, which fails
with a clear message until keys are configured.

```powershell
npm install
cp .env.example .env.local   # fill in Supabase keys (optional for the landing page)
npm run dev                  # http://localhost:3000
npm run build
```
