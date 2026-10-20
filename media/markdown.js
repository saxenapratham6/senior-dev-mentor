// Minimal Markdown renderer for mentor replies. Escapes all HTML first, so
// model output can never inject markup into the webview.
(function () {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<i>$2</i>")
      .replace(/(^|\W)_([^_\n]+)_(?!\w)/g, "$1<i>$2</i>");
  }

  function render(md) {
    const lines = md.replace(/\r/g, "").split("\n");
    const out = [];
    let list = null; // "ul" | "ol"
    let para = [];
    const flushPara = () => {
      if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
      para = [];
    };
    const closeList = () => {
      if (list) out.push(`</${list}>`);
      list = null;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = line.match(/^\s*(```|~~~)\s*([\w+#-]*)/);
      if (fence) {
        flushPara();
        closeList();
        const body = [];
        i++;
        while (i < lines.length && !/^\s*(```|~~~)/.test(lines[i])) body.push(lines[i++]);
        out.push(`<pre class="code"><code>${esc(body.join("\n"))}</code></pre>`);
        continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*)/);
      const ul = line.match(/^\s*[-*+]\s+(.*)/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
      const quote = line.match(/^\s*>\s?(.*)/);
      if (h) {
        flushPara();
        closeList();
        out.push(`<h4>${inline(h[2])}</h4>`);
      } else if (ul || ol) {
        flushPara();
        const kind = ul ? "ul" : "ol";
        if (list !== kind) {
          closeList();
          out.push(`<${kind}>`);
          list = kind;
        }
        let item = inline((ul || ol)[1]).replace(/^\[ \]\s*/, '<i class="codicon codicon-circle-large-outline"></i>').replace(/^\[x\]\s*/i, '<i class="codicon codicon-pass"></i>');
        out.push(`<li>${item}</li>`);
      } else if (quote) {
        flushPara();
        closeList();
        const q = inline(quote[1]);
        // The guardrail's notice gets a lock icon and its own style.
        out.push(q.startsWith("<b>Code hidden") ? `<blockquote class="guard"><i class="codicon codicon-lock"></i>${q}</blockquote>` : `<blockquote>${q}</blockquote>`);
      } else if (!line.trim()) {
        flushPara();
        closeList();
      } else {
        closeList();
        para.push(line);
      }
    }
    flushPara();
    closeList();
    return out.join("");
  }

  window.renderMarkdown = render;
})();
