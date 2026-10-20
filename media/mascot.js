// The panda. Same shape as vscode-pets: a state machine advanced by a 100 ms
// tick; each state runs for some frames and then picks the next one. The
// sprite is pure CSS, and movement is `style.left` on the panda element.
(function () {
  const TICK_MS = 100;
  const WIDTH = 46;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const PONDER = [
    "Can you explain your code out loud, line by line? Rubber-duck me.",
    "What's the smallest input that could break this?",
    "Have you tried it with an empty input?",
    "What do you know <i>for sure</i> is working right now?",
    "If you had to write a test for this, what would it check?",
    "Draw it on paper first. Boxes and arrows help.",
    "Stuck for 15 minutes? Take a short walk. Brains debug in the background.",
    "Which line would you put a print statement on?",
  ];

  let stage, panda, bubble;
  let x = 20;
  let state = "idle";
  let frames = 0;
  let mood = null; // a mood overrides wandering until cleared
  let idleTicks = 0;
  let bubbleTimer = null;
  let enabled = true;
  let ponderIndex = Math.floor(Math.random() * PONDER.length);

  function setState(next, duration) {
    state = next;
    frames = duration;
    panda.className = `panda ${next}`;
  }

  function maxX() {
    return Math.max(0, stage.clientWidth - WIDTH - 4);
  }

  function chooseNext() {
    if (reducedMotion) return setState(idleTicks > 600 ? "sleep" : "idle", 50);
    if (idleTicks > 600) return setState("sleep", 200); // a minute with nothing happening
    const r = Math.random();
    if (r < 0.35) return setState("idle", 30 + Math.floor(Math.random() * 40));
    if (r < 0.55) return setState("sit", 40 + Math.floor(Math.random() * 40));
    if (r < 0.78) return setState("walk-right", 20 + Math.floor(Math.random() * 40));
    return setState("walk-left", 20 + Math.floor(Math.random() * 40));
  }

  function tick() {
    if (!enabled || !stage.clientWidth) return;
    idleTicks++;
    if (mood) {
      positionBubble();
      return;
    }
    if (state === "walk-right" || state === "walk-left") {
      const dir = state === "walk-right" ? 1 : -1;
      x += dir * 2.2;
      if (x <= 0 || x >= maxX()) {
        x = Math.min(Math.max(x, 0), maxX());
        setState(dir > 0 ? "walk-left" : "walk-right", 20);
      }
      panda.style.left = `${x}px`;
    }
    positionBubble();
    if (--frames <= 0) chooseNext();
  }

  function positionBubble() {
    if (bubble.hidden) return;
    const w = bubble.offsetWidth;
    const left = Math.min(Math.max(4, x + WIDTH / 2 - w / 2), Math.max(4, stage.clientWidth - w - 4));
    bubble.style.left = `${left}px`;
  }

  /** Moods: think (waiting on AI), talk (streaming), cheer, wag (said no), alert (noticed something). */
  function setMood(m) {
    if (!panda) return;
    idleTicks = 0;
    mood = m;
    if (!m) return chooseNext();
    panda.className = `panda ${m}`;
    if (m === "cheer" || m === "wag" || m === "alert") {
      setTimeout(() => {
        if (mood === m) setMood(null);
      }, 1800);
    }
  }

  function say(html, ms = 6000, onClick) {
    if (!bubble || !enabled) return;
    idleTicks = 0;
    if (state === "sleep") chooseNext();
    bubble.innerHTML = html;
    bubble.hidden = false;
    bubble.classList.toggle("clickable", !!onClick);
    bubble.onclick = onClick
      ? () => {
          bubble.hidden = true;
          onClick();
        }
      : () => (bubble.hidden = true);
    positionBubble();
    clearTimeout(bubbleTimer);
    if (ms) bubbleTimer = setTimeout(() => (bubble.hidden = true), ms);
  }

  function init(stageEl, pandaEl, bubbleEl) {
    stage = stageEl;
    panda = pandaEl;
    bubble = bubbleEl;
    x = Math.min(20, maxX());
    panda.style.left = `${x}px`;
    panda.addEventListener("click", () => {
      setMood("cheer");
      say(PONDER[ponderIndex++ % PONDER.length], 7000);
    });
    document.addEventListener("keydown", () => (idleTicks = 0));
    chooseNext();
    setInterval(tick, TICK_MS);
  }

  function setEnabled(on) {
    enabled = on;
    if (stage) stage.hidden = !on;
  }

  window.Mascot = { init, setMood, say, setEnabled };
})();
