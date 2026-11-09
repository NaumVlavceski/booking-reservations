# RoomTrack frontend

The React app of RoomTrack (React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, installable as a PWA).
See the [main README](../README.md) for what RoomTrack is, how it is built and how to run all of it.

```bash
npm ci
npm run dev      # http://localhost:5173, calls the API at VITE_API_URL (default http://localhost:8080)
npm run build    # type-check and build into dist/
npm run lint
```

Build-time settings are listed in [`.env`](.env.example).
