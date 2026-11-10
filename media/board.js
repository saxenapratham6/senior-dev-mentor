// The panda's board. The panda stands on a floor under the diagram, walks to
// whatever the current step is about, and says the step in its bubble.
(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const sprites = document.body.dataset.sprites;
  const panda = $("panda");
  const bubble = $("bubble");
  const floor = $("floor");
  const PANDA_W = 72;
  let pandaX = 0;
  let walkTimer = null;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  /** Escaped text with `inline code` shown as code. */
  const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function show(view) {
    for (const v of ["sceneView", "examplesView", "loadingView", "summaryView", "roadmapView"]) $(v).hidden = v !== view;
    if (view !== "sceneView") $("counter").textContent = "";
  }

  function pose(name) {
    panda.src = `${sprites}/${name}.svg`;
  }

  // ------------------------------------------------------------ walking on the floor

  function walkTo(x) {
    const max = Math.max(0, floor.clientWidth - PANDA_W);
    const target = Math.max(0, Math.min(max, x - PANDA_W / 2));
    const dist = Math.abs(target - pandaX);
    clearInterval(walkTimer);
    if (dist < 4) return placeBubble();
    const ms = Math.min(900, 250 + dist * 2.5);
    panda.style.transitionDuration = `${ms}ms`;
    panda.classList.toggle("facing-left", target < pandaX);
    pandaX = target;
    panda.style.left = `${pandaX}px`;
    let frame = 0;
    walkTimer = setInterval(() => pose(frame++ % 2 ? "walk2" : "walk1"), 110);
    setTimeout(() => {
      clearInterval(walkTimer);
      panda.classList.remove("facing-left");
      pose("talk");
    }, ms);
    placeBubble();
  }

  /** Bubble beside the panda, on whichever side has more room. */
  function placeBubble() {
    const w = floor.clientWidth;
    const bw = Math.min(340, Math.max(180, w - PANDA_W - 24));
    bubble.style.width = `${bw}px`;
    const right = pandaX + PANDA_W + 8;
    const left = pandaX - bw - 8;
    const onRight = right + bw <= w || left < 0;
    bubble.style.left = `${onRight ? Math.min(right, Math.max(0, w - bw)) : left}px`;
    bubble.classList.toggle("tail-left", onRight);
    bubble.classList.toggle("tail-right", !onRight);
    // Grow the floor with the bubble so it never covers the controls.
    floor.style.minHeight = `${Math.max(132, bubble.offsetHeight + 14)}px`;
  }

  function followStep() {
    const f = ScenePlayer.focusPoint();
    if (f) walkTo(f.x);
    else {
      pose("talk");
      placeBubble();
    }
  }

  // ------------------------------------------------------------ scene player

  ScenePlayer.init(
    {
      stage: $("sceneStage"), svg: $("sceneSvg"), title: $("title"), box: $("sceneView"),
      caption: $("caption"), predictBox: $("predictBox"), predict: $("predict"),
      prev: $("prev"), play: $("play"), next: $("next"), counter: $("counter"),
    },
    {
      onPrediction: (right) => {
        vscode.postMessage({ type: "prediction", right });
        pose(right ? "cheer" : "talk");
      },
      // Wait for the nodes to finish sliding before walking to them.
      onStep: () => setTimeout(followStep, 560),
      onAsk: () => {
        pose("think");
        placeBubble();
      },
    },
  );

  function loadScene(scene) {
    show("sceneView");
    pandaX = 0;
    panda.style.left = "0px";
    ScenePlayer.load(scene);
  }

  function loadExample(name) {
    const scene = name.startsWith("algo:") ? ScenePlayer.algoScene(name.slice(5)) : ScenePlayer.EXAMPLES[name]();
    vscode.postMessage({ type: "example", name: scene.title });
    loadScene(scene);
  }

  document.querySelectorAll("[data-example]").forEach((b) => b.addEventListener("click", () => loadExample(b.dataset.example)));
  $("more").addEventListener("click", () => {
    $("title").textContent = "Panda's board";
    show("examplesView");
  });
  $("saveNotes").addEventListener("click", () => vscode.postMessage({ type: "saveNotes" }));
  new ResizeObserver(() => !$("sceneView").hidden && followStep()).observe(floor);

  // ------------------------------------------------------------ wrap-up

  function renderSummary(s, stats) {
    $("title").textContent = "Wrap-up";
    $("headline").innerHTML = rich(s.headline);
    const numbers = [
      `${stats.minutes} min`,
      stats.reviews && plural(stats.reviews, "review", "reviews"),
      stats.plans && plural(stats.plans, "plan checked", "plans checked"),
      stats.hints && plural(stats.hints, "hint", "hints"),
      stats.quizzes && plural(stats.quizzes, "quiz", "quizzes"),
      stats.predictions && `predictions ${stats.predictions}`,
      stats.visualized && plural(stats.visualized, "thing visualized", "things visualized"),
      stats.streakDays > 1 && `${stats.streakDays}-day streak`,
    ].filter(Boolean);
    $("numbers").textContent = numbers.join(" · ");
    const card = (title, iconName, items) =>
      items.length
        ? `<section class="card"><h2><i class="codicon codicon-${iconName}"></i>${esc(title)}</h2><ul>${items.map((x) => `<li>${rich(x)}</li>`).join("")}</ul></section>`
        : "";
    $("summaryCards").innerHTML =
      card("What you worked on", "code", s.workedOn) +
      card("What you figured out", "pass", s.figuredOut) +
      (s.planCheck ? `<section class="card"><h2><i class="codicon codicon-checklist"></i>Your plan</h2><p>${rich(s.planCheck)}</p></section>` : "") +
      card("Still a bit fuzzy", "question", s.stillFuzzy) +
      card("Next time", "arrow-right", s.nextTime) +
      (stats.topConcepts.length ? `<section class="card"><h2><i class="codicon codicon-tag"></i>Concepts</h2><p class="tags">${stats.topConcepts.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</p></section>` : "");
    show("summaryView");
  }

  // ------------------------------------------------------------ roadmap

  const openPhases = new Set();
  let roadmapRendered = false;
  let lastPhaseDone = null; // phase id -> done count, to notice a phase being finished

  function renderRoadmap(m) {
    const { phases, state, progress } = m;
    const done = new Set(state.done);
    $("title").textContent = "Your roadmap";
    const current = phases.find((p) => p.id === progress.currentPhase);
    if (!roadmapRendered && current) openPhases.add(current.id);
    roadmapRendered = true;

    // The panda says where you are, and cheers when a phase is finished.
    const justFinished = lastPhaseDone && phases.find((ph, k) => progress.phases[k].done === progress.phases[k].total && lastPhaseDone[ph.id] < progress.phases[k].total);
    lastPhaseDone = Object.fromEntries(phases.map((ph, k) => [ph.id, progress.phases[k].done]));
    $("roadmapPanda").src = `${sprites}/${progress.percent === 100 || justFinished ? "cheer" : progress.doneItems ? "talk" : "sit"}.svg`;
    $("roadmapHeadline").innerHTML = progress.percent === 100
      ? "<b>You finished the whole roadmap.</b> Keep the daily rhythm going, and good luck in your interviews!"
      : current
        ? `${justFinished ? `<b>${esc(justFinished.title)}: done!</b> ` : ""}You're in <b>${esc(current.title)}</b> (${esc(current.weeks)}). ${progress.doneItems} of ${progress.totalItems} steps done.`
        : "";
    $("roadmapNext").innerHTML = progress.next ? `Next up: <b>${rich(progress.next.title)}</b>` : "";
    $("roadmapPercent").textContent = `${progress.percent}%`;
    $("roadmapBar").style.width = `${progress.percent}%`;

    for (const d of ["easy", "medium", "hard"]) $(`solved-${d}`).textContent = state.solved[d];
    $("solvedTotal").textContent = progress.nextMilestone ? `${progress.solvedTotal} / ${progress.nextMilestone.count} ${progress.nextMilestone.label}` : `${progress.solvedTotal}: interview-ready`;
    $("milestones").innerHTML = m.milestones
      .map((ms) => `<span class="milestone ${progress.solvedTotal >= ms.count ? "hit" : ""}"><i class="codicon codicon-${progress.solvedTotal >= ms.count ? "pass-filled" : "circle-large-outline"}"></i>${ms.count} ${esc(ms.label)}</span>`)
      .join("");

    $("phases").innerHTML = phases
      .map((ph, k) => {
        const pp = progress.phases[k];
        const complete = pp.done === pp.total;
        const items = ph.items
          .map((it) => {
            const meta = [it.hours ? `${it.hours} h` : ""].filter(Boolean).join(" · ");
            return `<li class="${done.has(it.id) ? "done" : ""}">
              <label><input type="checkbox" data-item="${esc(it.id)}" ${done.has(it.id) ? "checked" : ""}><span class="item-title">${rich(it.title)}</span>${meta ? `<span class="muted small">${meta}</span>` : ""}</label>
              ${it.detail ? `<div class="item-detail muted small">${rich(it.detail)}</div>` : ""}
              ${it.guide ? `<details class="guide"><summary><i class="codicon codicon-book"></i>How to study this</summary>
                <h3>Focus on</h3><ul>${it.guide.focus.map((f) => `<li>${rich(f)}</li>`).join("")}</ul>
                <h3>Check yourself</h3><ol>${it.guide.checkpoints.map((c) => `<li>${rich(c)}</li>`).join("")}</ol>
                <h3>Try it in your editor</h3><p>${rich(it.guide.practice)}</p>
              </details>` : ""}
              <span class="item-actions">
                <button class="link small" data-guide="${esc(it.id)}" title="Talk this step through with the mentor"><i class="codicon codicon-mortar-board"></i>Guide me</button>
                ${it.url ? `<button class="link small" data-url="${esc(it.url)}" title="${esc(it.url)}"><i class="codicon codicon-link-external"></i>Open</button>` : ""}
              </span>
            </li>`;
          })
          .join("");
        return `<details class="phase ${complete ? "complete" : ""} ${ph.id === progress.currentPhase ? "current" : ""}" data-phase="${ph.id}" ${openPhases.has(ph.id) ? "open" : ""}>
          <summary>
            <i class="codicon codicon-${complete ? "pass-filled" : ph.id === progress.currentPhase ? "debug-start" : "circle-large-outline"}"></i>
            <span class="phase-title">${esc(ph.title)}</span>
            <span class="muted small">${esc(ph.weeks)}</span>
            <span class="phase-count">${pp.done}/${pp.total}</span>
          </summary>
          <p class="muted small phase-goal">${rich(ph.goal)}</p>
          <ul class="items">${items}</ul>
          ${ph.tip ? `<p class="phase-tip small"><i class="codicon codicon-lightbulb"></i>${rich(ph.tip)}</p>` : ""}
        </details>`;
      })
      .join("");
    show("roadmapView");
  }

  $("phases").addEventListener("toggle", (e) => {
    const d = e.target.closest("details");
    if (d) d.open ? openPhases.add(d.dataset.phase) : openPhases.delete(d.dataset.phase);
  }, true);
  $("phases").addEventListener("change", (e) => {
    const box = e.target.closest("[data-item]");
    if (box) vscode.postMessage({ type: "roadmapToggle", id: box.dataset.item });
  });
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-url]");
    if (link) vscode.postMessage({ type: "openUrl", url: link.dataset.url });
    const guide = e.target.closest("[data-guide]");
    if (guide) vscode.postMessage({ type: "guideMe", id: guide.dataset.guide });
    const solved = e.target.closest("[data-solved]");
    if (solved) vscode.postMessage({ type: "roadmapSolved", difficulty: solved.dataset.solved, delta: Number(solved.dataset.delta) });
  });

  // ------------------------------------------------------------ messages from the extension

  window.addEventListener("message", (event) => {
    const m = event.data;
    switch (m.type) {
      case "loading":
        $("title").textContent = "Panda's board";
        $("loadingText").textContent = m.text;
        document.querySelector("#loadingView .panda").src = `${sprites}/think.svg`;
        show("loadingView");
        break;
      case "scene":
        loadScene(m.scene);
        break;
      case "examples":
        $("title").textContent = "Panda's board";
        show("examplesView");
        break;
      case "summary":
        renderSummary(m.summary, m.stats);
        break;
      case "roadmap":
        renderRoadmap(m);
        break;
      case "error":
        $("title").textContent = "Panda's board";
        $("loadingText").innerHTML = `${esc(m.message)}${m.action ? ` <button class="small" id="fix">${m.action === "setApiKey" ? "Add API key" : "Open settings"}</button>` : ""}`;
        document.querySelector("#loadingView .panda").src = `${sprites}/talk.svg`;
        $("fix")?.addEventListener("click", () => vscode.postMessage({ type: "fix", action: m.action }));
        show("loadingView");
        break;
    }
  });

  vscode.postMessage({ type: "ready" });
})();
