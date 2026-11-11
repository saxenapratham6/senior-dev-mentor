// The panda's board. The panda stands on a floor under the diagram, walks to
// whatever the current step is about, and says the step in its bubble.
(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const sprites = document.body.dataset.sprites;
  const panda = $("panda");
  const bubble = $("bubble");
  const floor = $("floor");
  const PANDA_W = 66;
  let pandaX = 0;
  let walkTimer = null;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  /** Escaped text with `inline code` shown as code. */
  const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  const paras = (s) => (s || "").split(/\n\n+/).map((p) => `<p>${rich(p)}</p>`).join("");
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function show(view) {
    const changed = $(view).hidden;
    for (const v of ["sceneView", "examplesView", "loadingView", "summaryView", "roadmapView", "lessonView"]) $(v).hidden = v !== view;
    if (changed) window.scrollTo(0, 0);
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
    const ms = Math.min(420, 120 + dist * 1.2);
    panda.style.transitionDuration = `${ms}ms`;
    panda.classList.toggle("facing-left", target < pandaX);
    pandaX = target;
    panda.style.left = `${pandaX}px`;
    let frame = 0;
    walkTimer = setInterval(() => pose(frame++ % 2 ? "walk2" : "walk1"), 65);
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
      onStep: () => setTimeout(followStep, 150),
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
            const passedCount = (it.exercises || []).filter((x) => state.passed.includes(x)).length;
            const ladderCount = state.ladder.filter((k) => it.lesson && k.startsWith(it.lesson + "/")).length;
            const meta = [
              it.minutes ? `${it.minutes} min` : "",
              it.hours ? `${it.hours} h` : "",
              it.exercises ? `${passedCount}/${it.exercises.length} exercises` : "",
              it.ladder ? `${ladderCount}/${it.ladder} LeetCode` : "",
            ].filter(Boolean).join(" · ");
            return `<li class="${done.has(it.id) ? "done" : ""}">
              <label><input type="checkbox" data-item="${esc(it.id)}" ${done.has(it.id) ? "checked" : ""}><span class="item-title">${rich(it.title)}</span>${meta ? `<span class="muted small">${meta}</span>` : ""}</label>
              ${it.detail ? `<div class="item-detail muted small">${rich(it.detail)}</div>` : ""}
              <span class="item-actions">
                ${it.lesson ? `<button class="small" data-lesson="${esc(it.lesson)}"><i class="codicon codicon-book"></i>${done.has(it.id) ? "Review lesson" : "Open lesson"}</button>` : ""}
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

  // ------------------------------------------------------------ lessons

  let lesson = null;
  let lessonState = { done: false, passed: [], ladder: [] };
  let ladderUrls = {};

  const KEYWORDS = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
  const BUILTINS = new Set("abs all any bool chr dict divmod enumerate filter float hash int isinstance iter len list map max min next ord pow print range repr reversed round set sorted str sum super tuple type zip".split(" "));
  const TOKEN = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|[rbf]*"(?:\\.|[^"\\\n])*"|[rbf]*'(?:\\.|[^'\\\n])*')|\b(\d[\d_]*(?:\.\d+)?(?:e-?\d+)?)\b|\b([A-Za-z_]\w*)\b/g;

  /** Tiny Python highlighter: comments, strings, numbers, keywords, builtins, function names. */
  function highlight(code) {
    let out = "";
    let last = 0;
    for (const m of code.matchAll(TOKEN)) {
      out += esc(code.slice(last, m.index));
      const [text, comment, string, number, word] = m;
      if (comment) out += `<span class="tok-c">${esc(text)}</span>`;
      else if (string) out += `<span class="tok-s">${esc(text)}</span>`;
      else if (number) out += `<span class="tok-n">${esc(text)}</span>`;
      else if (KEYWORDS.has(word)) out += `<span class="tok-k">${esc(text)}</span>`;
      else if (BUILTINS.has(word) && code[m.index + text.length] === "(") out += `<span class="tok-b">${esc(text)}</span>`;
      else if (/\b(def|class)\s+$/.test(code.slice(Math.max(0, m.index - 8), m.index))) out += `<span class="tok-f">${esc(text)}</span>`;
      else out += esc(text);
      last = m.index + text.length;
    }
    return out + esc(code.slice(last));
  }

  function codeCard(id, code) {
    return `<div class="code-card" data-example="${esc(id)}">
      <pre class="code"><code>${highlight(code)}</code></pre>
      <div class="code-actions">
        <button class="small" data-run="${esc(id)}"><i class="codicon codicon-play"></i>Run</button>
        <button class="link small" data-editor="${esc(id)}" title="Open a copy in the editor to change and run"><i class="codicon codicon-go-to-file"></i>Try it in the editor</button>
        <span class="muted small predict-hint">Predict what it prints, then run it.</span>
      </div>
      <div class="output" hidden></div>
    </div>`;
  }

  function renderLesson(m) {
    lesson = m.lesson;
    ladderUrls = m.ladderUrls;
    lessonState = { done: m.done, passed: m.passed, ladder: m.ladder };
    const L = m.lesson;
    $("title").textContent = L.title;
    $("lessonUnit").textContent = m.unitTitle;
    $("lessonSummary").textContent = L.summary;
    $("lessonMeta").textContent = `${L.minutes} min · ${L.exercises.length} exercise${L.exercises.length === 1 ? "" : "s"}${L.ladder ? ` · ${L.ladder.length} LeetCode problems` : ""}`;
    pose("lessonPanda", "talk");

    let html = "";
    if (L.signals) html += `<section class="card signals"><h2><i class="codicon codicon-search"></i>Clues that point to this pattern</h2><ul>${L.signals.map((x) => `<li>${rich(x)}</li>`).join("")}</ul></section>`;
    L.sections.forEach((sec, i) => {
      html += `<section class="lesson-section"><h2>${rich(sec.heading)}</h2>${paras(sec.text)}${sec.code ? codeCard(`${L.id}#s${i}`, sec.code) : ""}${sec.after ? paras(sec.after) : ""}</section>`;
    });
    if (L.compare) {
      const c = L.compare;
      html += `<section class="lesson-section"><h2>${rich(c.title)}</h2><div class="table-wrap"><table><thead><tr>${c.headers.map((h) => `<th>${rich(h)}</th>`).join("")}</tr></thead><tbody>${c.rows.map((r) => `<tr>${r.map((cell) => `<td>${rich(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
    }
    if (L.pitfalls) {
      html += `<section class="lesson-section"><h2>Common mistakes</h2>`;
      L.pitfalls.forEach((p, i) => {
        html += `<div class="card pitfall"><h3><i class="codicon codicon-warning"></i>${rich(p.title)}</h3>${codeCard(`${L.id}#p${i}`, p.code)}${paras(p.why)}</div>`;
      });
      html += `</section>`;
    }
    html += `<section class="lesson-section"><h2>Check yourself</h2>${L.quiz
      .map((q, qi) => `<div class="card quiz" data-q="${qi}"><p class="q">${rich(q.q)}</p><div class="options">${q.options.map((o, oi) => `<button class="option" data-quiz="${qi}" data-opt="${oi}">${rich(o)}</button>`).join("")}</div><p class="why" hidden></p></div>`)
      .join("")}</section>`;
    html += `<section class="lesson-section"><h2>Practice</h2>${L.exercises
      .map(
        (e) => `<div class="card exercise" data-ex="${esc(e.id)}">
          <h3><i class="codicon codicon-beaker"></i>${rich(e.title)} <span class="badge passed" hidden><i class="codicon codicon-pass-filled"></i>Passed</span></h3>
          ${paras(e.prompt)}
          <div class="code-actions">
            <button class="small" data-start="${esc(e.id)}"><i class="codicon codicon-edit"></i>Open exercise</button>
            <button class="small secondary" data-check="${esc(e.id)}"><i class="codicon codicon-check-all"></i>Check</button>
            <button class="link small" data-hint="${esc(e.id)}" title="The mentor's hint ladder: a nudge, then the concept, then a plan. Never the answer."><i class="codicon codicon-lightbulb"></i>Hint</button>
          </div>
          <div class="output" hidden></div>
        </div>`,
      )
      .join("")}</section>`;
    if (L.ladder) {
      html += `<section class="lesson-section"><h2>Your LeetCode ladder</h2><p class="muted">Solve these on LeetCode yourself, easiest first. Tick each one once it's accepted. Stuck? Write what you tried in the mentor and press Hint.</p><ul class="ladder">${L.ladder
        .map(
          (p) => `<li><label><input type="checkbox" data-ladder="${esc(p.name)}"><span class="diff ${p.difficulty}">${p.difficulty}</span><span>${esc(p.name)}</span></label><button class="link small" data-url="${esc(ladderUrls[p.name])}"><i class="codicon codicon-link-external"></i>LeetCode</button></li>`,
        )
        .join("")}</ul></section>`;
    }
    $("lessonBody").innerHTML = html;
    navButton("lessonPrev", m.nav.prev, "arrow-left", true);
    navButton("lessonNext", m.nav.next, "arrow-right", false);
    applyLessonState();
    show("lessonView");
    window.scrollTo(0, 0);
  }

  function navButton(id, target, iconName, before) {
    const b = $(id);
    b.hidden = !target;
    if (!target) return;
    b.dataset.target = target.id;
    b.innerHTML = before ? `<i class="codicon codicon-${iconName}"></i>${esc(target.title)}` : `${esc(target.title)}<i class="codicon codicon-${iconName} after"></i>`;
  }

  function applyLessonState() {
    $("lessonDone").innerHTML = lessonState.done ? '<i class="codicon codicon-pass-filled"></i>Lesson complete' : '<i class="codicon codicon-pass"></i>Mark lesson complete';
    $("lessonDone").classList.toggle("secondary", lessonState.done);
    document.querySelectorAll(".exercise").forEach((card) => {
      card.querySelector(".badge.passed").hidden = !lessonState.passed.includes(card.dataset.ex);
    });
    document.querySelectorAll("[data-ladder]").forEach((box) => {
      box.checked = lessonState.ladder.includes(`${lesson.id}/${box.dataset.ladder}`);
    });
  }

  function pose(imgId, name) {
    const img = $(imgId);
    if (img) img.src = `${sprites}/${name}.svg`;
  }

  function showRun(exampleId, r) {
    const card = document.querySelector(`.code-card[data-example="${CSS.escape(exampleId)}"]`);
    if (!card) return;
    const box = card.querySelector(".output");
    card.querySelector(".predict-hint").hidden = true;
    box.hidden = false;
    let html = r.stdout ? `<pre>${esc(r.stdout.replace(/\n$/, ""))}</pre>` : "";
    if (r.error) html += `<pre class="err">${esc(r.error)}</pre>`;
    if (r.timedOut) html += `<pre class="err">Stopped after a few seconds.</pre>`;
    if (!html) html = `<p class="muted small">(prints nothing)</p>`;
    if (r.saved) html += `<p class="muted small">Python wasn't found, so this is the saved output. Set <code>seniorDevMentor.pythonPath</code> to run code yourself.</p>`;
    if (r.missing) html = `<p class="muted small">Python wasn't found. Install Python 3 or set <code>seniorDevMentor.pythonPath</code>.</p>`;
    box.innerHTML = `<div class="output-label">Output</div>${html}`;
    pose("lessonPanda", "talk");
  }

  function showCheck(exerciseId, r) {
    const card = document.querySelector(`.exercise[data-ex="${CSS.escape(exerciseId)}"]`);
    if (!card) return;
    const box = card.querySelector(".output");
    box.hidden = false;
    const total = r.passed + r.failed;
    let html;
    if (r.missing) html = `<p>Python wasn't found. Install Python 3 or set <code>seniorDevMentor.pythonPath</code>.</p>`;
    else if (r.timedOut) html = `<p class="bad"><i class="codicon codicon-watch"></i>Your code ran too long and was stopped. Look for a loop that never ends, or an approach that's too slow for the big check.</p>`;
    else if (!total) html = `<p class="bad"><i class="codicon codicon-error"></i>The checks didn't run.</p>${r.error ? `<pre class="err">${esc(r.error)}</pre>` : ""}<p class="muted small">Look for a syntax or indentation error near the line it mentions.</p>`;
    else {
      const head = r.failed
        ? `<p class="${r.passed ? "partial" : "bad"}"><b>${r.passed} of ${total} checks pass.</b> Start with the first FAIL.</p>`
        : `<p class="good"><i class="codicon codicon-pass-filled"></i><b>All ${total} checks pass.</b> Nice work!</p>`;
      html = head + `<pre>${r.lines.map((l) => `<span class="${l.startsWith("PASS") ? "pass" : "fail"}">${esc(l)}</span>`).join("\n")}</pre>`;
    }
    box.innerHTML = html;
    pose("lessonPanda", total && !r.failed ? "cheer" : "think");
  }

  function answerQuiz(button) {
    const card = button.closest(".quiz");
    const q = lesson.quiz[Number(button.dataset.quiz)];
    const picked = Number(button.dataset.opt);
    card.querySelectorAll(".option").forEach((b, i) => {
      b.disabled = true;
      if (i === q.answer) b.classList.add("right");
      else if (i === picked) b.classList.add("wrong");
    });
    const why = card.querySelector(".why");
    why.hidden = false;
    why.innerHTML = `${picked === q.answer ? '<i class="codicon codicon-pass-filled good"></i><b>Right.</b> ' : '<i class="codicon codicon-error bad"></i><b>Not quite.</b> '}${rich(q.why)}`;
    vscode.postMessage({ type: "prediction", right: picked === q.answer });
    pose("lessonPanda", picked === q.answer ? "cheer" : "talk");
  }

  $("lessonView").addEventListener("click", (e) => {
    const t = (sel) => e.target.closest(sel);
    let el;
    if ((el = t("[data-run]"))) {
      el.disabled = true;
      setTimeout(() => (el.disabled = false), 800);
      vscode.postMessage({ type: "runExample", id: el.dataset.run });
    } else if ((el = t("[data-editor]"))) vscode.postMessage({ type: "exampleInEditor", id: el.dataset.editor });
    else if ((el = t("[data-start]"))) vscode.postMessage({ type: "startExercise", lessonId: lesson.id, exerciseId: el.dataset.start });
    else if ((el = t("[data-check]"))) {
      const box = el.closest(".exercise").querySelector(".output");
      box.hidden = false;
      box.innerHTML = `<p class="muted"><i class="codicon codicon-loading codicon-modifier-spin"></i>Running your checks…</p>`;
      vscode.postMessage({ type: "checkExercise", lessonId: lesson.id, exerciseId: el.dataset.check });
    } else if ((el = t("[data-hint]"))) vscode.postMessage({ type: "exerciseHint", lessonId: lesson.id, exerciseId: el.dataset.hint });
    else if ((el = t("[data-quiz]"))) answerQuiz(el);
    else if (t("[data-back]")) vscode.postMessage({ type: "backToRoadmap" });
    else if ((el = t("#lessonPrev, #lessonNext"))) vscode.postMessage({ type: "openLesson", id: el.dataset.target });
    else if (t("#lessonDone")) vscode.postMessage({ type: "lessonDone", id: lesson.id });
    else if (t("#lessonAsk")) vscode.postMessage({ type: "askAboutLesson", id: lesson.id });
  });
  $("lessonView").addEventListener("change", (e) => {
    const box = e.target.closest("[data-ladder]");
    if (box) vscode.postMessage({ type: "ladderToggle", lessonId: lesson.id, name: box.dataset.ladder });
  });
  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-lesson]");
    if (open) vscode.postMessage({ type: "openLesson", id: open.dataset.lesson });
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
      case "lesson":
        renderLesson(m);
        break;
      case "lessonState":
        lessonState = { done: m.done, passed: m.passed, ladder: m.ladder };
        applyLessonState();
        break;
      case "runResult":
        showRun(m.exampleId, m.result);
        break;
      case "checkResult":
        showCheck(m.exerciseId, m.result);
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
