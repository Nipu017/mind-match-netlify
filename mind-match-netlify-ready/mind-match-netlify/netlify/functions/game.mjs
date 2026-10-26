import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const ROUNDS = 10;
const ROUND_MS = 20_000;
const REVEAL_MS = 6_500;
const prompts = [
  "Name a yellow fruit.",
  "What is something people forget when leaving home?",
  "Name an animal people are scared of.",
  "What food could you eat every day?",
  "Name something you might find under a bed.",
  "What would you buy first if you suddenly became rich?",
  "Name something people do when nobody is watching.",
  "What is the best thing to bring to a picnic?",
  "Name something that makes a person instantly likable.",
  "What is something you would never want to find in your room?",
  "Name a food that is messy to eat.",
  "What is the first thing you do after waking up?",
  "Name something that is always too expensive.",
  "What would you take to a deserted island?",
  "Name an excuse for being late."
];

const store = getStore({ name: "mind-match-rooms", consistency: "strong" });
const json = (statusCode, payload) => new Response(JSON.stringify(payload), {
  status: statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Player-Id,X-Room-Code",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  }
});
const cleanName = value => String(value || "").trim().replace(/\s+/g, " ").slice(0, 18);
export const normalize = value => String(value ?? "").trim().toLocaleLowerCase().replace(/[.!?,;:'"()[\]{}]/g, "").replace(/\s+/g, " ");
const makeCode = () => randomBytes(4).toString("hex").slice(0, 5).toUpperCase();
const startRound = (room, now = Date.now()) => {
  room.status = "playing";
  room.answers = {};
  room.results = null;
  room.lastAwarded = [];
  room.prompt = prompts[(room.round - 1) % prompts.length];
  room.deadline = now + ROUND_MS;
};
function finishRound(room, now = Date.now()) {
  if (room.status !== "playing") return false;
  const groups = new Map();
  for (const player of room.players) {
    const answer = room.answers[player.id];
    if (!answer) continue;
    const key = normalize(answer);
    if (!groups.has(key)) groups.set(key, { answer: answer.trim(), playerIds: [] });
    groups.get(key).playerIds.push(player.id);
  }
  const maxGroupSize = Math.max(0, ...[...groups.values()].map(group => group.playerIds.length));
  const winners = maxGroupSize >= 2 ? [...groups.values()].filter(group => group.playerIds.length === maxGroupSize) : [];
  const winnerIds = [...new Set(winners.flatMap(group => group.playerIds))];
  for (const id of winnerIds) {
    const player = room.players.find(item => item.id === id);
    if (player) player.score += 2;
  }
  room.lastAwarded = winnerIds;
  room.results = {
    groups: [...groups.values()].sort((a, b) => b.playerIds.length - a.playerIds.length).map(group => ({
      answer: group.answer,
      playerIds: group.playerIds,
      names: group.playerIds.map(id => room.players.find(player => player.id === id)?.name || "Player")
    })),
    winnerIds,
    maxGroupSize
  };
  room.status = "reveal";
  room.deadline = now + REVEAL_MS;
  return true;
}
function progressRoom(room, now = Date.now()) {
  let changed = false;
  if (room.status === "playing" && (now >= room.deadline || room.players.every(player => room.answers[player.id]))) {
    changed = finishRound(room, now) || changed;
  } else if (room.status === "reveal" && now >= room.deadline) {
    if (room.round >= ROUNDS) {
      room.status = "finished";
      room.deadline = null;
    } else {
      room.round += 1;
      startRound(room, now);
    }
    changed = true;
  }
  return changed;
}
function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    round: room.round,
    totalRounds: ROUNDS,
    prompt: room.prompt,
    deadline: room.deadline,
    hostId: room.hostId,
    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      score: player.score,
      submitted: room.status === "playing" ? Boolean(room.answers[player.id]) : false,
      connected: true
    })),
    results: room.status === "reveal" || room.status === "finished" ? room.results : null,
    lastAwarded: room.lastAwarded || []
  };
}
function result(status, body, changed = false) { return { status, body, changed }; }

