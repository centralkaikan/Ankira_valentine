(() => {
  "use strict";

  // ===== Canvas / World =====
  const W = 1080, H = 1080;
  const LANES = 6;

  const PLAYER_W = 180;
  const PLAYER_H = 240;
  const PLAYER_Y = 860;

  const FIG_R = { fig1: 70, fig2: 70, fig3: 120 };

  // ===== Game Rules =====
  const START_TIME_SEC = 10;
  const PRECOUNT_START = 3;

  const SCORE_FIG1 = +100;
  const SCORE_FIG2 = +300;
  const SCORE_FIG3 = +3;

  const TIME_FIG2 = -2;
  const TIME_FIG3 = +3;

  // 出現率
  const RATE_FIG2 = 0.096;
  const RATE_FIG3 = 0.30;
  const RATE_FIG1 = 1 - (RATE_FIG2 + RATE_FIG3);

  const SPAWN_MIN_SEC = 0.35;
  const SPAWN_MAX_SEC = 0.60;

  const BASE_FALL_SPEED = 520;
  const FIG2_SPEED_MUL = 1.18;

  const ATTACH_MIN_DIST = 40;
  const ATTACH_MAX_DIST = 160;

  const UI_HIDE_AFTER_SEC = 6;
  const FIG3_COOLDOWN_SEC = 3.0;

  // 終わり演出：8倍
  const END_ANIM_SEC = 0.33;
  const END_SCALE_TARGET = 8.0;

  // ===== Effects（要件）=====
  // fig2: スコアのみ黄色ボヨン（最大1.5 / 0.5秒）
  const SCORE_BUMP_SCALE = 1.5;
  const SCORE_BUMP_DUR = 0.5;
  const SCORE_BASE_SIZE = 42;

  // fig3: 時間のみ黄色ボヨン（最大3.0 / 0.5秒）
  const TIME_BUMP_SCALE = 3.0;
  const TIME_BUMP_DUR = 0.5;
  const TIME_FONT_BASE = 120;

  // fig2: 時間は赤1秒（拡大なし）
  const FLASH_YELLOW = "rgba(255,230,90,1)";
  const FLASH_RED = "rgba(255,90,90,1)";
  const FLASH_WHITE_GLOW =
    "0 0 18px rgba(255,255,255,0.95), 0 0 36px rgba(255,255,255,0.6)";
  const TIME_RED_DUR = 1.0;

  // fig2: ダメージ姿を1秒固定
  const DAMAGE_HOLD_SEC = 1.0;

  // ラスト0.7秒：確定セット
  const FINAL_DROP_TIME = 0.7;

  // ===== Assets =====
  const IMG = {
    p_ok: [
      "./assets/img/fig0_1_1.png",
      "./assets/img/fig0_1_2.png",
      "./assets/img/fig0_1_3.png",
      "./assets/img/fig0_1_4.png",
    ],
    p_ng: [
      "./assets/img/fig0_2_1.png",
      "./assets/img/fig0_2_2.png",
      "./assets/img/fig0_2_3.png",
      "./assets/img/fig0_2_4.png",
    ],
    fig1: "./assets/img/fig1.png",
    fig2: "./assets/img/fig2.png",
    fig3: "./assets/img/fig3.png",
    bg1_1: "./assets/img/bg1_1.png",
    bg1_2: "./assets/img/bg1_2.png",
    bg1_3: "./assets/img/bg1_3.png",
    bg1_4: "./assets/img/bg1_4.png",
  };

  const STORE_KEY_TOTAL = "game02_totalScore";
  const STORE_KEY_LAST = "game02_lastScore";

  // ===== DOM =====
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const elHudTop = document.getElementById("hudTop");
  const elScore = document.getElementById("score");
  const elControls = document.getElementById("controls");

  const elPanel = document.getElementById("panel");
  const elPanelTitle = document.getElementById("panelTitle");
  const elPanelText = document.getElementById("panelText");
  const elPanelHint = document.getElementById("panelHint");

  const btnStart = document.getElementById("btnStart");
  const btnShare = document.getElementById("btnShare");
  const btnExitPanel = document.getElementById("btnExitPanel");

  const btnLeft = document.getElementById("btnLeft");
  const btnRight = document.getElementById("btnRight");
  const btnExitTop = document.getElementById("btnExitTop");

  // ===== Utils =====
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const laneX = (i) => (i + 0.5) * (W / LANES);

  function rectCircleHit(rx, ry, rw, rh, cx, cy, cr) {
    const x = clamp(cx, rx, rx + rw);
    const y = clamp(cy, ry, ry + rh);
    const dx = cx - x;
    const dy = cy - y;
    return dx * dx + dy * dy < cr * cr;
  }

  function fmtScore4(n) {
    const s = String(Math.max(0, n));
    return s.length >= 4 ? s : s.padStart(4, "0");
  }

  function loadNum(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      if (v == null) return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  }

  function saveNum(key, val) {
    try { localStorage.setItem(key, String(val)); } catch {}
  }

  function easeOutCubic(t) {
    t = clamp(t, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  // ボヨン：開始 max → ease-out で 1 に戻る
  function calcBumpScale(bumpT, dur, maxScale) {
    if (bumpT <= 0) return 1.0;
    const t = clamp(bumpT / dur, 0, 1);
    const k = 1 - easeOutCubic(t); // 1 -> 0
    return 1 + (maxScale - 1) * k;
  }

  // ===== Debug =====
  let fatalError = null;
  const safeText = (err) => {
    try { return String(err?.stack || err?.message || err); } catch { return "unknown error"; }
  };
  window.addEventListener("error", (e) => { fatalError = e.error || e.message || "window error"; });
  window.addEventListener("unhandledrejection", (e) => { fatalError = e.reason || "unhandled rejection"; });

  // ===== Images =====
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  const images = {
    p_ok: [],
    p_ng: [],
    fig1: null, fig2: null, fig3: null,
    bg1_1: null, bg1_2: null, bg1_3: null, bg1_4: null,
  };

  async function preloadImages() {
    images.p_ok = await Promise.all(IMG.p_ok.map(loadImage));
    images.p_ng = await Promise.all(IMG.p_ng.map(loadImage));
    images.fig1 = await loadImage(IMG.fig1);
    images.fig2 = await loadImage(IMG.fig2);
    images.fig3 = await loadImage(IMG.fig3);
    images.bg1_1 = await loadImage(IMG.bg1_1);
    images.bg1_2 = await loadImage(IMG.bg1_2);
    images.bg1_3 = await loadImage(IMG.bg1_3);
    images.bg1_4 = await loadImage(IMG.bg1_4);
  }

  // ===== Boot gating（スタート確実化）=====
  let assetsReady = false;

  function showLoading() {
    elPanel.classList.remove("hidden");
    elHudTop.classList.add("hidden");
    elControls.classList.add("hidden");

    elPanelTitle.textContent = "Loading...";
    elPanelText.classList.remove("countdownBig");
    elPanelText.textContent = "読み込み中だよ…";
    elPanelHint.textContent = "画像の読み込みが終わったらStartできるよ";
    btnExitPanel.style.visibility = "hidden";
  }

  // ===== State =====
  let state = "title"; // title | precount | playing | ending | result

  let score = 0;
  let totalScore = loadNum(STORE_KEY_TOTAL, 0);
  let lastScore = loadNum(STORE_KEY_LAST, 0);
  let timeLeft = START_TIME_SEC;

  let preCount = PRECOUNT_START;
  let preTimer = 0;

  let startMs = 0;

  let player = {
    lane: 2,
    x: laneX(2),
    y: PLAYER_Y,
    w: PLAYER_W,
    h: PLAYER_H,
    scale: 1.0,
    frame: 0,
    frameCount: 4,
    damageHoldT: 0,
  };

  let endTimer = 0;

  let falling = [];
  let attached = [];

  let spawnTimer = 0;
  let nextSpawn = rand(SPAWN_MIN_SEC, SPAWN_MAX_SEC);

  let uiVisible = true;
  let uiHideAt = 0;

  let fig3NextEligibleAt = 0;

  // Effects
  let scoreBumpT = 0;
  let scoreScale = 1.0;

  let timeBumpT = 0;
  let timeScale = 1.0;

  let scoreYellowT = 0;
  let timeYellowT = 0;
  let timeRedT = 0;

  // FINAL DROP
  let finalDropDone = false;

  function secondsFromStart() {
    if (state !== "playing") return 0;
    return (performance.now() - startMs) / 1000;
  }

  // ===== BG thresholds（1500 / 1800 に調整）=====
  function bgIndexByScore(s) {
    const v = Math.max(0, s);
    if (v >= 1800) return 3;   // bg1_4
    if (v >= 1500) return 2;   // bg1_3
    if (v >= 300)  return 1;   // bg1_2
    return 0;                  // bg1_1
  }

  function currentBgImage() {
    const idx = bgIndexByScore(score);
    if (idx === 0) return images.bg1_1;
    if (idx === 1) return images.bg1_2;
    if (idx === 2) return images.bg1_3;
    return images.bg1_4;
  }

  // ===== HUD =====
  function updateHUD(force = false) {
    const scoreText = `SCORE: ${fmtScore4(score)}`;
    if (force) elScore.textContent = scoreText;
    else if (elScore.textContent !== scoreText) elScore.textContent = scoreText;

    // スコアボヨン + 黄色
    elScore.style.fontSize = `${Math.round(SCORE_BASE_SIZE * scoreScale * 10) / 10}px`;
    if (scoreYellowT > 0) {
      elScore.style.color = FLASH_YELLOW;
      elScore.style.textShadow = `${FLASH_WHITE_GLOW}, 0 6px 14px rgba(0,0,0,0.55)`;
    } else {
      elScore.style.color = "rgba(255,255,255,0.98)";
      elScore.style.textShadow = "0 6px 14px rgba(0,0,0,0.55)";
    }

    if (state === "playing") {
      elControls.classList.remove("hidden");
      elHudTop.classList.remove("hidden");
      elControls.style.opacity = uiVisible ? "1" : "0";
      elControls.style.pointerEvents = uiVisible ? "auto" : "none";
    } else {
      elControls.classList.add("hidden");
      elControls.style.opacity = "0";
      elControls.style.pointerEvents = "none";
      elHudTop.classList.add("hidden");
    }
  }

  // ===== Panels =====
  function titleHtml() {
    return `クリック / Enter でスタート\n前回:${lastScore}  総得点:${totalScore}`;
  }

  function showTitle() {
    state = "title";
    elPanel.classList.remove("hidden");
    elHudTop.classList.add("hidden");

    elPanelTitle.textContent = "あんきらチョコあつめ";
    elPanelText.classList.remove("countdownBig");
    elPanelText.textContent = titleHtml();
    elPanelHint.textContent = assetsReady ? "" : "Loading…";

    btnExitPanel.style.visibility = "hidden";
    btnStart.textContent = "Start";
    btnShare.textContent = "Share";

    updateHUD(true);
  }

  function showResultPanel() {
    state = "result";

    elHudTop.classList.add("hidden");
    elPanel.classList.remove("hidden");

    elPanelTitle.textContent = "Result";
    elPanelText.classList.remove("countdownBig");
    elPanelText.textContent = `得点: ${lastScore}\n総得点: ${totalScore}`;
    elPanelHint.textContent = "";

    btnExitPanel.style.visibility = "visible";
    btnExitPanel.textContent = "もどる";
    btnStart.textContent = "Retry";
    btnShare.textContent = "Share";

    updateHUD(true);
  }

  function finalizeScore() {
    lastScore = score;
    totalScore += lastScore;
    saveNum(STORE_KEY_LAST, lastScore);
    saveNum(STORE_KEY_TOTAL, totalScore);
  }

  function endToResultWithZoom() {
    if (state !== "playing") return;

    finalizeScore();
    state = "ending";
    endTimer = 0;

    falling = [];
    spawnTimer = 0;

    elControls.style.opacity = "0";
    elHudTop.classList.add("hidden");
    elPanel.classList.add("hidden");
  }

  function resetRun() {
    score = 0;
    timeLeft = START_TIME_SEC;

    player.lane = 2;
    player.x = laneX(2);
    player.scale = 1.0;
    player.frame = 0;
    player.damageHoldT = 0;

    falling = [];
    attached = [];

    spawnTimer = 0;
    nextSpawn = rand(SPAWN_MIN_SEC, SPAWN_MAX_SEC);

    uiVisible = true;
    uiHideAt = UI_HIDE_AFTER_SEC;

    preCount = PRECOUNT_START;
    preTimer = 0;

    fig3NextEligibleAt = 0;

    scoreBumpT = 0; scoreScale = 1.0;
    timeBumpT = 0; timeScale = 1.0;
    scoreYellowT = 0;
    timeYellowT = 0;
    timeRedT = 0;

    finalDropDone = false;

    updateHUD(true);
  }

  function startPrecount() {
    if (!assetsReady) {
      showLoading();
      return;
    }
    state = "precount";
    resetRun();

    elPanel.classList.remove("hidden");
    elHudTop.classList.add("hidden");
    elPanelText.classList.add("countdownBig");

    updateHUD(true);
  }

  function startPlay() {
    state = "playing";
    startMs = performance.now();

    elPanel.classList.add("hidden");
    elHudTop.classList.remove("hidden");

    uiVisible = true;
    uiHideAt = UI_HIDE_AFTER_SEC;

    updateHUD(true);
  }

  // ===== Controls =====
  function move(d) {
    if (state !== "playing") return;

    const prevLane = player.lane;
    player.lane = clamp(player.lane + d, 0, LANES - 1);
    if (player.lane !== prevLane) {
      player.frame = (player.frame + 1) % player.frameCount;
    }
    player.x = laneX(player.lane);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!assetsReady) { showLoading(); return; }
      if (state === "title" || state === "result") startPrecount();
    }
  }, { passive: false });

  btnStart.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!assetsReady) { showLoading(); return; }
    if (state === "title" || state === "result") startPrecount();
  }, { passive: false });

  btnExitPanel.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === "result") showTitle();
  }, { passive: false });

  btnExitTop.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === "playing") endToResultWithZoom();
  }, { passive: false });

  btnLeft.addEventListener("pointerdown", (e) => { e.preventDefault(); move(-1); }, { passive: false });
  btnRight.addEventListener("pointerdown", (e) => { e.preventDefault(); move(1); }, { passive: false });

  function share() {
    const text = `あんきらチョコあつめ 得点:${lastScore} / 総得点:${totalScore}`;
    const url = location.protocol.startsWith("http") ? location.href : "";
    if (navigator.share) {
      navigator.share({ text, url }).catch(() => {});
    } else {
      window.open(
        "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text)
        + (url ? "&url=" + encodeURIComponent(url) : ""),
        "_blank", "noopener,noreferrer"
      );
    }
  }
  btnShare.addEventListener("pointerdown", (e) => { e.preventDefault(); share(); }, { passive: false });

  // ===== Spawn =====
  function pickType() {
    const t = secondsFromStart();
    const fig3Allowed = (t >= fig3NextEligibleAt);
    const r = Math.random();

    if (!fig3Allowed) {
      const sum12 = RATE_FIG1 + RATE_FIG2;
      const p2 = RATE_FIG2 / sum12;
      return (r < (1 - p2)) ? "fig1" : "fig2";
    }

    if (r < RATE_FIG1) return "fig1";
    if (r < RATE_FIG1 + RATE_FIG2) return "fig2";
    return "fig3";
  }

  function spawnOne(typeOverride = null, laneOverride = null) {
    const type = typeOverride ?? pickType();
    const rad = FIG_R[type];
    const lane = (laneOverride ?? randInt(0, LANES - 1));
    const speedMul = (type === "fig2") ? FIG2_SPEED_MUL : 1.0;

    falling.push({
      type,
      lane,
      x: laneX(lane),
      y: -rad - 10,
      vy: BASE_FALL_SPEED * speedMul,
      r: rad,
    });

    if (type === "fig3") {
      fig3NextEligibleAt = secondsFromStart() + FIG3_COOLDOWN_SEC;
    }
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function triggerFinalDropSet() {
    finalDropDone = true;
    const lanes = Array.from({ length: LANES }, (_, i) => i);
    shuffleInPlace(lanes);
    spawnOne("fig3", lanes[0]);
    spawnOne("fig2", lanes[1]);
    spawnOne("fig2", lanes[2]);
  }

  // ===== Attach =====
  function attachAroundPlayer(type) {
    const angle = rand(0, Math.PI * 2);
    const d = rand(ATTACH_MIN_DIST, ATTACH_MAX_DIST);
    attached.push({
      type,
      ox: Math.cos(angle) * d,
      oy: Math.sin(angle) * d,
      r: FIG_R[type],
    });
  }

  function removeAttachedFig1Half() {
    const fig1Count = attached.reduce((acc, a) => acc + (a && a.type === "fig1" ? 1 : 0), 0);
    const removeN = Math.floor(fig1Count / 2);
    if (removeN <= 0) return;

    let removed = 0;
    for (let i = attached.length - 1; i >= 0 && removed < removeN; i--) {
      const a = attached[i];
      if (a && a.type === "fig1") {
        attached.splice(i, 1);
        removed++;
      }
    }
  }

  // ===== Effects triggers =====
  let scoreBumpT = 0, scoreScale = 1.0;
  let timeBumpT = 0, timeScale = 1.0;
  let scoreYellowT = 0, timeYellowT = 0, timeRedT = 0;

  function bumpScoreYellow() {
    scoreBumpT = 0.0001;
    scoreYellowT = SCORE_BUMP_DUR;
  }

  function bumpTimeYellow() {
    timeBumpT = 0.0001;
    timeYellowT = TIME_BUMP_DUR;
    timeRedT = 0;
  }

  function flashTimeRedOnly() {
    timeRedT = TIME_RED_DUR;
    timeYellowT = 0;
  }

  // ===== Pickup =====
  function onPickup(type) {
    if (type === "fig1") {
      score += SCORE_FIG1;
      attachAroundPlayer("fig1");
      updateHUD(true);
      return;
    }

    if (type === "fig2") {
      score += SCORE_FIG2;
      timeLeft += TIME_FIG2;

      bumpScoreYellow();
      flashTimeRedOnly();

      player.damageHoldT = DAMAGE_HOLD_SEC;
      removeAttachedFig1Half();

      if (timeLeft <= 0) { timeLeft = 0; endToResultWithZoom(); return; }
      updateHUD(true);
      return;
    }

    if (type === "fig3") {
      score += SCORE_FIG3;
      timeLeft += TIME_FIG3;

      attachAroundPlayer("fig3");
      bumpTimeYellow();

      if (timeLeft <= 0) { timeLeft = 0; endToResultWithZoom(); return; }
      updateHUD(true);
      return;
    }
  }

  // ===== Collision =====
  function playerRect() {
    return {
      rx: player.x - player.w / 2,
      ry: player.y - player.h / 2,
      rw: player.w,
      rh: player.h,
    };
  }

  function hitPlayer(o) {
    if (!o) return false;
    if (o.lane !== player.lane) return false;
    const r = playerRect();
    return rectCircleHit(r.rx, r.ry, r.rw, r.rh, o.x, o.y, o.r);
  }

  function hitAttached(o) {
    if (!o) return false;
    for (const a of attached) {
      if (!a) continue;
      const ax = player.x + a.ox;
      const ay = player.y + a.oy;
      const rr = o.r + a.r;
      const dx = o.x - ax, dy = o.y - ay;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }

  // ===== Robust cleanup（★undefined混入対策の本体）=====
  function sweepUndefined() {
    // たまに混ざる undefined / null を回収してクラッシュを防ぐ
    if (falling.length) {
      let dirty = false;
      for (let i = 0; i < falling.length; i++) { if (!falling[i]) { dirty = true; break; } }
      if (dirty) falling = falling.filter(Boolean);
    }
    if (attached.length) {
      let dirty = false;
      for (let i = 0; i < attached.length; i++) { if (!attached[i]) { dirty = true; break; } }
      if (dirty) attached = attached.filter(Boolean);
    }
  }

  // ===== Update Effects =====
  function updateEffects(dt) {
    if (player.damageHoldT > 0) player.damageHoldT = Math.max(0, player.damageHoldT - dt);

    if (scoreYellowT > 0) scoreYellowT = Math.max(0, scoreYellowT - dt);
    if (timeYellowT > 0) timeYellowT = Math.max(0, timeYellowT - dt);
    if (timeRedT > 0) timeRedT = Math.max(0, timeRedT - dt);

    if (scoreBumpT > 0) {
      scoreBumpT += dt;
      if (scoreBumpT >= SCORE_BUMP_DUR) scoreBumpT = 0;
    }
    scoreScale = calcBumpScale(scoreBumpT, SCORE_BUMP_DUR, SCORE_BUMP_SCALE);

    if (timeBumpT > 0) {
      timeBumpT += dt;
      if (timeBumpT >= TIME_BUMP_DUR) timeBumpT = 0;
    }
    timeScale = calcBumpScale(timeBumpT, TIME_BUMP_DUR, TIME_BUMP_SCALE);
  }

  // ===== Draw =====
  function drawBackground() {
    const bg = currentBgImage();
    if (bg) ctx.drawImage(bg, 0, 0, W, H);
    else {
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function drawTimeBig() {
    const text = Math.max(0, timeLeft).toFixed(1);

    // 赤の時は拡大しない
    const useScale = (timeYellowT > 0) ? timeScale : 1.0;
    const fontPx = Math.round(TIME_FONT_BASE * useScale);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `900 ${fontPx}px system-ui, sans-serif`;

    if (timeYellowT > 0) {
      ctx.shadowColor = "rgba(255,255,255,0.85)";
      ctx.shadowBlur = 24;
      ctx.fillStyle = FLASH_YELLOW;
    } else if (timeRedT > 0) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = FLASH_RED;
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.97)";
    }

    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(text, W / 2, 18);
    ctx.fillText(text, W / 2, 18);

    ctx.restore();
  }

  function drawFalling() {
    for (const o of falling) {
      if (!o) continue;
      const size = o.r * 2;

      if (o.type === "fig1" && images.fig1) { ctx.drawImage(images.fig1, o.x - size/2, o.y - size/2, size, size); continue; }
      if (o.type === "fig2" && images.fig2) { ctx.drawImage(images.fig2, o.x - size/2, o.y - size/2, size, size); continue; }
      if (o.type === "fig3" && images.fig3) { ctx.drawImage(images.fig3, o.x - size/2, o.y - size/2, size, size); continue; }

      ctx.save();
      ctx.fillStyle = "rgba(220,220,220,0.95)";
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawAttached() {
    for (const a of attached) {
      if (!a) continue;
      const ax = player.x + a.ox;
      const ay = player.y + a.oy;
      const size = a.r * 2;

      if (a.type === "fig1" && images.fig1) { ctx.drawImage(images.fig1, ax - size/2, ay - size/2, size, size); continue; }
      if (a.type === "fig3" && images.fig3) { ctx.drawImage(images.fig3, ax - size/2, ay - size/2, size, size); continue; }

      ctx.save();
      ctx.fillStyle = "rgba(240,240,255,0.85)";
      ctx.beginPath();
      ctx.arc(ax, ay, a.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayer() {
    const useDamaged = player.damageHoldT > 0;
    const arr = useDamaged ? images.p_ng : images.p_ok;
    const img = (arr && arr.length) ? arr[player.frame % arr.length] : null;

    const drawW = player.w * player.scale;
    const drawH = player.h * player.scale;
    const rx = player.x - drawW / 2;
    const ry = player.y - drawH / 2;

    if (img) ctx.drawImage(img, rx, ry, drawW, drawH);
    else {
      ctx.save();
      ctx.fillStyle = useDamaged ? "rgba(255,122,167,0.95)" : "rgba(126,231,135,0.95)";
      ctx.fillRect(rx, ry, drawW, drawH);
      ctx.restore();
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawFalling();
    drawAttached();
    drawPlayer();
    drawTimeBig();
  }

  // ===== Loop =====
  let last = performance.now();

  function tick(now) {
    try {
      if (fatalError) {
        state = "result";
        elPanel.classList.remove("hidden");
        elPanelTitle.textContent = "ERROR";
        elPanelText.textContent = "ゲームが停止したよ。";
        elPanelHint.textContent = safeText(fatalError).slice(0, 800);
        elHudTop.classList.add("hidden");
        elControls.style.opacity = "0";
        render();
        requestAnimationFrame(tick);
        return;
      }

      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      // ★毎フレーム掃除（undefined混入で落ちるのを防ぐ）
      sweepUndefined();

      if (state === "precount") {
        preTimer += dt;
        if (preTimer >= 1.0) {
          preTimer = 0;
          preCount--;
        }

        elPanelTitle.textContent = "";
        elPanelText.classList.add("countdownBig");

        if (preCount >= 1) elPanelText.textContent = String(preCount);
        else if (preCount === 0) elPanelText.textContent = "GO!";
        else {
          elPanelText.classList.remove("countdownBig");
          startPlay();
        }
      }

      if (state === "playing") {
        timeLeft -= dt;
        if (timeLeft <= 0) {
          timeLeft = 0;
          endToResultWithZoom();
        }

        // ★残り0.7秒で確定セット（1回だけ）
        if (!finalDropDone && timeLeft <= FINAL_DROP_TIME && timeLeft > 0) {
          triggerFinalDropSet();
        }

        const t = secondsFromStart();
        if (t >= uiHideAt) uiVisible = false;

        spawnTimer += dt;
        if (spawnTimer >= nextSpawn) {
          spawnTimer = 0;
          nextSpawn = rand(SPAWN_MIN_SEC, SPAWN_MAX_SEC);
          spawnOne();
        }

        for (let i = falling.length - 1; i >= 0; i--) {
          const o = falling[i];
          if (!o) { falling.splice(i, 1); continue; } // ★ガード
          o.y += o.vy * dt;

          if (hitPlayer(o) || (attached.length > 0 && hitAttached(o))) {
            onPickup(o.type);
            falling.splice(i, 1);
            continue;
          }
          if (o.y > H + o.r + 20) falling.splice(i, 1);
        }
      }

      if (state === "ending") {
        endTimer += dt;
        const p = clamp(endTimer / END_ANIM_SEC, 0, 1);
        player.scale = 1.0 + (END_SCALE_TARGET - 1.0) * p;

        if (p >= 1) {
          player.scale = END_SCALE_TARGET;
          showResultPanel();
        }
      }

      updateEffects(dt);
      updateHUD(false);
      render();
      requestAnimationFrame(tick);
    } catch (err) {
      fatalError = err;
      requestAnimationFrame(tick);
    }
  }

  // ===== Boot =====
  showLoading();
  preloadImages().then(() => {
    assetsReady = true;
    showTitle();
    requestAnimationFrame(tick);
  }).catch((e) => {
    fatalError = e;
    requestAnimationFrame(tick);
  });
})();
