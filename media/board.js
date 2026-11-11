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
    for (const v of ["sceneView", "examplesView", "loadingView", "summaryView", "roadmapView", "lessonView", "repoView", "deployView"]) $(v).hidden = v !== view;
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

  // ------------------------------------------------------------ the repo map and tour

  let repoMsg = null;

  /** Notes are a little Markdown: paragraphs, `code`, **bold** and *italic*. */
  const md = (s) =>
    (s || "")
      .split(/\n\n+/)
      .map((p) => `<p>${rich(p).replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>").replace(/\n/g, "<br>")}</p>`)
      .join("");

  function aiCard(ai, tour) {
    if (!ai) return "";
    if (ai.written && tour.ai) {
      const c = tour.ai.checked;
      return `<section class="card ai-card done"><p><i class="codicon codicon-sparkle"></i> Written by ${esc(tour.ai.label)} from ${plural(tour.ai.files, "file", "files")}, then checked against your code: ${plural(c.kept, "stop", "stops")} kept${c.moved ? `, ${c.moved} moved to the line it quoted` : ""}${c.dropped ? `, ${c.dropped} thrown away because the code it quoted isn't there` : ""}.</p><button class="link" id="aiBasic">${icon2("list-flat")}Use the basic tour instead</button></section>`;
    }
    const cost = ai.cost !== undefined ? ` · about $${ai.cost < 0.01 ? "0.01" : ai.cost.toFixed(2)}` : "";
    const where =
      ai.kind === "ollama"
        ? "Everything stays on this computer."
        : "Excerpts of these files go to Anthropic. Files that may hold passwords or keys are never sent, and anything in the code that looks like a key is blanked out first. List paths in a <code>.mentorignore</code> file to keep them out.";
    const working = ai.state === "working";
    return `<section class="card ai-card"><h2><i class="codicon codicon-sparkle"></i>A richer tour, written by AI</h2>
      <p>${esc(ai.label)} can read the important files and write a tour with the big picture, a diagram of how the parts connect, one feature followed end to end, and a <b>Simpler</b> and <b>Deeper</b> version of every stop. Every stop is checked against your code before the panda uses it.</p>
      <p class="muted small">${plural(ai.files.length, "file", "files")} · about ${Math.round(ai.tokens / 1000)}k tokens${cost} (budget: ${esc(ai.budget)}). ${where}</p>
      <details class="sent"><summary class="small">See what gets sent</summary><ul>${ai.files.map((f) => `<li><code>${esc(f)}</code></li>`).join("")}</ul></details>
      ${ai.state === "error" ? `<p class="ai-error"><i class="codicon codicon-warning"></i> ${rich(ai.text || "Something went wrong.")}${ai.action ? ` <button class="small" id="aiFix">${ai.action === "setApiKey" ? "Add API key" : "Open settings"}</button>` : ""}</p>` : ""}
      <div class="row">${working ? `<span class="ai-progress"><i class="codicon codicon-loading codicon-modifier-spin"></i> <span id="aiProgressText">${esc(ai.text || "Working…")}</span></span><button class="secondary" id="aiCancel">Cancel</button>` : `<button id="aiTour" ${ai.files.length ? "" : "disabled"}>${icon2("sparkle")}Write the tour with AI</button>`}</div>
    </section>`;
  }
  const icon2 = (n) => `<i class="codicon codicon-${n}"></i>`;

  /** Boxes in columns by how far they are from where things start, arrows between them. */
  function archSvg(arch) {
    const boxes = arch.boxes;
    if (!boxes.length) return "";
    const level = new Map(boxes.map((b) => [b.id, 0]));
    for (let pass = 0; pass < boxes.length; pass++)
      for (const a of arch.arrows) if (level.get(a.to) <= level.get(a.from) && pass < boxes.length - 1) level.set(a.to, level.get(a.from) + 1);
    const cols = [];
    for (const b of boxes) (cols[level.get(b.id)] ||= []).push(b);
    const W = 150, H = 54, GX = 70, GY = 26;
    const pos = new Map();
    const rows = Math.max(...cols.map((c) => (c ? c.length : 0)));
    cols.forEach((c, x) => (c || []).forEach((b, y) => pos.set(b.id, { x: 10 + x * (W + GX), y: 10 + (y + (rows - c.length) / 2) * (H + GY) })));
    const width = 20 + cols.length * W + (cols.length - 1) * GX;
    const height = 20 + rows * H + (rows - 1) * GY;
    const arrows = arch.arrows
      .map((a) => {
        const f = pos.get(a.from), t = pos.get(a.to);
        const forward = t.x > f.x;
        const x1 = forward ? f.x + W : f.x + W / 2, y1 = forward ? f.y + H / 2 : f.y + H;
        const x2 = forward ? t.x : t.x + W / 2, y2 = forward ? t.y + H / 2 : t.y;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        return `<path class="arch-link" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" marker-end="url(#archHead)"/><text class="arch-label" x="${mx}" y="${my - 5}">${esc(a.label)}</text>`;
      })
      .join("");
    const nodes = boxes
      .map((b) => {
        const p = pos.get(b.id);
        const code = b.files.length > 0;
        return `<g class="arch-box${code ? " code" : ""}" data-box="${esc(b.id)}" tabindex="${code ? 0 : -1}"><title>${esc(b.what)}${code ? "\n" + b.files.join("\n") : ""}</title><rect x="${p.x}" y="${p.y}" width="${W}" height="${H}" rx="8"/><text x="${p.x + W / 2}" y="${p.y + H / 2 - (code ? 4 : -4)}">${esc(b.label)}</text>${code ? `<text class="arch-files" x="${p.x + W / 2}" y="${p.y + H / 2 + 13}">${plural(b.files.length, "file", "files")}</text>` : ""}</g>`;
      })
      .join("");
    return `<svg class="arch" viewBox="0 0 ${width} ${height}" role="img" aria-label="How the parts connect"><defs><marker id="archHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrow-head"/></marker></defs>${arrows}${nodes}</svg>`;
  }

  function overviewCards(ai) {
    if (!ai) return "";
    const o = ai.overview;
    return (
      `<section class="card"><h2><i class="codicon codicon-info"></i>The big picture</h2>${md(o.purpose)}${o.users ? `<p class="muted">${rich(o.users)}</p>` : ""}${o.howItWorks ? `<h3>How it works</h3>${md(o.howItWorks)}` : ""}</section>` +
      (o.architecture.boxes.length ? `<section class="card"><h2><i class="codicon codicon-type-hierarchy"></i>How the parts connect</h2><div class="arch-wrap">${archSvg(o.architecture)}</div><p class="muted small">Click a part to walk to its code.</p></section>` : "") +
      (o.glossary.length ? `<details class="card fold"><summary><i class="codicon codicon-book"></i>Words you'll see (${o.glossary.length})</summary><dl class="glossary">${o.glossary.map((g) => `<dt>${esc(g.term)}</dt><dd>${rich(g.meaning)}</dd>`).join("")}</dl></details>` : "")
    );
  }

  function fileRow(f, withReasons) {
    const reasons = withReasons && f.reasons.length ? `<span class="reasons">${f.reasons.map((r) => `<span class="reason">${esc(r)}</span>`).join("")}</span>` : "";
    return `<li><button class="file-row" data-explain="${esc(f.path)}" title="Have the panda explain ${esc(f.path)}"><code>${esc(f.path)}</code>${f.role ? `<span class="muted"> ${rich(f.role)}</span>` : ""}</button>${reasons}</li>`;
  }

  /** The panel under the goal tabs: a question to trace, or a change to plan. */
  function goalPanel(m) {
    const goal = m.goal || "tour";
    document.querySelectorAll("[data-goal]").forEach((b) => b.classList.toggle("on", b.dataset.goal === goal));
    const ai = m.ai;
    const aiReady = ai && ai.state !== "working";
    const status =
      ai && ai.state === "working"
        ? `<p class="ai-progress"><i class="codicon codicon-loading codicon-modifier-spin"></i> <span id="aiProgressText">${esc(ai.text || "Working…")}</span> <button type="button" class="secondary small" id="aiCancel">Cancel</button></p>`
        : ai && ai.state === "error"
          ? `<p class="ai-error"><i class="codicon codicon-warning"></i> ${rich(ai.text || "")}${ai.action ? ` <button type="button" class="small" id="aiFix">${ai.action === "setApiKey" ? "Add API key" : "Open settings"}</button>` : ""}</p>`
          : "";
    const aiBtn = ai ? `<button type="button" class="secondary" data-with-ai ${aiReady ? "" : "disabled"} title="${esc(ai.kind === "ollama" ? "Uses your local model; nothing leaves this computer" : `Sends the related code to ${ai.label}; secrets are never sent`)}">${icon2("sparkle")}With AI</button>` : "";
    if (goal === "trace")
      return `<form class="goal-form" id="traceForm"><label for="traceQ"><b>What happens when…</b></label><div class="row"><input id="traceQ" value="${esc(m.question || "")}" placeholder="a user adds a todo, I run npm start, someone logs in" autocomplete="off"><button type="submit">${icon2("debug-step-into")}Follow it</button>${aiBtn}</div>${
        m.suggestions?.length ? `<p class="chips"><span class="muted small">Or start from:</span> ${m.suggestions.map((s, i) => `<button type="button" class="chip" data-start="${i}">${esc(s)}</button>`).join("")}</p>` : ""
      }${status}</form>`;
    if (goal === "change")
      return `<form class="goal-form" id="changeForm"><label for="changeQ"><b>What do you need to change?</b> <span class="muted small">I'll show you where it goes, what else it touches, and which tests to run. You write the change.</span></label><div class="row"><input id="changeQ" value="${esc(m.task || "")}" placeholder="add a due date to todos" autocomplete="off"><button type="submit">${icon2("search")}Find the code</button>${aiBtn}</div>${status}</form>`;
    return "";
  }

  /** Lifelines across the top, one arrow per hand-over, in order. Click an arrow to walk there. */
  function seqSvg(seq) {
    if (!seq || seq.actors.length < 2) return "";
    const n = seq.actors.length;
    const col = Math.max(120, Math.min(170, 720 / n));
    const W = 20 + n * col, rowH = 34, top = 44;
    const H = top + seq.messages.length * rowH + 20;
    const x = (a) => 10 + seq.actors.indexOf(a) * col + col / 2;
    const heads = seq.actors.map((a) => `<g class="seq-actor"><rect x="${x(a) - col / 2 + 8}" y="6" width="${col - 16}" height="26" rx="6"/><text x="${x(a)}" y="23">${esc(a)}</text></g><line class="seq-life" x1="${x(a)}" y1="32" x2="${x(a)}" y2="${H - 6}"/>`).join("");
    const msgs = seq.messages
      .map((msg, i) => {
        const y = top + i * rowH + 16;
        const x1 = x(msg.from), x2 = x(msg.to);
        const self = msg.from === msg.to;
        const path = self ? `M${x1},${y - 8} h24 v16 h-22` : `M${x1},${y} L${x2 + (x2 > x1 ? -4 : 4)},${y}`;
        const lx = self ? x1 + 30 : (x1 + x2) / 2;
        return `<g class="seq-msg" data-stop="${msg.stop}" tabindex="0"><title>Walk to step ${msg.stop + 1}</title><rect class="seq-hit" x="${Math.min(x1, x2) - 6}" y="${y - 16}" width="${Math.abs(x2 - x1) + (self ? 60 : 12)}" height="24"/><path d="${path}" marker-end="url(#seqHead)"/><text x="${lx}" y="${y - 5}" text-anchor="${self ? "start" : "middle"}"><tspan class="seq-n">${i + 1}</tspan> ${esc(msg.label)}</text></g>`;
      })
      .join("");
    return `<section class="card"><h2><i class="codicon codicon-arrow-swap"></i>Who talks to whom</h2><div class="arch-wrap"><svg class="seq" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sequence of the steps"><defs><marker id="seqHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="arrow-head"/></marker></defs>${heads}${msgs}</svg></div><p class="muted small">Click an arrow to walk to that step.</p></section>`;
  }

  function renderRepo(m) {
    repoMsg = m;
    const { repo, tour } = m;
    const isRepo = tour.kind === "repo";
    $("goalPanel").innerHTML = goalPanel(m);
    $("title").textContent = isRepo ? `Tour of ${repo.name}` : tour.title;
    $("repoHeadline").innerHTML = isRepo
      ? `This is <b>${esc(repo.name)}</b>${repo.description ? `: ${rich(repo.description)}` : "."}`
      : tour.message
        ? rich(tour.message)
        : `${rich(tour.title)}. Press <b>Walk me through it</b> and I'll go stop by stop.`;
    const meta = [
      plural(repo.files, "file", "files") + (repo.truncated ? " (I stopped counting there)" : ""),
      repo.lines && `${repo.lines.toLocaleString()} lines of code`,
      repo.languages.length && repo.languages.map((l) => `${l.name} ${l.share}%`).join(", "),
      repo.secrets && `I didn't open ${plural(repo.secrets, "file", "files")} that may hold passwords or keys`,
    ].filter(Boolean);
    $("repoMeta").textContent = meta.join(" · ");
    $("repoChips").innerHTML = repo.frameworks.map((f) => `<span class="tag" title="${esc(f.what.replace(/`/g, ""))}">${esc(f.name)}</span>`).join("");
    const stops = tour.chapters.reduce((n, c) => n + c.stops.length, 0);
    $("tourStart").innerHTML = `<i class="codicon codicon-play"></i>${isRepo ? "Start the tour" : "Walk me through it"}`;
    $("tourStart").disabled = !stops;
    $("repoMapBack").hidden = isRepo;
    const resume = $("tourResume");
    resume.hidden = m.resumeAt === undefined;
    if (m.resumeAt !== undefined) resume.querySelector("span").textContent = `Resume at stop ${m.resumeAt + 1}`;
    document.querySelectorAll("[data-level]").forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.level === m.level));
      b.classList.toggle("on", b.dataset.level === m.level);
    });

    const outline = stops
      ? `<section class="card tour-outline"><h2><i class="codicon codicon-compass"></i>${isRepo ? "The tour" : "Stops"} · ${plural(stops, "stop", "stops")}</h2>${tour.chapters
          .map(
            (c) =>
              `<div class="chapter"><div class="chapter-title">${esc(c.title)}${c.why ? `<span class="muted small"> ${rich(c.why)}</span>` : ""}</div><ol>${c.stops
                .map((st) => `<li><button class="stop" data-stop="${st.index}" title="${esc(st.bubble)}"><span class="stop-n">${st.index + 1}</span>${esc(st.title)}<span class="muted small"> ${esc(st.path)}:${st.line + 1}</span></button></li>`)
                .join("")}</ol></div>`,
          )
          .join("")}</section>`
      : "";
    const card = (title, iconName, rows, withReasons) =>
      rows.length ? `<section class="card"><h2><i class="codicon codicon-${iconName}"></i>${esc(title)}</h2><ul class="files">${rows.map((f) => fileRow(f, withReasons)).join("")}</ul></section>` : "";
    const folders = repo.folders.length
      ? `<section class="card"><h2><i class="codicon codicon-folder"></i>Folders</h2><ul class="files">${repo.folders
          .map((f) => `<li><button class="file-row" data-explain="${esc(f.path)}" title="Have the panda explain ${esc(f.path)}/"><code>${esc(f.path)}/</code><span class="muted"> ${rich(f.role)} · ${plural(f.files, "file", "files")}</span></button></li>`)
          .join("")}</ul></section>`
      : "";
    const supporting = repo.supporting.length
      ? `<details class="card fold"><summary><i class="codicon codicon-library"></i>Supporting files (${repo.supporting.length + repo.supportingMore})</summary><ul class="files">${repo.supporting.map((f) => fileRow(f, true)).join("")}</ul>${repo.supportingMore ? `<p class="muted small">and ${repo.supportingMore} more</p>` : ""}</details>`
      : "";
    const skipCount = repo.skip.reduce((n, g) => n + g.count, 0);
    const skip = skipCount
      ? `<details class="card fold"><summary><i class="codicon codicon-eye-closed"></i>Safe to skip for now (${skipCount})</summary><ul class="skip">${repo.skip
          .map((g) => `<li><b>${g.count}</b> ${rich(g.why)}<div class="muted small">${g.examples.map((e) => `<code>${esc(e)}</code>`).join(" ")}${g.count > g.examples.length ? " …" : ""}</div></li>`)
          .join("")}</ul></details>`
      : "";
    const quiz = tour.quiz.length
      ? `<details class="card fold"><summary><i class="codicon codicon-question"></i>Check yourself after the tour</summary><ul class="quiz-list">${tour.quiz
          .map((q) => `<li><details><summary>${rich(q.q)}</summary><p>${rich(q.a)}</p></details></li>`)
          .join("")}</ul></details>`
      : "";
    const quizCard = tour.quiz.length && !isRepo ? `<section class="card"><h2><i class="codicon codicon-question"></i>Before you start</h2><ul class="quiz-list">${tour.quiz.map((q) => `<li><details><summary>${rich(q.q)}</summary><p>${rich(q.a)}</p></details></li>`).join("")}</ul></section>` : "";
    const aiNote = !isRepo && tour.ai ? `<p class="muted small"><i class="codicon codicon-sparkle"></i> Written by ${esc(tour.ai.label)}, checked against your code${tour.ai.checked.dropped ? ` (${plural(tour.ai.checked.dropped, "step", "steps")} thrown away: the code they quoted isn't there)` : ""}.</p>` : "";
    const goalNow = m.goal || "tour";
    const hideBody = (goalNow === "trace" && tour.kind !== "trace") || (goalNow === "change" && tour.kind !== "change");
    $("repoBody").innerHTML = hideBody ? "" :
      (isRepo ? aiCard(m.ai, tour) + overviewCards(tour.ai) : "") +
      (tour.kind === "trace" ? seqSvg(tour.sequence) : "") +
      aiNote +
      (tour.message && !isRepo ? "" : outline) +
      quizCard +
      (isRepo ? card("Start here", "debug-start", repo.start, true) + card("The files that do the work", "flame", repo.core, true) + folders + supporting + skip + quiz : "");
    show("repoView");
    tourAt(m.at);
  }

  function tourAt(stop) {
    if (!repoMsg) return;
    repoMsg.at = stop;
    document.querySelectorAll("#repoBody .stop").forEach((b) => b.classList.toggle("here", Number(b.dataset.stop) === stop));
    const all = repoMsg.tour.chapters.flatMap((c) => c.stops.map((st) => ({ ...st, chapter: c.title })));
    const cur = all[stop];
    $("tourBar").hidden = !cur;
    $("tourNow").hidden = !cur;
    $("repoPanda").src = `${sprites}/${cur ? "point" : "talk"}.svg`;
    if (!cur) return;
    renderNow(cur, "note");
    $("tourWhere").innerHTML = `<b>Stop ${stop + 1} of ${all.length}</b> · ${esc(cur.chapter)} · <code>${esc(cur.path)}</code>`;
    $("tourBack").disabled = stop === 0;
    $("tourNext").innerHTML = stop + 1 < all.length ? `<i class="codicon codicon-arrow-right"></i>Next` : `<i class="codicon codicon-check"></i>Finish`;
    document.querySelector("#repoBody .stop.here")?.scrollIntoView({ block: "nearest" });
  }

  /** The current stop's explanation, with Simpler / Deeper and a question to check yourself. */
  function renderNow(cur, which) {
    const versions = [["note", "Explanation"], ["simpler", "Simpler"], ["deeper", "Deeper"]].filter(([k]) => cur[k]);
    $("tourNow").innerHTML =
      `<div class="now-head"><b>${esc(cur.title)}</b><span class="muted small"> ${esc(cur.path)}:${cur.line + 1}</span>${versions.length > 1 ? `<span class="segmented small" role="tablist">${versions.map(([k, label]) => `<button role="tab" data-now="${k}" class="${k === which ? "on" : ""}" aria-selected="${k === which}">${label}</button>`).join("")}</span>` : ""}</div>` +
      `<div class="now-text">${md(cur[which])}</div>` +
      (cur.check ? `<div class="now-check"><b>Check yourself:</b> ${rich(cur.check.question)} <button class="link" data-reveal>Show answer</button><p class="muted" hidden>${rich(cur.check.answer)}</p></div>` : "");
    $("tourNow").querySelectorAll("[data-now]").forEach((b) => b.addEventListener("click", () => renderNow(cur, b.dataset.now)));
    $("tourNow").querySelector("[data-reveal]")?.addEventListener("click", (e) => {
      e.target.nextElementSibling.hidden = false;
      e.target.remove();
    });
  }

  // ------------------------------------------------------------ deploy

  let deployMsg = null;
  const STATUS_ICON = { pass: "pass-filled", warn: "warning", fail: "error" };

  function renderDeploy(m) {
    deployMsg = m;
    const r = m.report;
    $("title").textContent = "How to deploy this";
    $("deployHeadline").innerHTML = `This is ${rich(r.app.words)}.${r.app.evidence.length ? ` <span class="muted">(It ${rich(r.app.evidence.join("; "))}.)</span>` : ""}`;
    $("deployMeta").innerHTML = [r.score.fail && `<b class="st-fail">${r.score.fail} to fix first</b>`, r.score.warn && `<b class="st-warn">${r.score.warn} to look at</b>`, `<b class="st-pass">${r.score.pass} ready</b>`, r.app.db && `database: ${rich(r.app.db)}`].filter(Boolean).join(" · ");
    $("deployPanda").src = `${sprites}/${r.score.fail ? "think" : "cheer"}.svg`;
    const x = r.explained;
    const chosen = r.targets.find((t) => t.id === r.chosen);
    const order = { fail: 0, warn: 1, pass: 2 };
    const checks = [...r.checks].sort((a, b) => order[a.status] - order[b.status]);
    const plain = (title) => x?.fixFirst.find((f) => f.check === title)?.explain;
    const ai = m.ai;
    const aiBlock = ai
      ? x
        ? ""
        : `<section class="card ai-card"><p>${icon2("sparkle")} Want it explained for this app, step by step${m.level === "new" ? " in plain words" : ""}? ${esc(ai.label)} reads the checks and your deploy files (package.json, Dockerfile, Procfile…), with secrets blanked out. It can't change a check, and only commands for ${esc(chosen?.name ?? "the host")} get through.</p>${
            ai.state === "working"
              ? `<p class="ai-progress"><i class="codicon codicon-loading codicon-modifier-spin"></i> ${esc(ai.text || "Working…")}</p>`
              : `${ai.state === "error" ? `<p class="ai-error">${rich(ai.text || "")}${ai.action ? ` <button class="small" id="deployFix">${ai.action === "setApiKey" ? "Add API key" : "Open settings"}</button>` : ""}</p>` : ""}<button id="deployExplain">${icon2("sparkle")}Explain it for me</button>`
          }</section>`
      : "";
    $("deployBody").innerHTML =
      (x ? `<section class="card ai-card done"><h2>${icon2("sparkle")}Deploying this app</h2>${md(x.intro)}</section>` : "") +
      `<section class="card"><h2>${icon2("checklist")}Before you deploy</h2><ul class="checks">${checks
        .map(
          (c) =>
            `<li class="check c-${c.status}"><i class="codicon codicon-${STATUS_ICON[c.status]}"></i><div><b>${rich(c.title)}</b>${c.where ? ` <button class="link small" data-open="${esc(c.where.path)}" data-line="${c.where.line}">${icon2("go-to-file")}Show me (${esc(c.where.path)}:${c.where.line + 1})</button>` : ""}<p class="muted">${rich(c.why)}</p>${c.fix ? `<p><b>What to change:</b> ${rich(c.fix)}</p>` : ""}${plain(c.title) ? `<p class="plain">${icon2("sparkle")} ${rich(plain(c.title))}</p>` : ""}</div></li>`,
        )
        .join("")}</ul></section>` +
      aiBlock +
      `<section class="card"><h2>${icon2("cloud-upload")}Where it can go</h2><div class="targets">${r.targets
        .map(
          (t) =>
            `<button class="target${t.id === r.chosen ? " on" : ""}" data-target="${t.id}" aria-pressed="${t.id === r.chosen}"><b>${esc(t.name)}</b>${t.reasons.length ? `<span class="small">${rich(t.reasons.join("; "))}</span>` : ""}<span class="muted small">${rich(t.cost)}</span></button>`,
        )
        .join("")}</div>${chosen ? `<p>${rich(chosen.good)}</p><p class="muted"><b>Watch out:</b> ${rich(chosen.watch)}</p><p class="small"><a href="#" data-url="${esc(chosen.docs)}">${esc(chosen.name)} docs</a> · <a href="#" data-url="${esc(chosen.pricing)}">pricing</a></p>` : ""}</section>` +
      (chosen
        ? `<section class="card"><h2>${icon2("list-ordered")}Steps on ${esc(chosen.name)}${x ? " (your guide)" : ""}</h2><ol class="steps">${(x && x.steps.length ? x.steps : r.steps)
            .map((s) => `<li><b>${rich(s.title)}</b><p class="muted">${rich(s.why)}</p>${s.command ? `<pre class="cmd"><code>${esc(s.command)}</code></pre>` : ""}${s.link ? `<a href="#" class="small" data-url="${esc(s.link)}">Read more</a>` : ""}</li>`)
            .join("")}</ol><p class="muted small">You type each command yourself; the mentor never runs a deploy for you.</p></section>`
        : `<section class="card"><p>I don't know a good host for this kind of project yet.</p></section>`) +
      ((x?.risks.length ? x.risks : r.failures).length
        ? `<details class="card fold"><summary>${icon2("bug")}What could go wrong</summary><ul class="skip">${(x?.risks.length ? x.risks : r.failures).map((f) => `<li><b>${rich(f.symptom)}</b><p class="muted">${rich(f.meaning)} ${rich(f.check)}</p></li>`).join("")}</ul></details>`
        : "") +
      `<p class="muted small">Hosting plans change often. This list was last checked ${esc(r.catalogChecked)}; always check the host's own pricing page.</p>`;
    show("deployView");
  }

  $("deployBack").addEventListener("click", () => vscode.postMessage({ type: "repoMap" }));
  $("deployBody").addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) return vscode.postMessage({ type: "openFile", path: open.dataset.open, line: Number(open.dataset.line) });
    const t = e.target.closest("[data-target]");
    if (t) return vscode.postMessage({ type: "deployTarget", id: t.dataset.target });
    const link = e.target.closest("[data-url]");
    if (link) {
      e.preventDefault();
      return vscode.postMessage({ type: "openUrl", url: link.dataset.url });
    }
    if (e.target.closest("#deployExplain")) return vscode.postMessage({ type: "deployExplain" });
    if (e.target.closest("#deployFix")) return vscode.postMessage({ type: "fix", action: deployMsg?.ai?.action });
  });

  $("tourStart").addEventListener("click", () => vscode.postMessage({ type: "tourStart" }));
  $("tourResume").addEventListener("click", () => vscode.postMessage({ type: "tourResume" }));
  $("tourNext").addEventListener("click", () => vscode.postMessage({ type: "tourNext" }));
  $("tourBack").addEventListener("click", () => vscode.postMessage({ type: "tourBack" }));
  $("tourEnd").addEventListener("click", () => vscode.postMessage({ type: "tourEnd" }));
  $("repoMapBack").addEventListener("click", () => vscode.postMessage({ type: "repoMap" }));
  document.querySelectorAll("[data-level]").forEach((b) => b.addEventListener("click", () => vscode.postMessage({ type: "tourLevel", level: b.dataset.level })));
  document.querySelectorAll("[data-goal]").forEach((b) => b.addEventListener("click", () => vscode.postMessage({ type: "goal", goal: b.dataset.goal })));
  $("goalPanel").addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "traceForm") vscode.postMessage({ type: "traceRun", question: $("traceQ").value, ai: false });
    if (e.target.id === "changeForm" && $("changeQ").value.trim()) vscode.postMessage({ type: "changeRun", task: $("changeQ").value, ai: false });
  });
  $("goalPanel").addEventListener("click", (e) => {
    if (e.target.closest("#aiCancel")) return vscode.postMessage({ type: "aiCancel" });
    if (e.target.closest("#aiFix")) return vscode.postMessage({ type: "fix", action: repoMsg?.ai?.action });
    const start = e.target.closest("[data-start]");
    if (start) return vscode.postMessage({ type: "traceRun", question: "", start: Number(start.dataset.start), ai: false });
    if (e.target.closest("[data-with-ai]")) {
      if ($("traceQ")) return vscode.postMessage({ type: "traceRun", question: $("traceQ").value, ai: true });
      if ($("changeQ") && $("changeQ").value.trim()) return vscode.postMessage({ type: "changeRun", task: $("changeQ").value, ai: true });
    }
  });

  $("repoBody").addEventListener("click", (e) => {
    if (e.target.closest("#aiTour")) return vscode.postMessage({ type: "aiTour" });
    if (e.target.closest("#aiCancel")) return vscode.postMessage({ type: "aiCancel" });
    if (e.target.closest("#aiBasic")) return vscode.postMessage({ type: "aiBasic" });
    if (e.target.closest("#aiFix")) return vscode.postMessage({ type: "fix", action: repoMsg?.ai?.action });
    const box = e.target.closest("[data-box]");
    if (box && repoMsg?.tour.ai) {
      const files = repoMsg.tour.ai.overview.architecture.boxes.find((b) => b.id === box.dataset.box)?.files ?? [];
      const st = repoMsg.tour.chapters.flatMap((c) => c.stops).find((s) => files.includes(s.path));
      if (st) return vscode.postMessage({ type: "tourJump", stop: st.index });
      if (files[0]) return vscode.postMessage({ type: "explainPath", path: files[0] });
      return;
    }
    const stop = e.target.closest("[data-stop]");
    if (stop) return vscode.postMessage({ type: "tourJump", stop: Number(stop.dataset.stop) });
    const explain = e.target.closest("[data-explain]");
    if (explain) vscode.postMessage({ type: "explainPath", path: explain.dataset.explain });
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
      case "repo":
        renderRepo(m);
        break;
      case "tourAt":
        tourAt(m.stop);
        break;
      case "deploy":
        renderDeploy(m);
        break;
      case "aiProgress":
        if ($("aiProgressText")) $("aiProgressText").textContent = m.text;
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
