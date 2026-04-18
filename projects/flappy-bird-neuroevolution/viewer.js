(() => {
  let canvas = document.getElementById("simCanvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "simCanvas";
    const shell = document.querySelector(".viewer-shell") || document.body;
    shell.prepend(canvas);
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const els = {
    playPauseBtn: document.getElementById("playPauseBtn"),
    prevGenBtn: document.getElementById("prevGenBtn"),
    nextGenBtn: document.getElementById("nextGenBtn"),
    genIndicator: document.getElementById("genIndicator"),
    speed1x: document.getElementById("speed1x"),
    speed2x: document.getElementById("speed2x"),
    speed4x: document.getElementById("speed4x"),
    status: document.getElementById("status"),
    errorMessage: document.getElementById("errorMessage"),
    statGeneration: document.getElementById("statGeneration"),
    statAlive: document.getElementById("statAlive"),
    statBestGen: document.getElementById("statBestGen"),
    statBestAll: document.getElementById("statBestAll"),
  };
  const brainCtx = els.brainCanvas?.getContext("2d");

  const state = {
    replay: null,
    generations: [],
    traces: [],
    generationMessage: "",
    generationIndex: 0,
    playT: 0,
    playing: false,
    autoplayEnabled: true,
    simSpeedMultiplier: 1,
    showTrails: false,
    showDebug: false,
    showBrain: false,
    stepAccumulator: 0,
    lastTimestamp: 0,
    birds: [],
    renderEntries: [],
    pipes: [],
    pipeFrames: [],
    pipeFramesLen: 0,
    tracesMaxLen: 0,
    championFramesLen: 0,
    aliveCountAll: 0,
    trailHistory: [],
    logicalWidth: 500,
    logicalHeight: 430,
    dpr: 1,
    skyGradient: null,
    vignetteGradient: null,
    groundGradient: null,
    clouds: [],
    generationCache: {},
    generationLoadToken: 0,
    generationLoading: false,
    generationEndOverlay: null,
  };

  const setStatus = (text) => { if (els.status) els.status.textContent = text; };
  const setError = (text) => { if (els.errorMessage) els.errorMessage.textContent = text; };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function sizeCanvas() {
    const cfg = state.replay?.config || {};
    state.logicalWidth = Number(cfg.world_width || state.logicalWidth || 500);
    state.logicalHeight = Number(cfg.world_height || state.logicalHeight || 800);
    state.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(state.logicalWidth * state.dpr);
    canvas.height = Math.round(state.logicalHeight * state.dpr);
    canvas.style.aspectRatio = `${state.logicalWidth} / ${state.logicalHeight}`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.skyGradient = null;
    state.vignetteGradient = null;
    state.groundGradient = null;
    initialiseClouds();
  }

  function initialiseClouds() {
    const cloudCount = Math.max(3, Math.min(7, Math.round(state.logicalWidth / 140)));
    state.clouds = new Array(cloudCount);
    for (let i = 0; i < cloudCount; i += 1) {
      const scale = 0.7 + ((i % 4) * 0.16);
      state.clouds[i] = {
        baseX: (i / cloudCount) * state.logicalWidth,
        y: 80 + ((i * 71) % Math.max(140, state.logicalHeight * 0.35)),
        width: 58 * scale,
        height: 24 * scale,
        speed: 0.14 + (i % 5) * 0.035,
        alpha: 0.11 + (i % 4) * 0.03,
      };
    }
  }

  function normaliseReplayData(raw) {
    const generations = Array.isArray(raw?.generations) ? raw.generations : [];
    return {
      ...raw,
      generations: generations.map((gen, idx) => {
        const genomes = Array.isArray(gen?.genomes) ? gen.genomes : [];
        return {
          ...gen,
          generation: Number(gen?.generation ?? idx),
          best_pipes_passed: Number(gen?.best_pipes_passed ?? 0),
          genomes: genomes.map((g, gIdx) => ({
            ...g,
            rank: Number(g?.rank ?? (gIdx + 1)),
            pipes_passed: Number(g?.pipes_passed ?? 0),
            frames: Array.isArray(g?.frames) ? g.frames : [],
          })),
        };
      }),
    };
  }

  async function fetchJsonWithDiagnostics(path) {
    const attemptedUrl = new URL(path, window.location.href).href;
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}\nURL: ${attemptedUrl}`);
    }
    const raw = await response.text();
    try {
      return JSON.parse(raw);
    } catch (error) {
      const contentLength = response.headers.get("content-length") || "unknown";
      const start = raw.slice(0, 120);
      const end = raw.slice(-120);
      throw new Error(
        [
          `Failed to parse JSON: ${error?.message || error}`,
          `URL: ${attemptedUrl}`,
          `Content-Length: ${contentLength}`,
          `Received chars: ${raw.length}`,
          `Starts with: ${JSON.stringify(start)}`,
          `Ends with: ${JSON.stringify(end)}`,
        ].join("\n"),
      );
    }
  }

  async function resolveGeneration(index) {
    if (state.generationCache[index]) return state.generationCache[index];
    const summary = state.generations?.[index];
    const filePath = summary?.file;
    if (!filePath) return summary || null;

    const generation = normaliseReplayData({ generations: [await fetchJsonWithDiagnostics(`./${filePath}?v=${Date.now()}`)] }).generations[0];
    state.generationCache[index] = generation;
    return generation;
  }

  function getGeneration() {
    return state.generationCache[state.generationIndex] || state.generations?.[state.generationIndex] || null;
  }

  function buildTraces(generation) {
    const genomes = Array.isArray(generation?.genomes) ? generation.genomes : [];
    return genomes.map((genome, idx) => ({
      rank: Number(genome?.rank ?? (idx + 1)),
      fitness: Number(genome?.fitness ?? 0),
      pipes_passed: Number(genome?.pipes_passed ?? 0),
      steps: Number(genome?.steps ?? 0),
      frames: Array.isArray(genome?.frames) ? genome.frames : [],
    })).sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999));
  }

  function getTraceByRank(rank) { return state.traces.find((t) => Number(t.rank) === Number(rank)) || state.traces[0] || null; }

  function getLongestFrameCount() {
    return Math.max(0, ...state.traces.map((t) => (t.frames || []).length));
  }

  function parsePipeFrame(rawPipes, cfg, worldHeight) {
    if (!Array.isArray(rawPipes)) return [];
    return rawPipes.map((pipe) => {
      const gapH = Number(pipe.gap_h || cfg.pipe_gap || 170);
      const halfGap = gapH / 2;
      const gapY = Number(pipe.gap_y || worldHeight / 2);
      return {
        x: Number(pipe.x || 0),
        width: Number(pipe.width || cfg.pipe_width || 70),
        top: gapY - halfGap,
        bottom: gapY + halfGap,
      };
    });
  }

  function buildPipeTimeline() {
    const cfg = state.replay?.config || {};
    const worldHeight = Number(cfg.world_height || state.logicalHeight);
    const champion = getTraceByRank(1) || state.traces[0] || null;
    const frames = champion?.frames || [];
    const timeline = new Array(frames.length);
    let lastKnown = [];
    for (let t = 0; t < frames.length; t += 1) {
      const framePipes = frames[t]?.pipes;
      if (Array.isArray(framePipes)) {
        lastKnown = parsePipeFrame(framePipes, cfg, worldHeight);
      }
      timeline[t] = lastKnown;
    }
    state.pipeFrames = timeline;
    state.pipeFramesLen = timeline.length;
    state.championFramesLen = frames.length;
    state.tracesMaxLen = getLongestFrameCount();
  }

  function getAliveCountAt(playT) {
    let alive = 0;
    for (const trace of state.traces) {
      const frames = trace.frames || [];
      if (playT >= frames.length) continue;
      if (Number(frames[playT]?.alive ?? 0) !== 0) alive += 1;
    }
    return alive;
  }

  function applyFrame(playT) {
    const generation = getGeneration();
    if (!generation) return;

    const cfg = state.replay?.config || {};
    const worldHeight = Number(cfg.world_height || state.logicalHeight);
    const worldWidth = Number(cfg.world_width || state.logicalWidth);
    const shown = state.traces;

    const generationLabel = Number(generation?.generation ?? state.generationIndex);
    if (state.traces.length === 0) {
      state.generationMessage = `No frames found in generation ${generationLabel}. Expected generations[g].genomes[].frames[]`;
    } else {
      state.generationMessage = "";
    }

    state.playT = Math.max(0, Math.trunc(playT || 0));
    state.renderEntries = shown.map((trace, idx) => {
      const frames = trace.frames || [];
      if (state.playT >= frames.length) return null;
      const frame = frames[state.playT];
      if (!frame) return null;
      const alive = Boolean(frame.alive ?? 0);
      const x = clamp(Number(frame.x ?? cfg.bird_x ?? 80), 0, worldWidth);
      const y = clamp(Number(frame.y ?? worldHeight / 2), 0, worldHeight);

      if (state.showTrails) {
        const trail = state.trailHistory[idx] || (state.trailHistory[idx] = []);
        if (alive) {
          trail.push({ x, y });
          if (trail.length > 120) trail.shift();
        }
      }

      return {
        rank: Number(trace.rank || 1),
        x,
        y,
        velocity: Number(frame.vy ?? 0),
        alive,
        flap: Boolean(frame.flap ?? 0),
        out: frame.out,
        pipesPassed: Number(frame.pipes_passed ?? 0),
        color: trace.rank === 1 ? 'rgba(200,64,26,0.9)' : `rgba(${180 - idx * 3}, ${180 - idx * 3}, ${180 - idx * 3}, 0.55)`,
      };
    }).filter(Boolean);

    state.birds = state.renderEntries.filter((bird) => bird.alive);
    state.aliveCountAll = getAliveCountAt(state.playT);

    const pipeIdx = state.pipeFramesLen > 0 ? Math.min(state.playT, state.pipeFramesLen - 1) : 0;
    state.pipes = state.pipeFrames[pipeIdx] || [];

    if (!state.showTrails) {
      state.trailHistory.length = 0;
    }
  }

  async function loadGeneration(index) {
    const total = state.generations?.length || 0;
    if (!total) return;
    const targetIndex = clamp(index, 0, total - 1);
    const loadToken = ++state.generationLoadToken;
    state.generationLoading = true;
    let generation = null;
    try {
      generation = await resolveGeneration(targetIndex);
    } catch (error) {
      setStatus("Failed to load generation replay.");
      setError(String(error?.message || error));
      return;
    } finally {
      if (loadToken === state.generationLoadToken) state.generationLoading = false;
    }
    if (loadToken !== state.generationLoadToken) return;
    if (!Array.isArray(generation?.genomes)) {
      setStatus("Failed to load generation replay.");
      setError(`Generation ${targetIndex} missing genomes[] payload. Please regenerate training replay.`);
      return;
    }
    state.generationIndex = targetIndex;
    state.playT = 0;
    state.traces = buildTraces(generation);
    buildPipeTimeline();
    if (els.genIndicator) els.genIndicator.textContent = `${String(state.generationIndex + 1).padStart(2, '0')} / ${String(state.generations.length).padStart(2, '0')}`;
    applyFrame(0);
  }

  function drawBackground() {
    const groundHeight = Math.max(44, state.logicalHeight * 0.085);
    const horizonY = state.logicalHeight - groundHeight;

    if (!state.skyGradient) {
      const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
      sky.addColorStop(0, "#0a1628");
      sky.addColorStop(0.62, "#0f2040");
      sky.addColorStop(1, "#162b52");
      state.skyGradient = sky;
    }
    if (!state.groundGradient) {
      const ground = ctx.createLinearGradient(0, horizonY, 0, state.logicalHeight);
      ground.addColorStop(0, "#1a1208");
      ground.addColorStop(0.35, "#130e06");
      ground.addColorStop(1, "#0d0904");
      state.groundGradient = ground;
    }
    if (!state.vignetteGradient) {
      const v = ctx.createRadialGradient(
        state.logicalWidth * 0.5,
        state.logicalHeight * 0.35,
        Math.min(state.logicalWidth, state.logicalHeight) * 0.2,
        state.logicalWidth * 0.5,
        state.logicalHeight * 0.5,
        Math.max(state.logicalWidth, state.logicalHeight) * 0.9,
      );
      v.addColorStop(0, "rgba(5, 18, 35, 0)");
      v.addColorStop(1, "rgba(5, 18, 35, 0.24)");
      state.vignetteGradient = v;
    }
    ctx.fillStyle = state.skyGradient;
    ctx.fillRect(0, 0, state.logicalWidth, horizonY);

    const cloudScroll = state.playT;
    for (const cloud of state.clouds) {
      const cloudCycleWidth = state.logicalWidth + cloud.width * 2;
      const x = (cloud.baseX - cloudScroll * cloud.speed) % cloudCycleWidth;
      const drawX = x < -cloud.width * 1.3 ? x + cloudCycleWidth : x;
      ctx.fillStyle = `rgba(255,255,255,${cloud.alpha})`;
      ctx.beginPath();
      ctx.ellipse(drawX, cloud.y, cloud.width * 0.42, cloud.height * 0.52, 0, 0, Math.PI * 2);
      ctx.ellipse(drawX + cloud.width * 0.23, cloud.y - cloud.height * 0.2, cloud.width * 0.34, cloud.height * 0.48, 0, 0, Math.PI * 2);
      ctx.ellipse(drawX - cloud.width * 0.2, cloud.y - cloud.height * 0.15, cloud.width * 0.3, cloud.height * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = state.groundGradient;
    ctx.fillRect(0, horizonY, state.logicalWidth, groundHeight);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0, horizonY, state.logicalWidth, 4);
    ctx.fillStyle = "rgba(74, 63, 28, 0.22)";
    ctx.fillRect(0, state.logicalHeight - 3, state.logicalWidth, 3);

    ctx.fillStyle = state.vignetteGradient;
    ctx.fillRect(0, 0, state.logicalWidth, state.logicalHeight);
  }

  function drawPipe(pipe) {
    const lipHeight = Math.max(6, pipe.width * 0.14);
    const border = Math.max(2, pipe.width * 0.08);
    const pipeFill = "#1e3a2f";
    const pipeBorder = "#142b22";

    ctx.save();
    ctx.shadowColor = "rgba(12, 28, 10, 0.25)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = pipeFill;
    ctx.fillRect(pipe.x, 0, pipe.width, pipe.top);
    ctx.fillRect(pipe.x, pipe.bottom, pipe.width, state.logicalHeight - pipe.bottom);
    ctx.strokeStyle = pipeBorder;
    ctx.lineWidth = border;
    ctx.strokeRect(pipe.x + border * 0.5, 0, pipe.width - border, pipe.top);
    ctx.strokeRect(pipe.x + border * 0.5, pipe.bottom, pipe.width - border, state.logicalHeight - pipe.bottom);
    ctx.restore();

    ctx.fillStyle = "#2a4f3c";
    ctx.fillRect(pipe.x - 2, pipe.top - lipHeight, pipe.width + 4, lipHeight);
    ctx.fillRect(pipe.x - 2, pipe.bottom, pipe.width + 4, lipHeight);
    ctx.strokeStyle = pipeBorder;
    ctx.lineWidth = Math.max(1.5, border * 0.8);
    ctx.strokeRect(pipe.x - 2, pipe.top - lipHeight, pipe.width + 4, lipHeight);
    ctx.strokeRect(pipe.x - 2, pipe.bottom, pipe.width + 4, lipHeight);
  }

  function drawBird(bird) {
    const angle = clamp(bird.velocity * 0.11, -0.65, 0.75);
    const wingLift = bird.flap ? Math.sin((state.playT + bird.rank * 1.7) * 0.5) * 2.3 : -1.2;
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(angle);
    ctx.shadowColor = "rgba(12, 20, 33, 0.26)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(-9, -8);
    ctx.lineTo(-11, 7);
    ctx.closePath();
    ctx.fillStyle = bird.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "rgba(220,220,210,0.85)";
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(17, -1.5);
    ctx.lineTo(17, 1.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.24)";
    ctx.beginPath();
    ctx.moveTo(-2.8, -4.8);
    ctx.lineTo(6.2, -1.2);
    ctx.lineTo(-2.8, 1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(8, 17, 30, 0.42)";
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-10, -6 - wingLift);
    ctx.lineTo(-7.4, 1.2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(6, -2, 1.8, 0, Math.PI * 2);
    ctx.fill();

    if (bird.rank === 1) {
      ctx.strokeStyle = "#c8401a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRoundedPanel(x, y, w, h, r) {
    const radius = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function updateStats() {
    const generation = getGeneration();
    const genNum = Number(generation?.generation ?? state.generationIndex);
    const aliveCount = state.aliveCountAll;
    const champion = getTraceByRank(1);
    const championEndFrame = (champion?.frames || [])[Math.max(0, (champion?.frames || []).length - 1)] || {};
    const bestGen = Number(championEndFrame.pipes_passed ?? generation?.best_pipes_passed ?? champion?.pipes_passed ?? 0);
    const championFrame = (champion?.frames || [])[Math.min(state.playT, Math.max(0, (champion?.frames || []).length - 1))] || {};

    if (els.statGeneration) els.statGeneration.textContent = String(genNum + 1);
    if (els.statAlive) els.statAlive.textContent = String(aliveCount);
    if (els.statBestGen) els.statBestGen.textContent = String(bestGen);
    if (els.statBestAll) els.statBestAll.textContent = String(Number(championFrame.pipes_passed ?? champion?.pipes_passed ?? 0));
  }

  function drawBrain() {
    if (!state.showBrain || !els.brainPanel) return;
    const champ = getTraceByRank(1);
    const frame = (champ?.frames || [])[Math.min(state.playT, Math.max(0, (champ?.frames || []).length - 1))] || {};
    const outVal = frame.out;

    if (els.brainInputs) els.brainInputs.textContent = "Recorded frame data only";
    if (outVal === undefined || outVal === null) {
      if (els.brainOutput) els.brainOutput.textContent = "(not recorded)";
      if (els.brainDecision) els.brainDecision.textContent = "(not recorded)";
    } else {
      const num = Number(outVal);
      if (els.brainOutput) els.brainOutput.textContent = Number.isFinite(num) ? num.toFixed(3) : String(outVal);
      if (els.brainDecision) els.brainDecision.textContent = num >= 0.5 ? "flap (>=0.5)" : "no flap (<0.5)";
    }
    if (els.brainFlapState) els.brainFlapState.textContent = frame.flap ? "on" : "off";
    if (brainCtx && els.brainCanvas) {
      brainCtx.clearRect(0, 0, els.brainCanvas.width, els.brainCanvas.height);
      brainCtx.fillStyle = "#94a3b8";
      brainCtx.font = "14px monospace";
      brainCtx.fillText("Brain graph unavailable in replay-only mode", 12, 30);
    }
  }

  function render() {
    if (!state.replay) return;
    drawBackground();
    state.pipes.forEach(drawPipe);
    state.renderEntries.forEach((entry, i) => {
      const trail = state.trailHistory[i] || [];
      if (state.showTrails && trail.length > 1) {
        ctx.strokeStyle = entry.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        trail.forEach((p, idx) => (idx ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
    });
    state.birds.forEach((bird) => drawBird(bird));

    if (state.generationMessage) {
      ctx.fillStyle = "rgba(17,24,39,0.84)";
      drawRoundedPanel(18, state.logicalHeight - 80, state.logicalWidth - 36, 56, 12);
      ctx.fill();
      ctx.fillStyle = "#fef3c7";
      ctx.font = "14px sans-serif";
      ctx.fillText(state.generationMessage, 28, state.logicalHeight - 46);
    }

    if (!state.playing && !state.generationEndOverlay && state.replay) {
      const panelW = 200, panelH = 80;
      const panelX = (state.logicalWidth - panelW) / 2;
      const panelY = (state.logicalHeight - panelH) / 2;
      ctx.fillStyle = "rgba(8, 18, 36, 0.88)";
      drawRoundedPanel(panelX, panelY, panelW, panelH, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
      ctx.lineWidth = 1;
      drawRoundedPanel(panelX, panelY, panelW, panelH, 10);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText("▶", state.logicalWidth / 2, panelY + 36);
      ctx.fillStyle = "#64748b";
      ctx.font = "11px sans-serif";
      ctx.letterSpacing = "0.1em";
      ctx.fillText("PRESS PLAY", state.logicalWidth / 2, panelY + 62);
      ctx.letterSpacing = "0";
      ctx.textAlign = "left";
    }

    if (state.generationEndOverlay) {
      const { generationNum, bestPipes } = state.generationEndOverlay;
      const panelW = 260, panelH = 86;
      const panelX = (state.logicalWidth - panelW) / 2;
      const panelY = (state.logicalHeight - panelH) / 2;
      ctx.fillStyle = "rgba(8, 18, 36, 0.92)";
      drawRoundedPanel(panelX, panelY, panelW, panelH, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
      ctx.lineWidth = 1;
      drawRoundedPanel(panelX, panelY, panelW, panelH, 10);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = "#64748b";
      ctx.font = "11px sans-serif";
      ctx.letterSpacing = "0.1em";
      ctx.fillText(`GENERATION ${generationNum} COMPLETE`, state.logicalWidth / 2, panelY + 30);
      ctx.letterSpacing = "0";
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(`${bestPipes} pipe${bestPipes === 1 ? "" : "s"}`, state.logicalWidth / 2, panelY + 66);
      ctx.textAlign = "left";
    }

    updateStats();
    drawBrain();
  }

  function stepReplay() {
    if (!getGeneration() || state.generationLoading || state.generationEndOverlay) return;

    const finishGeneration = () => {
      if (state.playing && state.autoplayEnabled && state.generationIndex < (state.generations.length - 1)) {
        const generation = getGeneration();
        const genNum = Number(generation?.generation ?? state.generationIndex);
        const champion = getTraceByRank(1);
        const championEndFrame = (champion?.frames || [])[Math.max(0, (champion?.frames || []).length - 1)] || {};
        const bestPipes = Number(championEndFrame.pipes_passed ?? generation?.best_pipes_passed ?? champion?.pipes_passed ?? 0);
        state.generationEndOverlay = { generationNum: genNum, bestPipes, endTime: Date.now() + Math.round(900 / state.simSpeedMultiplier) };
      } else {
        const lastFrameT = Math.max(0, state.tracesMaxLen - 1);
        applyFrame(lastFrameT);
      }
    };

    if (state.playT >= state.tracesMaxLen - 1) {
      finishGeneration();
      return;
    }

    applyFrame(state.playT + 1);
    if (state.playT >= state.tracesMaxLen - 1) {
      finishGeneration();
    }
  }

  function animate(ts) {
    if (!state.lastTimestamp) state.lastTimestamp = ts;
    const deltaMs = ts - state.lastTimestamp;
    state.lastTimestamp = ts;

    if (state.generationEndOverlay && Date.now() >= state.generationEndOverlay.endTime) {
      state.generationEndOverlay = null;
      void loadGeneration(state.generationIndex + 1);
    }

    if (state.replay && state.playing) {
      state.stepAccumulator += ((deltaMs / 1000) * 60) * state.simSpeedMultiplier;
      while (state.stepAccumulator >= 1) {
        state.stepAccumulator -= 1;
        stepReplay();
      }
    }

    render();
    requestAnimationFrame(animate);
  }

  function togglePlayPause() {
    state.playing = !state.playing;
    if (els.playPauseBtn) els.playPauseBtn.textContent = state.playing ? "Pause" : "Play";
  }

  function attachControls() {
    els.playPauseBtn?.addEventListener("click", togglePlayPause);
    canvas.addEventListener("click", () => { if (state.replay) togglePlayPause(); });
    canvas.style.cursor = "pointer";
    els.prevGenBtn?.addEventListener("click", () => { void loadGeneration(state.generationIndex - 1); });
    els.nextGenBtn?.addEventListener("click", () => { void loadGeneration(state.generationIndex + 1); });
    const setSpeed = (multiplier) => {
      state.simSpeedMultiplier = multiplier;
      [els.speed1x, els.speed2x, els.speed4x].forEach((btn) => btn?.classList.remove("active"));
      if (multiplier === 1) els.speed1x?.classList.add("active");
      else if (multiplier === 2) els.speed2x?.classList.add("active");
      else if (multiplier === 4) els.speed4x?.classList.add("active");
    };
    els.speed1x?.addEventListener("click", () => setSpeed(1));
    els.speed2x?.addEventListener("click", () => setSpeed(2));
    els.speed4x?.addEventListener("click", () => setSpeed(4));
    els.debugToggle?.addEventListener("change", (e) => { state.showDebug = Boolean(e.target.checked); });
    els.showBrainToggle?.addEventListener("change", (e) => {
      state.showBrain = Boolean(e.target.checked);
      if (els.brainPanel) els.brainPanel.hidden = !state.showBrain;
    });
  }

  async function fetchReplay() {
    const path = `./training_replay.json?v=${Date.now()}`;
    const attemptedUrl = new URL(path, window.location.href).href;
    try {
      const data = await fetchJsonWithDiagnostics(path);
      const normalised = normaliseReplayData(data);
      if (!Array.isArray(normalised.generations) || normalised.generations.length === 0) {
        throw new Error("training_replay.json loaded but has 0 generations.");
      }
      const hasShards = Array.isArray(normalised.generation_files) && normalised.generation_files.length > 0;
      const invalidGeneration = normalised.generations.find((generation) => !Array.isArray(generation.genomes) && !generation.file);
      if (!hasShards && invalidGeneration) {
        throw new Error("Invalid schema: expected generations[].genomes[].frames[].");
      }
      return normalised;
    } catch (error) {
      const command = "python main.py --record-training-replay --replay-top-k 30";
      setStatus("Failed to load training replay.");
      setError([
        String(error.message || error),
        `URL: ${attemptedUrl}`,
        "How to generate:",
        command,
        "Expected file at: web/training_replay.json",
      ].join("\n"));
      throw error;
    }
  }

  function drawLoading() {
    ctx.fillStyle = "#0a1628";
    ctx.fillRect(0, 0, state.logicalWidth, state.logicalHeight);
    ctx.textAlign = "center";
    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
    ctx.letterSpacing = "0.1em";
    ctx.fillText("LOADING", state.logicalWidth / 2, state.logicalHeight / 2);
    ctx.letterSpacing = "0";
    ctx.textAlign = "left";
  }

  async function init() {
    attachControls();
    sizeCanvas();
    drawLoading();
    window.addEventListener("resize", sizeCanvas);

    try {
      const data = await fetchReplay();
      state.replay = data;
      state.generations = Array.isArray(data.generations) ? data.generations : [];
      state.generationCache = {};
      sizeCanvas();
      if (els.genIndicator) els.genIndicator.textContent = `— / ${String(state.generations.length).padStart(2, '0')}`;
      setError("");
      await loadGeneration(0);
      requestAnimationFrame(animate);
    } catch (error) {
      setStatus("Failed to initialise training replay.");
      setError(String(error?.message || error));
    }
  }

  init();
})();
