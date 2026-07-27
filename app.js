import { QUESTIONS } from "./questions.js";
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
  set,
  update,
  remove,
  onValue,
  onDisconnect,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

// Dieselbe Firebase-Web-App wie beim Basketball-Spiel.
// Die Firebase-Konfiguration ist kein privater Server-Schlüssel.
// Schutz und Berechtigungen werden über Firebase Authentication und Database Rules geregelt.
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
const REVEAL_MS = 3800;
const ROUND_BREAK_MS = 5200;
const MAX_PLAYERS_RECOMMENDED = 8;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  homeStatus: document.getElementById("homeStatus"),

  leaveLobbyBtn: document.getElementById("leaveLobbyBtn"),
  roomCodeDisplay: document.getElementById("roomCodeDisplay"),
  shareRoomBtn: document.getElementById("shareRoomBtn"),
  playersList: document.getElementById("playersList"),
  playerCountBadge: document.getElementById("playerCountBadge"),
  lobbyRounds: document.getElementById("lobbyRounds"),
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

  toast: document.getElementById("toast")
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

const rememberedName = localStorage.getItem("cabinetQuizName") || "";
els.playerName.value = rememberedName;

const urlRoom = cleanRoomCode(new URL(location.href).searchParams.get("room") || "");
if (urlRoom) {
  els.roomCodeInput.value = urlRoom;
  els.homeStatus.textContent = `Einladungslink erkannt: Raum ${urlRoom}. Namen eingeben und beitreten.`;
}

onValue(ref(db, ".info/serverTimeOffset"), snapshot => {
  serverTimeOffset = Number(snapshot.val() || 0);
});

onAuthStateChanged(auth, user => {
  if (!user) return;
  uid = user.uid;
  authReadyResolve(user);
  els.homeStatus.textContent = urlRoom
    ? `Bereit für Raum ${urlRoom}.`
    : "Online-Verbindung bereit.";
});

signInAnonymously(auth).catch(error => {
  els.homeStatus.textContent = `Firebase-Anmeldung fehlgeschlagen: ${friendlyError(error)}`;
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
    showToast("Bitte gib zuerst einen Spielernamen ein.");
    els.playerName.focus();
    return null;
  }
  els.playerName.value = name;
  localStorage.setItem("cabinetQuizName", name);
  return name;
}

