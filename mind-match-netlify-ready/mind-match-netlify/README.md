# Mind Match — Netlify-ready multiplayer game

Mind Match is a real-time party game for 2–8 players. Players join with a five-character room code, answer the same prompt privately, and earn 2 points when their answer belongs to a largest matching group of at least two players.

## Deploy on Netlify

1. Keep this entire project folder together; do not upload only the `public` folder.
2. Push the folder to a GitHub repository, or use Netlify's supported project import flow.
3. In Netlify, choose **Add new site → Import an existing project** and connect the repository.
4. Use the build settings from `netlify.toml`: publish directory `public`, functions directory `netlify/functions`. No frontend build command is needed.
5. Deploy. Netlify installs the dependencies from `package.json` and packages the Function.
6. Open the published `*.netlify.app` URL in two separate browsers/devices. Create a room on one, join with the room code on the other, then start the game.

Netlify Blobs is provisioned automatically for deployed Functions. Local development uses `npm install` and `npm start`; the local Netlify CLI sandbox is separate from production storage.

## Game rules

- 2–8 players per room; only the host can start; minimum 2.
- 10 rounds; 20 seconds per round; reveal for 6.5 seconds between rounds.
- One answer per player; answers remain hidden until reveal.
- Matching ignores capitalization, extra whitespace, and common punctuation.
- Players in the largest matching group(s), if the largest group has 2+ players, each receive 2 points. Tied largest groups all score. All-unique answers score 0.
- Final highest score wins; tied high scores share the win.

## Important technical note

Room data is persisted in a strong-consistency Netlify Blobs store and updates use ETag conditional writes with bounded retries. Netlify Blobs is a key-value store, not a transactional database; this implementation is intended for a small demo/learning project, not high-stakes or high-concurrency production use. Rooms do not currently expire automatically, and player reconnect/session recovery is basic.
