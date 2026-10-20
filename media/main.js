(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const log = $("log");
  const input = $("input");
  const replies = new Map(); // id -> { el, text }
  let busy = false;

  // ---------------------------------------------------------------- tabs
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => {
        x.classList.toggle("active", x === t);
        x.setAttribute("aria-selected", String(x === t));
      });
      document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${t.dataset.tab}`));
      const s = vscode.getState() || {};
      vscode.setState({ ...s, tab: t.dataset.tab });
    }),
  );
  const saved = vscode.getState();
  if (saved && saved.tab) document.querySelector(`.tab[data-tab="${saved.tab}"]`)?.click();

  // ---------------------------------------------------------------- chat
  function scroll() {
    log.scrollTop = log.scrollHeight;
  }

  function addMsg(cls, html) {
    const div = document.createElement("div");
    div.className = `msg ${cls}`;
    div.innerHTML = html;
    log.appendChild(div);
    scroll();
    return div;
  }

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function setBusy(b) {
    busy = b;
    $("stop").hidden = !b;
    $("send").disabled = b;
    document.querySelectorAll("[data-action]").forEach((x) => (x.disabled = b));
  }

  function send(action, text) {
    if (busy) return;
    if ((action === "chat" || action === "checkPlan" || action === "teach") && !text.trim()) {
      const need = {
        chat: "Type a question first.",
        checkPlan: "Write your plan in the box first: the steps you'd take, in plain English. Thinking before typing is the whole point.",
        teach: "Type what you want to learn in the box, like \"python dictionaries\" or \"what is a linked list\".",
      }[action];
      Mascot.say(need, 6000);
      input.focus();
      return;
    }
    vscode.postMessage({ type: "ask", action, text });
    input.value = "";
  }

  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    send("chat", input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send("chat", input.value);
    }
  });
  document.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", () => send(b.dataset.action, input.value)));
  document.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => vscode.postMessage({ type: b.dataset.cmd })));
  $("stop").addEventListener("click", () => vscode.postMessage({ type: "stop" }));
  $("newProblem").addEventListener("click", () => vscode.postMessage({ type: "newProblem" }));
  $("resetProgress").addEventListener("click", () => vscode.postMessage({ type: "resetProgress" }));

  // ---------------------------------------------------------------- messages from the extension
  window.addEventListener("message", (event) => {
    const m = event.data;
    switch (m.type) {
      case "config":
        $("provider").textContent = m.providerLabel;
        $("keyBanner").hidden = !m.needsKey;
        Mascot.setEnabled(m.mascot);
        break;
      case "user": {
        const head = m.label ? `<div class="label">${m.icon ? `<i class="codicon codicon-${m.icon}"></i>` : ""}${esc(m.label)}${m.fileName ? ` · <span class="muted">${esc(m.fileName)}</span>` : ""}</div>` : "";
        addMsg("user", head + (m.text ? `<div>${esc(m.text)}</div>` : ""));
        break;
      }
      case "mentor":
        addMsg("mentor", renderMarkdown(m.text));
        Mascot.setMood(m.mood || "talk");
        if (!m.mood) setTimeout(() => Mascot.setMood(null), 1500);
        break;
      case "start":
        setBusy(true);
        replies.set(m.id, { el: addMsg("mentor pending", '<span class="typing">Thinking<span>.</span><span>.</span><span>.</span></span>'), text: "" });
        Mascot.setMood("think");
        break;
      case "delta": {
        const r = replies.get(m.id);
        if (!r) break;
        if (!r.text) Mascot.setMood("talk");
        r.text += m.text;
        r.el.classList.remove("pending");
        r.el.innerHTML = renderMarkdown(r.text);
        scroll();
        break;
      }
      case "done": {
        setBusy(false);
        const r = replies.get(m.id);
        if (r) {
          r.el.classList.remove("pending");
          if (!r.text) r.el.innerHTML = m.stopped ? '<p class="muted">Stopped.</p>' : '<p class="muted">(no reply)</p>';
          if (m.hidden) r.el.insertAdjacentHTML("beforeend", `<div class="guard-note"><i class="codicon codicon-lock"></i>The guardrail hid ${m.hidden} code block${m.hidden > 1 ? "s" : ""} in this reply.</div>`);
          replies.delete(m.id);
        }
        Mascot.setMood(m.stopped ? null : "cheer");
        break;
      }
      case "error": {
        setBusy(false);
        const r = replies.get(m.id);
        const html = `<p><i class="codicon codicon-warning"></i>${esc(m.message)}</p>${m.action ? `<button class="small" data-fix="${m.action}">${m.action === "setApiKey" ? "Add API key" : "Open settings"}</button>` : ""}`;
        const el = r ? r.el : addMsg("mentor", "");
        el.classList.remove("pending");
        el.classList.add("error");
        el.innerHTML = html;
        el.querySelector("[data-fix]")?.addEventListener("click", (e) => vscode.postMessage({ type: e.target.dataset.fix }));
        if (r) replies.delete(m.id);
        Mascot.setMood(null);
        break;
      }
      case "hintLevel": {
        const meter = $("hintMeter");
        meter.hidden = false;
        meter.innerHTML = `Hint ${m.level} of ${m.total}: <b>${esc(m.name)}</b> <span class="pips">${'<i class="codicon codicon-circle-filled"></i>'.repeat(m.level)}${'<i class="codicon codicon-circle-outline"></i>'.repeat(m.total - m.level)}</span>`;
        break;
      }
      case "cleared":
        log.querySelectorAll(".msg:not(.intro)").forEach((x) => x.remove());
        $("hintMeter").hidden = true;
        Mascot.say("Fresh start! What are we working on?", 4000);
        break;
      case "nudge":
        if (m.walked) break; // the panda is already at the line in the editor
        Mascot.setMood("alert");
        Mascot.say(
          `<b>psst, about line ${m.line + 1} in ${esc(m.fileName)}:</b><br>${esc(m.question)}<div class="bubble-hint">Click and I'll walk you there</div>`,
          15000,
          () => vscode.postMessage({ type: "visitLine", line: m.line + 1, note: m.question }),
        );
        break;
      case "pandaAway":
        $("awayText").innerHTML = `<i class="codicon codicon-location"></i>In your editor at <b>line ${m.line}</b> of ${esc(m.fileName)}${m.stops > 1 ? ` (stop ${m.stop} of ${m.stops})` : ""}. Hover that line.`;
        Mascot.leave(() => ($("awaySign").hidden = false));
        break;
      case "pandaBack":
        $("awaySign").hidden = true;
        Mascot.comeBack();
        break;
      case "sceneLoading":
        sceneStatus('<i class="codicon codicon-loading codicon-modifier-spin"></i>Drawing it…');
        $("vizGo").disabled = $("vizCode").disabled = true;
        break;
      case "scene":
        sceneStatus(null);
        $("vizGo").disabled = $("vizCode").disabled = false;
        ScenePlayer.load(m.scene);
        break;
      case "sceneError":
        $("vizGo").disabled = $("vizCode").disabled = false;
        sceneStatus(`<i class="codicon codicon-warning"></i>${esc(m.message)}${m.action ? ` <button class="small" data-fix="${m.action}">${m.action === "setApiKey" ? "Add API key" : "Open settings"}</button>` : ""}`, true);
        break;
      case "progress":
        renderProgress(m.data, m.streak);
        break;
    }
  });

  // ---------------------------------------------------------------- line chips
  // "line 12" chips in replies send the panda to that line, carrying the bullet they sit in.
  log.addEventListener("click", (e) => {
    const chip = e.target.closest(".line-chip");
    if (!chip) return;
    const block = chip.closest("li, p, blockquote");
    const note = block ? block.textContent.trim() : `Line ${chip.dataset.line}`;
    vscode.postMessage({ type: "visitLine", line: Number(chip.dataset.line), note });
  });
  $("awayBack").addEventListener("click", () => vscode.postMessage({ type: "pandaDismiss" }));

  // ---------------------------------------------------------------- visualize
  document.querySelectorAll(".seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll(".viz-pane").forEach((p) => p.classList.toggle("active", p.id === `viz-${b.dataset.viz}`));
    }),
  );
  function sceneStatus(html, isError) {
    const box = $("sceneStatus");
    box.hidden = !html;
    box.classList.toggle("error", !!isError);
    box.innerHTML = html || "";
    box.querySelector("[data-fix]")?.addEventListener("click", (e) => vscode.postMessage({ type: e.target.closest("[data-fix]").dataset.fix }));
  }
  $("vizGo").addEventListener("click", () => {
    const prompt = $("vizPrompt").value.trim();
    if (!prompt) return sceneStatus("Describe what you want to see, or try an example below.", true);
    vscode.postMessage({ type: "visualize", prompt, useSelection: false });
  });
  $("vizCode").addEventListener("click", () => vscode.postMessage({ type: "visualize", prompt: $("vizPrompt").value.trim(), useSelection: true }));
  $("vizPrompt").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("vizGo").click();
    }
  });
  document.querySelectorAll("[data-example]").forEach((b) =>
    b.addEventListener("click", () => {
      sceneStatus(null);
      ScenePlayer.load(ScenePlayer.EXAMPLES[b.dataset.example]());
    }),
  );

  // ---------------------------------------------------------------- progress
  function renderProgress(p, streak) {
    const hints = p.hintsByLevel.reduce((a, b) => a + b, 0);
    const concepts = Object.entries(p.concepts).sort((a, b) => b[1] - a[1]).slice(0, 14);
    const maxC = concepts.length ? concepts[0][1] : 1;
    const thinking = p.plansChecked + p.reviews + p.quizzes + p.predictionsTotal;
    const ratio = hints ? (thinking / hints).toFixed(1) : thinking ? "∞" : "–";
    const pct = p.predictionsTotal ? Math.round((100 * p.predictionsRight) / p.predictionsTotal) : null;
    $("progressBody").innerHTML = `
      <div class="stats">
        <div class="stat"><div class="n">${streak}</div><div class="l"><i class="codicon codicon-flame"></i>day streak</div></div>
        <div class="stat"><div class="n">${ratio}</div><div class="l">think-to-hint ratio</div></div>
        <div class="stat"><div class="n">${p.reviews}</div><div class="l">attempts reviewed</div></div>
        <div class="stat"><div class="n">${p.plansChecked}</div><div class="l">plans checked</div></div>
        <div class="stat"><div class="n">${pct === null ? "–" : pct + "%"}</div><div class="l">predictions right (${p.predictionsTotal})</div></div>
        <div class="stat"><div class="n">${p.quizzes}</div><div class="l">quizzes</div></div>
        <div class="stat"><div class="n">${p.visualizations || 0}</div><div class="l">things visualized</div></div>
      </div>
      <h4>Hints used</h4>
      <div class="muted small">Nudges ${p.hintsByLevel[0]} · Concepts ${p.hintsByLevel[1]} · Plans ${p.hintsByLevel[2]}</div>
      <h4>Concepts you've worked on</h4>
      ${concepts.length ? concepts.map(([c, n]) => `<div class="concept"><span>${esc(c)}</span><span class="bar-bg"><span class="bar-fg" data-w="${Math.round((100 * n) / maxC)}"></span></span><span class="muted">${n}</span></div>`).join("") : '<div class="muted small">Ask the mentor something and the concepts will show up here.</div>'}
      <h4>Guardrails</h4>
      <div class="muted small">${p.solutionRequestsRedirected} "just give me the answer" requests redirected · ${p.codeHidden} code blocks hidden</div>
      <p class="muted small">The think-to-hint ratio counts plans, reviews, quizzes and predictions per hint. Higher means you're doing more of the thinking.</p>`;
    // The webview's CSP blocks inline style attributes, so set widths here.
    $("progressBody").querySelectorAll("[data-w]").forEach((b) => (b.style.width = `${b.dataset.w}%`));
  }

  // ---------------------------------------------------------------- boot
  Mascot.init($("stage"), $("panda"), $("bubble"));
  Visualizer.init(
    {
      algo: $("algo"), size: $("size"), speed: $("speed"), predict: $("predict"),
      play: $("play"), step: $("step"), shuffle: $("shuffle"),
      canvas: $("canvas"), vizCaption: $("vizCaption"), predictBox: $("predictBox"), pseudo: $("pseudo"), vizStats: $("vizStats"),
    },
    { onPrediction: (right) => vscode.postMessage({ type: "prediction", right }) },
  );
  ScenePlayer.init(
    {
      stage: $("sceneStage"), svg: $("sceneSvg"), title: $("sceneTitle"), box: $("sceneBox"), caption: $("sceneCaption"),
      predictBox: $("scenePredictBox"), predict: $("scenePredict"), prev: $("scenePrev"), play: $("scenePlay"), next: $("sceneNext"), counter: $("sceneCounter"),
    },
    { onPrediction: (right) => vscode.postMessage({ type: "prediction", right }) },
  );
  vscode.postMessage({ type: "ready" });
})();
