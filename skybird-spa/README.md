# Skybird (SPA)

Pure React SPA build of Skybird — no SSR, no server functions. Runs entirely
in the browser, talks directly to Supabase.

## Run locally

```bash
bun install      # or: npm install
bun run dev      # or: npm run dev
```

Open http://localhost:5173

## Build for production

```bash
bun run build    # outputs static site to dist/
```

Deploy the `dist/` folder to ANY static host:
- Open `dist/index.html` directly in a browser
- Upload to Netlify / Vercel / Cloudflare Pages / GitHub Pages
- Host on Nginx / Apache / any CDN

### SPA fallback (important for deep links)

For routes like `/dashboard` to work on refresh, the host must rewrite all
unknown paths to `/index.html`:

- **Netlify**: a `public/_redirects` file with `/*  /index.html  200` (included)
- **Vercel**: a `vercel.json` (included)
- **Nginx**: `try_files $uri /index.html;`
- **Apache**: included `.htaccess` in dist/

## Env vars

Copy `.env.example` to `.env` and fill in your Supabase keys.