// Compare-and-swap writes prevent two near-simultaneous requests from silently
// overwriting one another. The game is small, but Blobs is not a transactional DB.
async function mutateRoom(code, mutate) {
  const key = `room-${code}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await store.getWithMetadata(key, { consistency: "strong", type: "json" });
    if (!current) return result(404, { error: "Room not found. Check the code and try again." });
    const room = structuredClone(current.data);
    const outcome = mutate(room);
    if (!outcome.changed) return outcome;
    const write = await store.setJSON(key, room, { onlyIfMatch: current.etag });
    if (write.modified) return outcome;
  }
  return result(503, { error: "The room is busy. Please try again." });
}
function validSession(room, request) {
  const playerId = request.headers.get("x-player-id");
  const player = room.players.find(item => item.id === playerId);
  return player ? { player, playerId } : null;
}

export default async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Player-Id,X-Room-Code",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  } });
  if (!(["GET", "POST"].includes(request.method))) return json(405, { error: "Method not allowed." });
  const action = new URL(request.url).searchParams.get("action") || "";
  let data = {};
  if (request.method === "POST") {
    try { data = await request.json(); }
    catch { return json(400, { error: "Invalid JSON." }); }
  }

  if (request.method === "POST" && action === "create") {
    const name = cleanName(data.name);
    if (!name) return json(400, { error: "Enter a player name first." });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = makeCode();
      const playerId = randomBytes(12).toString("hex");
      const room = {
        code, hostId: playerId,
        players: [{ id: playerId, name, score: 0 }],
        status: "lobby", round: 0, prompt: null, deadline: null,
        answers: {}, results: null, lastAwarded: []
      };
      const write = await store.setJSON(`room-${code}`, room, { onlyIfNew: true });
      if (write.modified) return json(200, { playerId, room: publicRoom(room) });
    }
    return json(503, { error: "Could not create a room. Please try again." });
  }

  if (request.method === "POST" && action === "join") {
    const code = String(data.code || "").trim().toUpperCase();
    const name = cleanName(data.name);
    if (!name) return json(400, { error: "Enter a player name first." });
    const playerId = randomBytes(12).toString("hex");
    const outcome = await mutateRoom(code, room => {
      progressRoom(room);
      if (room.status !== "lobby") return result(400, { error: "This game has already started." });
      if (room.players.length >= MAX_PLAYERS) return result(400, { error: "This room is full (8 players maximum)." });
      room.players.push({ id: playerId, name, score: 0 });
      return result(200, { playerId, room: publicRoom(room) }, true);
    });
    return json(outcome.status, outcome.body);
  }

  const code = String(request.headers.get("x-room-code") || "").trim().toUpperCase();
  const sessionId = request.headers.get("x-player-id");
  if (!code || !sessionId) return json(401, { error: "Your room session could not be found. Return home and rejoin." });

  if (request.method === "GET" && action === "state") {
    const outcome = await mutateRoom(code, room => {
      const session = validSession(room, request);
      if (!session) return result(401, { error: "Your room session could not be found. Return home and rejoin." });
      const changed = progressRoom(room);
      return result(200, { room: publicRoom(room) }, changed);
    });
    return json(outcome.status, outcome.body);
  }

  const outcome = await mutateRoom(code, room => {
    const session = validSession(room, request);
    if (!session) return result(401, { error: "Your room session could not be found. Return home and rejoin." });
    const { player, playerId } = session;
    const progressed = progressRoom(room);
    if (action === "start" && request.method === "POST") {
      if (room.hostId !== playerId) return result(403, { error: "Only the host can start the game." });
      if (room.status !== "lobby") return result(400, { error: "The game has already started." });
      if (room.players.length < MIN_PLAYERS) return result(400, { error: "At least 2 players are required." });
      room.round = 1;
      for (const item of room.players) item.score = 0;
      startRound(room);
      return result(200, { room: publicRoom(room) }, true);
    }
    if (action === "answer" && request.method === "POST") {
      if (room.status !== "playing") return result(400, { error: "This round is not accepting answers." }, progressed);
      if (room.answers[playerId]) return result(400, { error: "Your answer is already locked in." }, progressed);
      const answer = String(data.answer ?? "").trim().slice(0, 80);
      if (!answer) return result(400, { error: "Enter an answer first." }, progressed);
      room.answers[playerId] = answer;
      progressRoom(room);
      return result(200, { room: publicRoom(room) }, true);
    }
    return result(404, { error: "Not found." }, progressed);
  });
  return json(outcome.status, outcome.body);
};
