# Mature Market

An online classroom business game for one 90-minute double. One link runs everything:

- `/` is the student screen (join with the game code).
- `/?teacher` is the teacher screen for the projector (PIN-protected).

Plain JavaScript, no dependencies. All game state is held in memory for the lesson; nothing is saved between lessons.

## Run it locally

```
node server.js
```

Then open http://localhost:3000/?teacher on one tab and http://localhost:3000 on others.

## Deploy on Render

1. Put this folder in a GitHub repository.
2. In Render: **New → Web Service**, connect the repository.
3. Settings: Runtime **Node**, Build Command `echo no build needed` (or leave blank), Start Command `node server.js`.
   (Or use **New → Blueprint** and Render will read `render.yaml`.)
4. Environment variables (optional):
   - `ANTHROPIC_API_KEY`: turns on Claude checking of SWOTs and board reports. Without it, the teacher approves SWOTs and board reports get automatic scores the teacher can change.
   - `CLAUDE_MODEL`: defaults to `claude-haiku-5-5`.
   - `TEACHER_PIN`: if set, only this PIN can create games.
5. Keep it to **one instance** (the game lives in that server's memory).

Note: Render's free plan sleeps after 15 minutes without visits and takes about a minute to wake. Open the link a few minutes before class. A server restart (for example a redeploy) ends any game in progress.

## Files

- `server.js`: web server, live updates (Server-Sent Events), Claude calls.
- `game.js`: game rules, events, actions, deals, market engine and scoring. Tune numbers here.
- `public/`: the page (`index.html`, `app.js`, `style.css`), including the printable A4 reflection.
- `sim.js`: simulated class of 10 players over 6 rounds; prints the final status spread. `node sim.js 300`
