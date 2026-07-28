import { QUESTIONS } from "./questions.js?v=5";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  update,
  remove,
  onValue,
  onDisconnect,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

// Firebase web app configuration for Sir James’s Quizbox.
// Access is protected through Firebase Authentication and Realtime Database Rules.
const firebaseConfig = {
  apiKey: "AIzaSyCcEBcQmDNE3nQqtyympT0GGwiyh9hc-R4",
  authDomain: "cabinet-quiz.firebaseapp.com",
  databaseURL: "https://cabinet-quiz-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cabinet-quiz",
  storageBucket: "cabinet-quiz.firebasestorage.app",
  messagingSenderId: "138239249284",
  appId: "1:138239249284:web:c5589d79fb0457c6862bd1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const QUESTIONS_PER_ROUND = 5;
const QUESTION_SECONDS = 20;
const REVEAL_MS = 6500;
const ROUND_BREAK_MS = 5200;
const MAX_PLAYERS_RECOMMENDED = 8;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GENERAL_CATEGORY = "General Knowledge";
const SPECIALIST_CATEGORIES = [
  "Geography",
  "History",
  "Science & Nature",
  "Arts & Culture",
  "Sports & Games"
];
const ALLOWED_CATEGORIES = [GENERAL_CATEGORY, ...SPECIALIST_CATEGORIES];
const PLAYER_COLORS = [
  "#b94452",
  "#287b8e",
  "#c27825",
  "#4f7d48",
  "#7356a8",
  "#b0528a",
  "#3869a8",
  "#8a6335"
];

const views = {
  home: document.getElementById("homeView"),
  lobby: document.getElementById("lobbyView"),
  game: document.getElementById("gameView"),
  break: document.getElementById("breakView"),
  final: document.getElementById("finalView")
};

const els = {
  playerName: document.getElementById("playerName"),
  createRounds: document.getElementById("createRounds"),
  createCategory: document.getElementById("createCategory"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  homeStatus: document.getElementById("homeStatus"),
  inviteNotice: document.getElementById("inviteNotice"),
  inviteRoomCode: document.getElementById("inviteRoomCode"),

  leaveLobbyBtn: document.getElementById("leaveLobbyBtn"),
  roomCodeDisplay: document.getElementById("roomCodeDisplay"),
  shareRoomBtn: document.getElementById("shareRoomBtn"),
  playersList: document.getElementById("playersList"),
  playerCountBadge: document.getElementById("playerCountBadge"),
  lobbyRounds: document.getElementById("lobbyRounds"),
  lobbyCategory: document.getElementById("lobbyCategory"),
  lobbyCategorySummary: document.getElementById("lobbyCategorySummary"),
  startGameBtn: document.getElementById("startGameBtn"),
  hostHint: document.getElementById("hostHint"),
  lobbyStatus: document.getElementById("lobbyStatus"),

  leaveGameBtn: document.getElementById("leaveGameBtn"),
  roundLabel: document.getElementById("roundLabel"),
  questionLabel: document.getElementById("questionLabel"),
  timerBar: document.getElementById("timerBar"),
  categoryLabel: document.getElementById("categoryLabel"),
  timerText: document.getElementById("timerText"),
  questionText: document.getElementById("questionText"),
  answersGrid: document.getElementById("answersGrid"),
  answerStatus: document.getElementById("answerStatus"),
  myScore: document.getElementById("myScore"),
  leaderName: document.getElementById("leaderName"),

  breakEyebrow: document.getElementById("breakEyebrow"),
  breakTitle: document.getElementById("breakTitle"),
  breakLeaderboard: document.getElementById("breakLeaderboard"),
  breakMessage: document.getElementById("breakMessage"),

  winnerTitle: document.getElementById("winnerTitle"),
  finalLeaderboard: document.getElementById("finalLeaderboard"),
  playAgainBtn: document.getElementById("playAgainBtn"),
  leaveFinalBtn: document.getElementById("leaveFinalBtn"),
  finalHint: document.getElementById("finalHint"),

  toast: document.getElementById("toast"),
  showQrBtn: document.getElementById("showQrBtn"),
  qrModal: document.getElementById("qrModal"),
  qrCode: document.getElementById("qrCode"),
  qrRoomCode: document.getElementById("qrRoomCode"),
  closeQrBtn: document.getElementById("closeQrBtn"),
  copyInviteBtn: document.getElementById("copyInviteBtn")
};

let uid = null;
let authReadyResolve;
const authReady = new Promise(resolve => { authReadyResolve = resolve; });

let roomCode = null;
let roomState = null;
let roomUnsubscribe = null;
let serverTimeOffset = 0;
let playerDisconnect = null;
let hostBusy = false;
let lastRenderedQuestionKey = "";
let toastTimer = null;
let inviteAutoJoinAttempted = false;
let lastInviteUrl = "";

const rememberedName = localStorage.getItem("cabinetQuizName") || "";
els.playerName.value = rememberedName;

let invitationCode = cleanRoomCode(new URL(location.href).searchParams.get("room") || "");
if (invitationCode) {
  els.roomCodeInput.value = invitationCode;
  els.inviteRoomCode.textContent = invitationCode;
  els.inviteNotice.classList.remove("hidden");
  els.joinRoomBtn.textContent = `Join Room ${invitationCode}`;
  els.homeStatus.textContent = rememberedName
    ? `Invitation detected. Tap Join Room to enter ${invitationCode}.`
    : `You have been invited to room ${invitationCode}. Enter your name to join.`;
}

onValue(ref(db, ".info/serverTimeOffset"), snapshot => {
  serverTimeOffset = Number(snapshot.val() || 0);
});

onAuthStateChanged(auth, user => {
  if (!user) return;
  uid = user.uid;
  authReadyResolve(user);

  els.homeStatus.textContent = invitationCode
    ? `Ready to join room ${invitationCode}.`
    : "Online connection ready.";

  if (invitationCode && !rememberedName) {
    setTimeout(() => els.playerName.focus(), 100);
  }
});

signInAnonymously(auth).catch(error => {
  els.homeStatus.textContent = `Firebase sign-in failed: ${friendlyError(error)}`;
});

function showView(name) {
  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle("hidden", key !== name);
  });
  window.scrollTo({ top: 0, behavior: "auto" });
}