function friendlyError(error) {
  const message = String(error?.message || error || "Unbekannter Fehler");
  if (message.includes("PERMISSION_DENIED")) {
    return "Zugriff verweigert. Prüfe die Firebase-Regeln und die anonyme Anmeldung.";
  }
  if (message.includes("auth/admin-restricted-operation")) {
    return "Die anonyme Anmeldung ist in Firebase noch nicht aktiviert.";
  }
  return message.replace(/^Firebase:\s*/i, "");
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeQuestionPlan(totalQuestions) {
  return shuffle(QUESTIONS.map(question => question.id))
    .slice(0, totalQuestions)
    .map(id => ({
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

async function createRoom() {
  const name = getPlayerNameOrWarn();
  if (!name) return;
  await authReady;

  els.createRoomBtn.disabled = true;
  els.homeStatus.textContent = "Raum wird erstellt …";

  try {
    let createdCode = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = randomCode();
      const candidateRef = ref(db, `quizRooms/${candidate}`);
      const now = serverNow();
      const rounds = Number(els.createRounds.value || 3);
      const result = await runTransaction(candidateRef, current => {
        if (current) return;
        return {
          createdAt: now,
          lastActivity: now,
          hostUid: uid,
          phase: "lobby",
          settings: {
            roundCount: rounds,
            questionsPerRound: QUESTIONS_PER_ROUND,
            questionSeconds: QUESTION_SECONDS
          },
          players: {
            [uid]: {
              name,
              connected: true,
              joinedAt: now,
              score: 0,
              lastAward: 0
            }
          }
        };
      });

      if (result.committed) {
        createdCode = candidate;
        break;
      }
    }

    if (!createdCode) throw new Error("Es konnte kein freier Raumcode erzeugt werden.");
    await enterRoom(createdCode);
  } catch (error) {
    els.homeStatus.textContent = `Raum konnte nicht erstellt werden: ${friendlyError(error)}`;
  } finally {
    els.createRoomBtn.disabled = false;
  }
}

async function joinRoom() {
  const name = getPlayerNameOrWarn();
  if (!name) return;
  await authReady;

  const code = cleanRoomCode(els.roomCodeInput.value);
  els.roomCodeInput.value = code;
  if (code.length !== 6) {
    showToast("Der Raumcode muss aus sechs Zeichen bestehen.");
    return;
  }

  els.joinRoomBtn.disabled = true;
  els.homeStatus.textContent = `Raum ${code} wird gesucht …`;

  try {
    const targetRef = ref(db, `quizRooms/${code}`);
    const snapshot = await get(targetRef);
    if (!snapshot.exists()) throw new Error("Dieser Raum wurde nicht gefunden.");

    const existing = snapshot.val();
    const knownPlayer = existing.players?.[uid];
    if (existing.phase !== "lobby" && !knownPlayer) {
      throw new Error("Diese Partie läuft bereits. Neue Spieler können erst in der Lobby beitreten.");
    }

    const now = serverNow();
    await update(ref(db, `quizRooms/${code}/players/${uid}`), {
      name,
      connected: true,
      joinedAt: knownPlayer?.joinedAt || now,
      score: Number(knownPlayer?.score || 0),
      lastAward: Number(knownPlayer?.lastAward || 0)
    });

    await enterRoom(code);
  } catch (error) {
    els.homeStatus.textContent = friendlyError(error);
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
      showToast("Der Raum existiert nicht mehr.");
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
    // Ein anderer Client kann die Übergabe gleichzeitig übernommen haben.
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

    const name = document.createElement("div");
    name.className = "player-name";
    name.innerHTML = `<span class="online-dot" aria-hidden="true"></span><span></span>`;
    name.querySelector("span:last-child").textContent = player.name || "Unbenannt";

    const tag = document.createElement("span");
    tag.className = "host-tag";
    tag.textContent = player.id === roomState.hostUid ? "Spielleitung" : "";

    row.append(name, tag);
    els.playersList.append(row);
  });

  const rounds = Number(roomState.settings?.roundCount || 3);
  els.lobbyRounds.value = String(rounds);
  els.lobbyRounds.disabled = !isHost();
  els.startGameBtn.disabled = !isHost() || onlineCount < 1;

  if (isHost()) {
    els.hostHint.textContent = onlineCount > MAX_PLAYERS_RECOMMENDED
      ? "Viele Spieler sind verbunden. Für flüssiges Spielen sind bis zu acht empfohlen."
      : "Du bist die Spielleitung. Starte, sobald alle bereit sind.";
    els.lobbyStatus.textContent = `${onlineCount} Spieler verbunden.`;
  } else {
    const hostName = roomState.players?.[roomState.hostUid]?.name || "Die Spielleitung";
    els.hostHint.textContent = `${hostName} wählt die Rundenzahl und startet die Partie.`;
    els.lobbyStatus.textContent = "Warte auf den Spielstart.";
  }
}

function renderGame() {
  const game = roomState.game;
  if (!game?.plan?.length) return;

  const cursor = Number(game.cursor || 0);
  const planItem = game.plan[cursor];
  const question = questionById(planItem.id);
  if (!question) return;

  const roundCount = Number(roomState.settings?.roundCount || 1);
  const roundNumber = Math.floor(cursor / QUESTIONS_PER_ROUND) + 1;
  const questionInRound = (cursor % QUESTIONS_PER_ROUND) + 1;

  els.roundLabel.textContent = `Runde ${roundNumber} von ${roundCount}`;
  els.questionLabel.textContent = `Frage ${questionInRound} von ${QUESTIONS_PER_ROUND}`;
  els.categoryLabel.textContent = question.category;
  els.questionText.textContent = question.question;

  const ownAnswer = roomState.answers?.[game.id]?.[cursor]?.[uid];
  const answerMarker = ownAnswer ? String(ownAnswer.choice) : "none";
  const key = `${game.id}:${cursor}:${roomState.phase}:${answerMarker}`;
  if (key !== lastRenderedQuestionKey) {
    lastRenderedQuestionKey = key;
    renderAnswerButtons(question, planItem, cursor);
  }
  if (roomState.phase === "question") {
    els.answerStatus.textContent = ownAnswer
      ? "Antwort gespeichert. Warte auf die anderen Spieler …"
      : "Wähle eine Antwort.";
  } else {
    const ownAward = Number(roomState.players?.[uid]?.lastAward || 0);
    if (!ownAnswer) {
      els.answerStatus.textContent = `Zeit abgelaufen. ${question.explanation}`;
    } else if (ownAnswer.correct) {
      els.answerStatus.textContent = `Richtig · +${ownAward} Punkte. ${question.explanation}`;
    } else {
      els.answerStatus.textContent = `Leider falsch. ${question.explanation}`;
    }
  }
}

function renderAnswerButtons(question, planItem, cursor) {
  els.answersGrid.innerHTML = "";
  const letters = ["A", "B", "C", "D"];
  const gameId = roomState.game.id;
  const ownAnswer = roomState.answers?.[gameId]?.[cursor]?.[uid];

  planItem.order.forEach((baseOptionIndex, displayIndex) => {
    const button = document.createElement("button");
    button.className = "answer-btn";
    button.type = "button";
    button.dataset.baseIndex = String(baseOptionIndex);

    const letter = document.createElement("span");
    letter.className = "answer-letter";
    letter.textContent = letters[displayIndex];

    const text = document.createElement("span");
    text.textContent = question.options[baseOptionIndex];

    button.append(letter, text);

    if (ownAnswer && Number(ownAnswer.choice) === baseOptionIndex) {
      button.classList.add("selected");
    }

    if (roomState.phase === "reveal") {
      button.disabled = true;
      if (baseOptionIndex === question.answer) button.classList.add("correct");
      if (ownAnswer && Number(ownAnswer.choice) === baseOptionIndex && !ownAnswer.correct) {
        button.classList.add("incorrect");
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
    showToast("Die Antwortzeit ist bereits abgelaufen.");
    return;
  }

  const answerRef = ref(db, `quizRooms/${roomCode}/answers/${game.id}/${cursor}/${uid}`);
  try {
    const result = await runTransaction(answerRef, current => {
      if (current) return current;
      return {
        choice: Number(baseOptionIndex),
        at: serverNow(),
        correct: Number(baseOptionIndex) === Number(question.answer)
      };
    });

    if (result.committed) {
      if (navigator.vibrate) navigator.vibrate(25);
      renderGame();
    }
  } catch (error) {
    showToast(`Antwort konnte nicht gespeichert werden: ${friendlyError(error)}`);
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

    const name = document.createElement("span");
    name.textContent = player.name || "Unbenannt";

    const points = document.createElement("span");
    points.className = "points";
    points.textContent = `${player.score || 0} P`;

    row.append(rank, name, points);
    container.append(row);
  });
}

function renderRoundBreak() {
  const cursor = Number(roomState.game?.cursor || 0);
  const finishedRound = Math.floor(cursor / QUESTIONS_PER_ROUND) + 1;
  const totalRounds = Number(roomState.settings?.roundCount || 1);
  els.breakEyebrow.textContent = `Runde ${finishedRound} von ${totalRounds} beendet`;
  els.breakTitle.textContent = "Zwischenstand";
  renderLeaderboard(els.breakLeaderboard);
  els.breakMessage.textContent = isHost()
    ? "Die nächste Runde beginnt automatisch."
    : "Die Spielleitung eröffnet gleich die nächste Runde.";
}

function renderFinal() {
  const players = sortedPlayers();
  const topScore = players[0]?.score || 0;
  const winners = players.filter(player => (player.score || 0) === topScore);
  els.winnerTitle.textContent = winners.length > 1
    ? `Unentschieden: ${winners.map(player => player.name).join(" & ")}`
    : `${winners[0]?.name || "Niemand"} gewinnt`;

  renderLeaderboard(els.finalLeaderboard);
  els.playAgainBtn.classList.toggle("hidden", !isHost());
  els.finalHint.textContent = isHost()
    ? "Du kannst dieselbe Gesellschaft zurück in die Lobby holen."
    : "Die Spielleitung kann eine neue Partie vorbereiten.";
}

function updateTimerDisplay() {
  if (!roomState || roomState.phase !== "question" || !roomState.game) return;
  const start = Number(roomState.game.questionStartedAt || serverNow());
  const duration = QUESTION_SECONDS * 1000;
  const remaining = Math.max(0, duration - (serverNow() - start));
  const ratio = Math.max(0, Math.min(1, remaining / duration));

  els.timerBar.style.width = `${ratio * 100}%`;
  els.timerText.textContent = String(Math.ceil(remaining / 1000));
}

async function startGame() {
  if (!isHost() || !roomState) return;
  const rounds = Number(roomState.settings?.roundCount || 3);
  const totalQuestions = Math.min(QUESTIONS.length, rounds * QUESTIONS_PER_ROUND);
  const plan = makeQuestionPlan(totalQuestions);
  const gameId = randomGameId();
  const now = serverNow();

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
        questionStartedAt: now
      };
      return current;
    });
  } catch (error) {
    showToast(`Spielstart fehlgeschlagen: ${friendlyError(error)}`);
  } finally {
    els.startGameBtn.disabled = false;
  }
}

async function settleQuestionIfNeeded() {
  if (!isHost() || hostBusy || roomState?.phase !== "question") return;
  const game = roomState.game;
  if (!game) return;

  const cursor = Number(game.cursor || 0);
  const answers = roomState.answers?.[game.id]?.[cursor] || {};
  const players = connectedPlayers();
  const allAnswered = players.length > 0 && players.every(player => answers[player.id]);
  const timeEnded = serverNow() - Number(game.questionStartedAt || 0) >= QUESTION_SECONDS * 1000;
  if (!allAnswered && !timeEnded) return;

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
        if (answer?.correct) {
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
    showToast(`Neue Partie konnte nicht vorbereitet werden: ${friendlyError(error)}`);
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
  showView("home");
  els.homeStatus.textContent = "Online-Verbindung bereit.";

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
        // Der Raum kann bereits geschlossen oder die Verbindung getrennt sein.
      }
    }
  }
}

