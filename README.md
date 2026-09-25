# MesaSplit
PWA (React + Vite + Tailwind 4). La API key de Gemini vive solo en el servidor (api/scan.js).

## Local
npm install
cp .env.example .env   # rellena GEMINI_API_KEY (y opcional APP_PASSCODE)
npx vercel dev         # sirve el front y /api/scan juntos

## Deploy (Vercel)
Importa el repo, añade GEMINI_API_KEY y APP_PASSCODE en Environment Variables, y despliega.