function serverNow() {
  return Date.now() + serverTimeOffset;
}

function cleanName(value) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

function cleanRoomCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .replace(/[IO01]/g, "")
    .slice(0, 6);
}

function cleanCategory(value) {
  return ALLOWED_CATEGORIES.includes(value) ? value : GENERAL_CATEGORY;
}

function randomCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function randomGameId() {
  return `${serverNow().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPlayerNameOrWarn() {
  const name = cleanName(els.playerName.value);
  if (!name) {
    showToast("Please enter a player name first.");
    els.playerName.focus();
    return null;
  }
  els.playerName.value = name;
  localStorage.setItem("cabinetQuizName", name);
  return name;
}

function friendlyError(error) {
  const message = String(error?.message || error || "Unknown error");
  if (message.includes("PERMISSION_DENIED")) {
    return "Access denied. Check the Firebase rules and anonymous sign-in.";
  }
  if (message.includes("auth/admin-restricted-operation")) {
    return "Anonymous sign-in has not been enabled in Firebase.";
  }
  return message.replace(/^Firebase:\s*/i, "");
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2800);
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeQuestionPlan(totalQuestions, selectedCategory) {
  const category = cleanCategory(selectedCategory);
  let selectedIds;

  if (category === GENERAL_CATEGORY) {
    const categoryPools = Object.fromEntries(
      SPECIALIST_CATEGORIES.map(name => [
        name,
        shuffle(QUESTIONS.filter(question => question.category === name).map(question => question.id))
      ])
    );

    selectedIds = [];
    for (let i = 0; i < totalQuestions; i += 1) {
      const categoryName = SPECIALIST_CATEGORIES[i % SPECIALIST_CATEGORIES.length];
      selectedIds.push(categoryPools[categoryName].shift());
    }
    selectedIds = shuffle(selectedIds);
  } else {
    selectedIds = shuffle(
      QUESTIONS.filter(question => question.category === category).map(question => question.id)
    ).slice(0, totalQuestions);
  }

  return selectedIds.map(id => ({
    id,
    order: shuffle([0, 1, 2, 3])
  }));
}

function questionById(id) {
  return QUESTIONS.find(question => question.id === id);
}

function connectedPlayers(state = roomState) {
  return Object.entries(state?.players || {})
    .filter(([, player]) => player?.connected !== false)
    .map(([id, player]) => ({ id, ...player }));
}

function sortedPlayers(state = roomState) {
  return Object.entries(state?.players || {})
    .map(([id, player]) => ({ id, ...player }))
    .sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return (a.joinedAt || 0) - (b.joinedAt || 0);
    });
}

function isHost() {
  return Boolean(uid && roomState?.hostUid === uid);
}

function roomRef() {
  return ref(db, `quizRooms/${roomCode}`);
}

function availableColorIndex(players = {}) {
  const used = new Set(
    Object.values(players)
      .map(player => Number(player?.colorIndex))
      .filter(index => Number.isInteger(index) && index >= 0 && index < PLAYER_COLORS.length)
  );
  for (let index = 0; index < PLAYER_COLORS.length; index += 1) {
    if (!used.has(index)) return index;
  }
  return Object.keys(players).length % PLAYER_COLORS.length;
}

function playerColor(player) {
  const index = Number.isInteger(Number(player?.colorIndex))
    ? Number(player.colorIndex) % PLAYER_COLORS.length
    : 0;
  return PLAYER_COLORS[index];
}

function playerInitials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

async function createRoom() {
  const name = getPlayerNameOrWarn();
  if (!name) return;
  await authReady;

  els.createRoomBtn.disabled = true;
  els.homeStatus.textContent = "Creating room…";

  try {
    let createdCode = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = randomCode();
      const candidateRef = ref(db, `quizRooms/${candidate}`);
      const now = serverNow();
      const rounds = Number(els.createRounds.value || 3);
      const category = cleanCategory(els.createCategory.value);
      const result = await runTransaction(candidateRef, current => {
        if (current) return;
        return {
          createdAt: now,
          lastActivity: now,
          version: 5,
          hostUid: uid,
          phase: "lobby",
          settings: {
            roundCount: rounds,
            questionsPerRound: QUESTIONS_PER_ROUND,
            questionSeconds: QUESTION_SECONDS,
            category
          },
          players: {
            [uid]: {
              name,
              connected: true,
              joinedAt: now,
              score: 0,
              lastAward: 0,
              colorIndex: 0
            }
          }
        };
      });

      if (result.committed) {
        createdCode = candidate;
        break;
      }
    }

    if (!createdCode) throw new Error("A free room code could not be generated.");
    await enterRoom(createdCode);
  } catch (error) {
    els.homeStatus.textContent = `The room could not be created: ${friendlyError(error)}`;
  } finally {
    els.createRoomBtn.disabled = false;
  }
}

async function joinRoom(codeOverride = null, automatic = false) {
  const name = getPlayerNameOrWarn();
  if (!name) return;
  await authReady;

  const code = cleanRoomCode(codeOverride || els.roomCodeInput.value);
  els.roomCodeInput.value = code;
  if (code.length !== 6) {
    showToast("The room code must contain six characters.");
    return;
  }

  els.joinRoomBtn.disabled = true;
  els.homeStatus.textContent = automatic
    ? `Joining room ${code}…`
    : `Looking for room ${code}…`;

  try {
    const targetRef = ref(db, `quizRooms/${code}`);
    const snapshot = await get(targetRef);
    if (!snapshot.exists()) throw new Error("This room could not be found.");

    const existing = snapshot.val();
    const knownPlayer = existing.players?.[uid];
    if (existing.phase !== "lobby" && !knownPlayer) {
      throw new Error("This game is already in progress. New players can join once the room returns to the lobby.");
    }

    const now = serverNow();
    const colorIndex = Number.isInteger(Number(knownPlayer?.colorIndex))
      ? Number(knownPlayer.colorIndex)
      : availableColorIndex(existing.players);

    await update(ref(db, `quizRooms/${code}/players/${uid}`), {
      name,
      connected: true,
      joinedAt: knownPlayer?.joinedAt || now,
      score: Number(knownPlayer?.score || 0),
      lastAward: Number(knownPlayer?.lastAward || 0),
      colorIndex
    });

    await enterRoom(code);
  } catch (error) {
    els.homeStatus.textContent = friendlyError(error);
    if (automatic) {
      showToast(friendlyError(error));
      els.playerName.focus();
    }
  } finally {
    els.joinRoomBtn.disabled = false;
  }
}

async function enterRoom(code) {
  roomCode = code;
  els.roomCodeDisplay.textContent = code;

  const url = new URL(location.href);
  url.searchParams.set("room", code);
  history.replaceState({}, "", url);

  if (roomUnsubscribe) roomUnsubscribe();
  roomUnsubscribe = onValue(roomRef(), snapshot => {
    if (!snapshot.exists()) {
      showToast("The room no longer exists.");
      leaveRoom(false);
      return;
    }
    roomState = snapshot.val();
    renderRoom();
    attemptHostHandover();
  });

  const ownRef = ref(db, `quizRooms/${code}/players/${uid}`);
  if (playerDisconnect) {
    try { await playerDisconnect.cancel(); } catch {}
  }
  playerDisconnect = onDisconnect(ownRef);
  await playerDisconnect.update({
    connected: false,
    disconnectedAt: serverNow()
  });

  showView("lobby");
}

async function attemptHostHandover() {
  if (!roomState || !roomCode || roomState.phase === "finished") return;
  const currentHost = roomState.players?.[roomState.hostUid];
  if (currentHost && currentHost.connected !== false) return;

  const candidates = connectedPlayers()
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  if (!candidates.length || candidates[0].id !== uid) return;

  try {
    await runTransaction(ref(db, `quizRooms/${roomCode}/hostUid`), currentHostUid => {
      const latestHost = roomState?.players?.[currentHostUid];
      if (latestHost?.connected !== false) return currentHostUid;
      return uid;
    });
  } catch {
    // Another client may have completed the handover at the same moment.
  }
}

function renderRoom() {
  if (!roomState) return;

  const phase = roomState.phase || "lobby";
  if (phase === "lobby") {
    showView("lobby");
    renderLobby();
  } else if (phase === "question" || phase === "reveal") {
    showView("game");
    renderGame();
  } else if (phase === "roundBreak") {
    showView("break");
    renderRoundBreak();
  } else if (phase === "finished") {
    showView("final");
    renderFinal();
  }

  renderScoreStrip();
}

function renderLobby() {
  const players = sortedPlayers();
  const onlineCount = connectedPlayers().length;
  els.playerCountBadge.textContent = String(onlineCount);
  els.playersList.innerHTML = "";

  players.forEach(player => {
    const row = document.createElement("div");
    row.className = `player-row ${player.connected === false ? "offline" : ""}`;

    const identity = document.createElement("div");
    identity.className = "player-identity";

    const token = document.createElement("span");
    token.className = "player-token";
    token.style.setProperty("--player-color", playerColor(player));
    token.textContent = playerInitials(player.name);
    token.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.name || "Unnamed";

    const tag = document.createElement("span");
    tag.className = "host-tag";
    tag.textContent = player.id === roomState.hostUid ? "Host" : "";

    identity.append(token, name);
    row.append(identity, tag);
    els.playersList.append(row);
  });

  const rounds = Number(roomState.settings?.roundCount || 3);
  const category = cleanCategory(roomState.settings?.category);
  els.lobbyRounds.value = String(rounds);
  els.lobbyRounds.disabled = !isHost();
  els.lobbyCategory.value = category;
  els.lobbyCategory.disabled = !isHost();
  els.lobbyCategorySummary.textContent = category === GENERAL_CATEGORY
    ? "A balanced mix from all five specialist categories."
    : `Questions will come from ${category}.`;
  els.startGameBtn.disabled = !isHost() || onlineCount < 1;

  if (isHost()) {
    els.hostHint.textContent = onlineCount > MAX_PLAYERS_RECOMMENDED
      ? "A large group is connected. Up to eight players is recommended for the clearest color display."
      : "You are the host. Start when everyone is ready.";
    els.lobbyStatus.textContent = `${onlineCount} player${onlineCount === 1 ? "" : "s"} connected.`;
  } else {
    const hostName = roomState.players?.[roomState.hostUid]?.name || "The host";
    els.hostHint.textContent = `${hostName} chooses the mode and starts the game.`;
    els.lobbyStatus.textContent = "Waiting for the host to start.";
  }
}

function renderGame() {
  const game = roomState.game;
  if (!game?.plan?.length) return;

  const cursor = Number(game.cursor || 0);
  const planItem = game.plan[cursor];
  const question = questionById(planItem?.id);
  if (!question) return;

  const roundCount = Number(roomState.settings?.roundCount || 1);
  const roundNumber = Math.floor(cursor / QUESTIONS_PER_ROUND) + 1;
  const questionInRound = (cursor % QUESTIONS_PER_ROUND) + 1;

  els.roundLabel.textContent = `Round ${roundNumber} of ${roundCount}`;
  els.questionLabel.textContent = `Question ${questionInRound} of ${QUESTIONS_PER_ROUND}`;
  els.categoryLabel.textContent = question.category;
  els.questionText.textContent = question.question;

  const currentAnswers = roomState.answers?.[game.id]?.[cursor] || {};
  const ownAnswer = currentAnswers[uid];
  const answerMarker = ownAnswer ? String(ownAnswer.choice) : "none";
  const revealSignature = roomState.phase === "reveal"
    ? Object.entries(currentAnswers)
      .map(([playerId, answer]) => `${playerId}:${answer?.choice}`)
      .sort()
      .join("|")
    : "hidden";
  const key = `${game.id}:${cursor}:${roomState.phase}:${answerMarker}:${revealSignature}`;
  if (key !== lastRenderedQuestionKey) {
    lastRenderedQuestionKey = key;
    renderAnswerButtons(question, planItem, cursor);
  }

  if (roomState.phase === "question") {
    els.answerStatus.textContent = ownAnswer
      ? "Answer locked. The reveal begins when the timer reaches zero."
      : "Choose one answer. Every player gets the full 20 seconds.";
  } else {
    const ownAward = Number(roomState.players?.[uid]?.lastAward || 0);
    const ownCorrect = ownAnswer && Number(ownAnswer.choice) === Number(question.answer);
    if (!ownAnswer) {
      els.answerStatus.textContent = `Time expired. ${question.explanation}`;
    } else if (ownCorrect) {
      els.answerStatus.textContent = `Correct · +${ownAward} points. ${question.explanation}`;
    } else {
      els.answerStatus.textContent = `Not this time. ${question.explanation}`;
    }
  }
}

function renderAnswerButtons(question, planItem, cursor) {
  els.answersGrid.innerHTML = "";
  const letters = ["A", "B", "C", "D"];
  const gameId = roomState.game.id;
  const answers = roomState.answers?.[gameId]?.[cursor] || {};
  const ownAnswer = answers[uid];
  const ownPlayer = roomState.players?.[uid];

  planItem.order.forEach((baseOptionIndex, displayIndex) => {
    const button = document.createElement("button");
    button.className = "answer-btn";
    button.type = "button";
    button.dataset.baseIndex = String(baseOptionIndex);

    const main = document.createElement("span");
    main.className = "answer-main";

    const letter = document.createElement("span");
    letter.className = "answer-letter";
    letter.textContent = letters[displayIndex];

    const text = document.createElement("span");
    text.className = "answer-copy";
    text.textContent = question.options[baseOptionIndex];

    main.append(letter, text);
    button.append(main);

    if (ownAnswer && Number(ownAnswer.choice) === baseOptionIndex) {
      button.classList.add("selected");
      button.style.setProperty("--selection-color", playerColor(ownPlayer));
    }

    if (roomState.phase === "reveal") {
      button.disabled = true;
      if (baseOptionIndex === Number(question.answer)) button.classList.add("correct");
      if (ownAnswer && Number(ownAnswer.choice) === baseOptionIndex && baseOptionIndex !== Number(question.answer)) {
        button.classList.add("incorrect-own");
      }

      const picks = Object.entries(answers)
        .filter(([, answer]) => Number(answer?.choice) === baseOptionIndex)
        .map(([playerId]) => ({ id: playerId, ...(roomState.players?.[playerId] || {}) }))
        .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

      if (picks.length) {
        button.classList.add("has-picks");

        const ribbon = document.createElement("span");
        ribbon.className = "answer-pick-ribbon";
        ribbon.setAttribute("aria-hidden", "true");
        picks.forEach(player => {
          const segment = document.createElement("span");
          segment.style.background = playerColor(player);
          ribbon.append(segment);
        });

        const chips = document.createElement("span");
        chips.className = "answer-picks";
        picks.forEach(player => {
          const chip = document.createElement("span");
          chip.className = "answer-player-chip";
          chip.style.setProperty("--player-color", playerColor(player));
          chip.title = `${player.name || "Unnamed"} chose this answer`;

          const initial = document.createElement("span");
          initial.className = "answer-player-initial";
          initial.textContent = playerInitials(player.name);

          const playerName = document.createElement("span");
          playerName.textContent = player.name || "Unnamed";

          chip.append(initial, playerName);
          chips.append(chip);
        });

        button.append(ribbon, chips);
      }
    } else {
      button.disabled = Boolean(ownAnswer);
      button.addEventListener("click", () => submitAnswer(baseOptionIndex));
    }

    els.answersGrid.append(button);
  });
}

async function submitAnswer(baseOptionIndex) {
  if (!roomState || roomState.phase !== "question" || !roomCode || !uid) return;
  const game = roomState.game;
  const cursor = Number(game.cursor || 0);
  const planItem = game.plan?.[cursor];
  const question = questionById(planItem?.id);
  if (!question) return;

  const elapsed = serverNow() - Number(game.questionStartedAt || 0);
  if (elapsed > QUESTION_SECONDS * 1000 + 300) {
    showToast("The answer time has already expired.");
    return;
  }

  const answerRef = ref(db, `quizRooms/${roomCode}/answers/${game.id}/${cursor}/${uid}`);
  try {
    const result = await runTransaction(answerRef, current => {
      if (current) return current;
      return {
        choice: Number(baseOptionIndex),
        at: serverNow()
      };
    });

    if (result.committed) {
      if (navigator.vibrate) navigator.vibrate(25);
      renderGame();
    }
  } catch (error) {
    showToast(`Your answer could not be saved: ${friendlyError(error)}`);
  }
}

function renderScoreStrip() {
  if (!roomState) return;
  const players = sortedPlayers();
  const me = roomState.players?.[uid];
  els.myScore.textContent = String(me?.score || 0);
  els.leaderName.textContent = players[0]?.name || "–";
}

function renderLeaderboard(container) {
  container.innerHTML = "";
  const players = sortedPlayers();

  players.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "leader-row";

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = `${index + 1}.`;

    const token = document.createElement("span");
    token.className = "player-token compact-token";
    token.style.setProperty("--player-color", playerColor(player));
    token.textContent = playerInitials(player.name);

    const name = document.createElement("span");
    name.className = "leader-player-name";
    name.textContent = player.name || "Unnamed";

    const points = document.createElement("span");
    points.className = "points";
    points.textContent = `${player.score || 0} pts`;

    row.append(rank, token, name, points);
    container.append(row);
  });
}

function renderRoundBreak() {
  const cursor = Number(roomState.game?.cursor || 0);
  const finishedRound = Math.floor(cursor / QUESTIONS_PER_ROUND) + 1;
  const totalRounds = Number(roomState.settings?.roundCount || 1);
  els.breakEyebrow.textContent = `Round ${finishedRound} of ${totalRounds} complete`;
  els.breakTitle.textContent = "Current Standings";
  renderLeaderboard(els.breakLeaderboard);
  els.breakMessage.textContent = isHost()
    ? "The next round begins automatically."
    : "The host will open the next round in a moment.";
}

function renderFinal() {
  const players = sortedPlayers();
  const topScore = players[0]?.score || 0;
  const winners = players.filter(player => (player.score || 0) === topScore);
  els.winnerTitle.textContent = winners.length > 1
    ? `Tie: ${winners.map(player => player.name).join(" & ")}`
    : `${winners[0]?.name || "Nobody"} Wins`;

  renderLeaderboard(els.finalLeaderboard);
  els.playAgainBtn.classList.toggle("hidden", !isHost());
  els.finalHint.textContent = isHost()
    ? "Bring the same group back to the lobby for another game."
    : "The host can prepare another game.";
}

function updateTimerDisplay() {
  if (!roomState || roomState.phase !== "question" || !roomState.game) return;
  const start = Number(roomState.game.questionStartedAt || serverNow());
  const duration = QUESTION_SECONDS * 1000;
  const remaining = Math.max(0, duration - (serverNow() - start));
  const ratio = Math.max(0, Math.min(1, remaining / duration));

  els.timerBar.style.width = `${ratio * 100}%`;
  els.timerText.textContent = String(Math.ceil(remaining / 1000));
  els.timerText.classList.toggle("urgent", remaining <= 5000);
}

async function startGame() {
  if (!isHost() || !roomState) return;
  const rounds = Number(roomState.settings?.roundCount || 3);
  const category = cleanCategory(roomState.settings?.category);
  const totalQuestions = rounds * QUESTIONS_PER_ROUND;
  const plan = makeQuestionPlan(totalQuestions, category);
  const gameId = randomGameId();
  const now = serverNow();

  if (plan.length !== totalQuestions) {
    showToast("There are not enough questions in this category.");
    return;
  }

  els.startGameBtn.disabled = true;
  try {
    await runTransaction(roomRef(), current => {
      if (!current || current.hostUid !== uid || current.phase !== "lobby") return;
      Object.values(current.players || {}).forEach(player => {
        player.score = 0;
        player.lastAward = 0;
      });
      current.answers = null;
      current.phase = "question";
      current.lastActivity = now;
      current.game = {
        id: gameId,
        plan,
        cursor: 0,
        category,
        questionStartedAt: now
      };
      return current;
    });
  } catch (error) {
    showToast(`The game could not be started: ${friendlyError(error)}`);
  } finally {
    els.startGameBtn.disabled = false;
  }
}

async function settleQuestionIfNeeded() {
  if (!isHost() || hostBusy || roomState?.phase !== "question") return;
  const game = roomState.game;
  if (!game) return;

  const cursor = Number(game.cursor || 0);
  const timeEnded = serverNow() - Number(game.questionStartedAt || 0) >= QUESTION_SECONDS * 1000;

  // Every question always lasts the full 20 seconds, even when all players answer early.
  if (!timeEnded) return;

  const planItem = game.plan?.[cursor];
  const question = questionById(planItem?.id);
  if (!question) return;
  const correctChoice = Number(question.answer);

  hostBusy = true;
  try {
    const now = serverNow();
    await runTransaction(roomRef(), current => {
      if (!current || current.hostUid !== uid || current.phase !== "question") return;
      if (Number(current.game?.cursor || 0) !== cursor || current.game?.id !== game.id) return;

      const currentAnswers = current.answers?.[game.id]?.[cursor] || {};
      Object.entries(current.players || {}).forEach(([playerId, player]) => {
        const answer = currentAnswers[playerId];
        let award = 0;
        if (answer && Number(answer.choice) === correctChoice) {
          const elapsed = Math.max(0, Number(answer.at || now) - Number(current.game.questionStartedAt || now));
          const speedRatio = Math.max(0, 1 - elapsed / (QUESTION_SECONDS * 1000));
          award = 100 + Math.round(50 * speedRatio);
          player.score = Number(player.score || 0) + award;
        }
        player.lastAward = award;
      });

      current.phase = "reveal";
      current.game.revealStartedAt = now;
      current.lastActivity = now;
      return current;
    });
  } finally {
    hostBusy = false;
  }
}

async function advanceAfterRevealIfNeeded() {
  if (!isHost() || hostBusy || roomState?.phase !== "reveal") return;
  const game = roomState.game;
  if (!game) return;
  if (serverNow() - Number(game.revealStartedAt || 0) < REVEAL_MS) return;

  hostBusy = true;
  try {
    const cursor = Number(game.cursor || 0);
    const total = game.plan?.length || 0;
    const nextCursor = cursor + 1;
    const now = serverNow();

    await runTransaction(roomRef(), current => {
      if (!current || current.hostUid !== uid || current.phase !== "reveal") return;
      if (Number(current.game?.cursor || 0) !== cursor || current.game?.id !== game.id) return;

      if (nextCursor >= total) {
        current.phase = "finished";
        current.game.finishedAt = now;
      } else if (nextCursor % QUESTIONS_PER_ROUND === 0) {
        current.phase = "roundBreak";
        current.game.roundBreakStartedAt = now;
      } else {
        current.phase = "question";
        current.game.cursor = nextCursor;
        current.game.questionStartedAt = now;
        current.game.revealStartedAt = null;
      }
      current.lastActivity = now;
      return current;
    });
  } finally {
    hostBusy = false;
  }
}

async function advanceAfterRoundBreakIfNeeded() {
  if (!isHost() || hostBusy || roomState?.phase !== "roundBreak") return;
  const game = roomState.game;
  if (!game) return;
  if (serverNow() - Number(game.roundBreakStartedAt || 0) < ROUND_BREAK_MS) return;

  hostBusy = true;
  try {
    const cursor = Number(game.cursor || 0);
    const nextCursor = cursor + 1;
    const now = serverNow();

    await runTransaction(roomRef(), current => {
      if (!current || current.hostUid !== uid || current.phase !== "roundBreak") return;
      if (Number(current.game?.cursor || 0) !== cursor || current.game?.id !== game.id) return;

      current.phase = "question";
      current.game.cursor = nextCursor;
      current.game.questionStartedAt = now;
      current.game.roundBreakStartedAt = null;
      current.lastActivity = now;
      return current;
    });
  } finally {
    hostBusy = false;
  }
}

async function returnToLobby() {
  if (!isHost() || !roomState) return;
  const now = serverNow();

  try {
    await runTransaction(roomRef(), current => {
      if (!current || current.hostUid !== uid || current.phase !== "finished") return;
      Object.values(current.players || {}).forEach(player => {
        player.score = 0;
        player.lastAward = 0;
      });
      current.phase = "lobby";
      current.game = null;
      current.answers = null;
      current.lastActivity = now;
      return current;
    });
  } catch (error) {
    showToast(`A new game could not be prepared: ${friendlyError(error)}`);
  }
}

async function leaveRoom(removePlayer = true) {
  const oldCode = roomCode;
  const oldUid = uid;
  const oldState = roomState;
  const wasSoloHost = Boolean(
    oldState &&
    oldState.hostUid === oldUid &&
    Object.keys(oldState.players || {}).length === 1
  );

  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }

  if (playerDisconnect) {
    try { await playerDisconnect.cancel(); } catch {}
    playerDisconnect = null;
  }

  roomCode = null;
  roomState = null;
  lastRenderedQuestionKey = "";

  const url = new URL(location.href);
  url.searchParams.delete("room");
  history.replaceState({}, "", url);
  invitationCode = "";
  els.inviteNotice.classList.add("hidden");
  els.joinRoomBtn.textContent = "Join Room";
  els.roomCodeInput.value = "";
  showView("home");
  els.homeStatus.textContent = "Online connection ready.";

  if (removePlayer && oldCode && oldUid) {
    try {
      if (wasSoloHost) {
        await remove(ref(db, `quizRooms/${oldCode}`));
      } else if (oldState?.hostUid === oldUid) {
        await update(ref(db, `quizRooms/${oldCode}/players/${oldUid}`), {
          connected: false,
          disconnectedAt: serverNow()
        });
      } else {
        await remove(ref(db, `quizRooms/${oldCode}/players/${oldUid}`));
      }
    } catch {
      try {
        await update(ref(db, `quizRooms/${oldCode}/players/${oldUid}`), {
          connected: false,
          disconnectedAt: serverNow()
        });
      } catch {
        // The room may already be closed or the connection may be unavailable.
      }
    }
  }
}

function invitationUrl() {
  if (!roomCode) return "";
  const shareUrl = invitationUrl();
  return shareUrl.toString();
}

async function copyInvitation() {
  const url = invitationUrl();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Invitation link copied.");
  } catch {
    const input = document.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    showToast("Invitation link copied.");
  }
}

function qrImageUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=18&data=${encodeURIComponent(value)}`;
}

