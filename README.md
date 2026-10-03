# DeltaConnect

## Run the website

Install Node.js 22.12+ and pnpm, then run:

```powershell
pnpm install
pnpm dev
```

Open the local URL printed by Vite. Use `pnpm build` to verify a production build.

For Supabase, create `.env.local` in the repository root:

```dotenv
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Restart Vite after changing these values. Use the publishable key; service-role
and secret keys must stay out of frontend code. `.env.local` is ignored by Git.

The frontend uses React and JavaScript. Supabase login and data access are the next
step; database rules and setup are in [supabase/README.md](supabase/README.md).

Python may be added for supporting tasks such as data imports when needed.