async function shareRoom() {
  if (!roomCode) return;
  const shareUrl = new URL(location.href);
  shareUrl.searchParams.set("room", roomCode);
  const data = {
    title: "Cabinet Quiz",
    text: `Komm in meinen Quizraum ${roomCode}.`,
    url: shareUrl.toString()
  };

  try {
    if (navigator.share) {
      await navigator.share(data);
    } else {
      await navigator.clipboard.writeText(shareUrl.toString());
      showToast("Einladungslink kopiert.");
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      try {
        await navigator.clipboard.writeText(shareUrl.toString());
        showToast("Einladungslink kopiert.");
      } catch {
        showToast(`Raumcode: ${roomCode}`);
      }
    }
  }
}

els.createRoomBtn.addEventListener("click", createRoom);
els.joinRoomBtn.addEventListener("click", joinRoom);
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
    if (cleanRoomCode(els.roomCodeInput.value).length === 6) joinRoom();
    else createRoom();
  }
});
els.leaveLobbyBtn.addEventListener("click", () => leaveRoom(true));
els.leaveGameBtn.addEventListener("click", () => leaveRoom(true));
els.leaveFinalBtn.addEventListener("click", () => leaveRoom(true));
els.shareRoomBtn.addEventListener("click", shareRoom);
els.startGameBtn.addEventListener("click", startGame);
els.playAgainBtn.addEventListener("click", returnToLobby);

els.lobbyRounds.addEventListener("change", async () => {
  if (!isHost() || !roomCode) return;
  const rounds = Number(els.lobbyRounds.value);
  try {
    await update(ref(db, `quizRooms/${roomCode}/settings`), {
      roundCount: rounds,
      questionsPerRound: QUESTIONS_PER_ROUND,
      questionSeconds: QUESTION_SECONDS
    });
  } catch (error) {
    showToast(`Rundenzahl konnte nicht geändert werden: ${friendlyError(error)}`);
  }
});

window.addEventListener("online", () => showToast("Internetverbindung wiederhergestellt."));
window.addEventListener("offline", () => showToast("Offline – Antworten können derzeit nicht synchronisiert werden."));

setInterval(() => {
  updateTimerDisplay();
  settleQuestionIfNeeded();
  advanceAfterRevealIfNeeded();
  advanceAfterRoundBreakIfNeeded();
}, 180);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Das Spiel funktioniert auch ohne Service Worker.
    });
  });
}