function showQrCode() {
  const url = invitationUrl();
  if (!url) return;
  lastInviteUrl = url;
  els.qrCode.innerHTML = "";
  const image = document.createElement("img");
  image.src = qrImageUrl(url);
  image.alt = `QR code to join room ${roomCode}`;
  image.width = 300;
  image.height = 300;
  els.qrCode.append(image);
  els.qrRoomCode.textContent = roomCode;
  els.qrModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeQrCode() {
  els.qrModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

async function shareRoom() {
  if (!roomCode) return;
  const shareUrl = invitationUrl();
  const data = {
    title: "Sir James’s Quizbox",
    text: `Join my Sir James’s Quizbox room ${roomCode}. The link opens the room directly.`,
    url: shareUrl
  };

  try {
    if (navigator.share) {
      await navigator.share(data);
    } else {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Invitation link copied.");
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast("Invitation link copied.");
      } catch {
        showToast(`Room code: ${roomCode}`);
      }
    }
  }
}

async function updateLobbySettings() {
  if (!isHost() || !roomCode) return;
  const rounds = Number(els.lobbyRounds.value);
  const category = cleanCategory(els.lobbyCategory.value);
  try {
    await update(ref(db, `quizRooms/${roomCode}/settings`), {
      roundCount: rounds,
      questionsPerRound: QUESTIONS_PER_ROUND,
      questionSeconds: QUESTION_SECONDS,
      category
    });
  } catch (error) {
    showToast(`The game settings could not be changed: ${friendlyError(error)}`);
  }
}

els.createRoomBtn.addEventListener("click", createRoom);
els.joinRoomBtn.addEventListener("click", () => joinRoom());
els.roomCodeInput.addEventListener("input", () => {
  els.roomCodeInput.value = cleanRoomCode(els.roomCodeInput.value);
});
els.playerName.addEventListener("change", () => {
  const name = cleanName(els.playerName.value);
  els.playerName.value = name;
  if (name) localStorage.setItem("cabinetQuizName", name);
});
els.playerName.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    if (invitationCode || cleanRoomCode(els.roomCodeInput.value).length === 6) joinRoom(invitationCode || null);
    else createRoom();
  }
});
els.leaveLobbyBtn.addEventListener("click", () => leaveRoom(true));
els.leaveGameBtn.addEventListener("click", () => leaveRoom(true));
els.leaveFinalBtn.addEventListener("click", () => leaveRoom(true));
els.shareRoomBtn.addEventListener("click", shareRoom);
els.showQrBtn.addEventListener("click", showQrCode);
els.closeQrBtn.addEventListener("click", closeQrCode);
els.copyInviteBtn.addEventListener("click", copyInvitation);
els.qrModal.addEventListener("click", event => { if (event.target.matches("[data-close-qr]")) closeQrCode(); });
els.startGameBtn.addEventListener("click", startGame);
els.playAgainBtn.addEventListener("click", returnToLobby);
els.lobbyRounds.addEventListener("change", updateLobbySettings);
els.lobbyCategory.addEventListener("change", updateLobbySettings);

window.addEventListener("online", () => showToast("Internet connection restored."));
window.addEventListener("offline", () => showToast("Offline — answers cannot be synchronized right now."));

setInterval(() => {
  updateTimerDisplay();
  settleQuestionIfNeeded();
  advanceAfterRevealIfNeeded();
  advanceAfterRoundBreakIfNeeded();
}, 180);

// Service workers are intentionally disabled for this live multiplayer build.
// Removing old workers prevents iPhone Safari from loading stale JavaScript that can block taps.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith("cabinet-quiz")).map(key => caches.delete(key)));
      }
    } catch {
      // The website remains fully usable when cleanup is unavailable.
    }
  });
}
