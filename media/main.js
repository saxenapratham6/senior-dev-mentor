// The sidebar: just the conversation. The panda lives in the editor, and
// visualizations and wrap-ups open on the panda's board beside the code.
(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const log = $("log");
  const input = $("input");
  const replies = new Map(); // id -> { el, text }
  let busy = false;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

  /** A short note under the composer, for "type something first" moments. */
  let tipTimer;
  function tip(text) {
    let el = $("tip");
    if (!el) {
      el = document.createElement("div");
      el.id = "tip";
      el.className = "tip";
      $("composer").before(el);
    }
    el.textContent = text;
    el.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => (el.hidden = true), 6000);
  }

  function setBusy(b) {
    busy = b;
    $("stop").hidden = !b;
    $("send").disabled = b;
    document.querySelectorAll("[data-action]").forEach((x) => (x.disabled = b));
  }

  function send(action, text) {
    if (busy) return;
    if ((action === "chat" || action === "checkPlan") && !text.trim()) {
      tip(action === "chat" ? "Type a question first." : "Write your plan in the box first: the steps you'd take, in plain English. Thinking before typing is the whole point.");
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
  $("showMe").addEventListener("click", () => {
    vscode.postMessage({ type: "showMe", text: input.value });
    input.value = "";
  });
  $("wrapUp").addEventListener("click", () => vscode.postMessage({ type: "wrapUp" }));
  $("stop").addEventListener("click", () => vscode.postMessage({ type: "stop" }));
  $("newProblem").addEventListener("click", () => vscode.postMessage({ type: "newProblem" }));

  // "line 12" chips in replies send the panda to that line, carrying the bullet they sit in.
  log.addEventListener("click", (e) => {
    const chip = e.target.closest(".line-chip");
    if (!chip) return;
    const block = chip.closest("li, p, blockquote");
    const note = block ? block.textContent.trim() : `Line ${chip.dataset.line}`;
    vscode.postMessage({ type: "visitLine", line: Number(chip.dataset.line), note });
  });

  window.addEventListener("message", (event) => {
    const m = event.data;
    switch (m.type) {
      case "config":
        $("provider").textContent = m.providerLabel;
        $("keyBanner").hidden = !m.needsKey;
        break;
      case "user": {
        const head = m.label ? `<div class="label">${m.icon ? `<i class="codicon codicon-${m.icon}"></i>` : ""}${esc(m.label)}${m.fileName ? ` · <span class="muted">${esc(m.fileName)}</span>` : ""}</div>` : "";
        addMsg("user", head + (m.text ? `<div>${esc(m.text)}</div>` : ""));
        break;
      }
      case "mentor":
        addMsg("mentor", renderMarkdown(m.text));
        break;
      case "start":
        setBusy(true);
        replies.set(m.id, { el: addMsg("mentor pending", '<span class="typing">Thinking<span>.</span><span>.</span><span>.</span></span>'), text: "" });
        break;
      case "delta": {
        const r = replies.get(m.id);
        if (!r) break;
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
        el.querySelector("[data-fix]")?.addEventListener("click", (e) => vscode.postMessage({ type: e.target.closest("[data-fix]").dataset.fix }));
        if (r) replies.delete(m.id);
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
        tip("Fresh start! What are we working on?");
        break;
      case "nudge": {
        // The line was off screen, so the panda didn't walk; offer it here instead.
        const el = addMsg("mentor nudge", `<p><i class="codicon codicon-eye"></i><b>psst, line ${m.line + 1} in ${esc(m.fileName)}:</b> ${esc(m.question)}</p><button class="small secondary" data-visit="${m.line + 1}">${'<i class="codicon codicon-location"></i>'}Show me where</button>`);
        el.querySelector("[data-visit]").addEventListener("click", () => vscode.postMessage({ type: "visitLine", line: m.line + 1, note: m.question }));
        break;
      }
    }
  });

  vscode.postMessage({ type: "ready" });
})();
