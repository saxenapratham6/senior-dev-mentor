// Where an app can be deployed, and the steps for each. This is data so it's
// easy to correct: hosting plans change often, so every entry says when it was
// last checked, prices are left to the host's own page, and the steps link to
// the official docs. Commands are one-liners the student types themselves.
import type { AppKind, AppProfile, Runtime } from "./profile";

export const CATALOG_CHECKED = "2026-11";

export interface Target {
  id: string;
  name: string;
  docs: string;
  pricing: string;
  /** What kind of apps it hosts. */
  kinds: AppKind[];
  runtimes?: Runtime[];
  /** One line on cost, deliberately vague: check the pricing page. */
  cost: string;
  good: string; // what it's good at
  watch: string; // what to watch out for
  /** Commands the AI explanation may show for this target (prefixes). Anything else is dropped. */
  commands: string[];
  /** Config files that mean the repo is already set up for it. */
  configIds: string[];
}

export const TARGETS: Target[] = [
  {
    id: "render",
    name: "Render",
    docs: "https://render.com/docs",
    pricing: "https://render.com/pricing",
    kinds: ["api-server", "fullstack", "ssr-web", "worker", "static-site", "spa"],
    cost: "Has a free option for small web services that sleep when idle; check the pricing page for current limits.",
    good: "Deploys straight from a GitHub repo, with a dashboard where you type the build and start commands. Offers PostgreSQL.",
    watch: "Free services sleep when unused, so the first request after a while is slow.",
    commands: ["git push"],
    configIds: ["render"],
  },
  {
    id: "railway",
    name: "Railway",
    docs: "https://docs.railway.com",
    pricing: "https://railway.com/pricing",
    kinds: ["api-server", "fullstack", "ssr-web", "worker"],
    cost: "Usage-based, with a trial; check the pricing page.",
    good: "Detects most apps automatically from the repo, and adds databases in a click.",
    watch: "Costs grow with usage; set a spending limit.",
    commands: ["git push", "railway up", "railway login", "railway link", "npm install -g @railway/cli"],
    configIds: ["railway"],
  },
  {
    id: "fly",
    name: "Fly.io",
    docs: "https://fly.io/docs",
    pricing: "https://fly.io/docs/about/pricing",
    kinds: ["api-server", "fullstack", "ssr-web", "worker"],
    cost: "Pay as you go; check the pricing page.",
    good: "Runs your app as a container close to users, from a single `fly.toml`. Has volumes for files that must survive restarts.",
    watch: "You use its command-line tool (`fly`), and a credit card is needed.",
    commands: ["fly launch", "fly deploy", "fly secrets set", "fly logs", "fly auth login", "fly volumes create", "fly postgres", "fly status"],
    configIds: ["fly", "docker"],
  },
  {
    id: "cloud-run",
    name: "Google Cloud Run",
    docs: "https://cloud.google.com/run/docs",
    pricing: "https://cloud.google.com/run/pricing",
    kinds: ["api-server", "fullstack", "ssr-web"],
    cost: "Pay per request, with a free monthly allowance; check the pricing page.",
    good: "Builds a container from your source and scales it to zero when nobody is using it.",
    watch: "Google Cloud's console has a lot going on; set a budget alert.",
    commands: ["gcloud run deploy", "gcloud auth login", "gcloud config set project", "gcloud run services logs"],
    configIds: ["docker"],
  },
  {
    id: "heroku",
    name: "Heroku",
    docs: "https://devcenter.heroku.com",
    pricing: "https://www.heroku.com/pricing",
    kinds: ["api-server", "fullstack", "ssr-web", "worker"],
    cost: "No free plan; paid from the smallest size. Check the pricing page (there are student offers).",
    good: "The original \"push and it runs\" host: a `Procfile` and `git push` are all it takes.",
    watch: "No free plan.",
    commands: ["heroku create", "git push heroku", "heroku config:set", "heroku logs", "heroku login", "heroku addons:create"],
    configIds: ["heroku"],
  },
  {
    id: "vercel",
    name: "Vercel",
    docs: "https://vercel.com/docs",
    pricing: "https://vercel.com/pricing",
    kinds: ["ssr-web", "spa", "static-site", "fullstack"],
    runtimes: ["node", "static", "python"],
    cost: "Free for personal, non-commercial projects; check the pricing page.",
    good: "Made by the team behind Next.js: connect the repo and every push deploys, with a preview link for each branch.",
    watch: "Server code runs as short-lived functions, not a long-running server: things like websockets or background jobs need another host.",
    commands: ["vercel", "vercel --prod", "vercel env add", "vercel login", "npm install -g vercel"],
    configIds: ["vercel"],
  },
  {
    id: "netlify",
    name: "Netlify",
    docs: "https://docs.netlify.com",
    pricing: "https://www.netlify.com/pricing",
    kinds: ["spa", "static-site", "ssr-web"],
    runtimes: ["node", "static"],
    cost: "Has a free plan for small sites; check the pricing page.",
    good: "Connect the repo, set the build command and the folder to publish, and it's live.",
    watch: "Single-page apps need a redirect rule so refreshing a page doesn't show 404.",
    commands: ["netlify deploy", "netlify deploy --prod", "netlify login", "netlify init", "npm install -g netlify-cli"],
    configIds: ["netlify"],
  },
  {
    id: "github-pages",
    name: "GitHub Pages",
    docs: "https://docs.github.com/pages",
    pricing: "https://docs.github.com/pages/getting-started-with-github-pages/about-github-pages",
    kinds: ["static-site", "spa"],
    runtimes: ["static", "node"],
    cost: "Free for public repositories.",
    good: "Already where your code is; no new account.",
    watch: "Static files only (no server code), and project sites live under `/<repo-name>/`, so the app's base path must match.",
    commands: ["git push", "npm run build"],
    configIds: ["github-pages"],
  },
  {
    id: "cloudflare-pages",
    name: "Cloudflare Pages",
    docs: "https://developers.cloudflare.com/pages",
    pricing: "https://www.cloudflare.com/plans/developer-platform",
    kinds: ["static-site", "spa", "ssr-web"],
    runtimes: ["node", "static"],
    cost: "Has a free plan; check the pricing page.",
    good: "Fast static hosting from a repo, with server functions if you need them later.",
    watch: "Server code runs in Cloudflare's own runtime, which isn't full Node.js.",
    commands: ["npx wrangler pages deploy", "npx wrangler login"],
    configIds: ["cloudflare"],
  },
  {
    id: "docker",
    name: "Any server with Docker",
    docs: "https://docs.docker.com/get-started",
    pricing: "https://docs.docker.com/get-started",
    kinds: ["api-server", "fullstack", "ssr-web", "worker"],
    cost: "Whatever the server costs.",
    good: "Your `Dockerfile` runs the same anywhere: a VPS, a school server, or any container host.",
    watch: "You look after the server yourself: updates, HTTPS, restarts.",
    commands: ["docker build", "docker run", "docker compose up", "docker logs"],
    configIds: ["docker"],
  },
  {
    id: "pypi",
    name: "PyPI (pip install)",
    docs: "https://packaging.python.org/tutorials/packaging-projects",
    pricing: "https://pypi.org",
    kinds: ["cli", "library"],
    runtimes: ["python"],
    cost: "Free.",
    good: "Lets anyone install your tool with `pip install`.",
    watch: "Package names are first come, first served, and a published version can't be replaced. Try TestPyPI first.",
    commands: ["python -m build", "python -m twine upload", "pip install build twine", "uv build", "uv publish"],
    configIds: [],
  },
  {
    id: "npm",
    name: "npm (npm install)",
    docs: "https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages",
    pricing: "https://www.npmjs.com",
    kinds: ["cli", "library"],
    runtimes: ["node"],
    cost: "Free for public packages.",
    good: "Lets anyone install your package with `npm install`, or run your tool with `npx`.",
    watch: "A published version can't be changed; bump the version for every release.",
    commands: ["npm publish", "npm login", "npm pack", "npm version"],
    configIds: [],
  },
];

export interface TargetFit {
  target: Target;
  score: number;
  reasons: string[];
  configured?: string; // the config file that's already there for it
}

/** The hosts that fit this app, best first: the one the repo is already set up for, then good fits. */
export function rankTargets(p: AppProfile): TargetFit[] {
  const out: TargetFit[] = [];
  for (const t of TARGETS) {
    if (!t.kinds.includes(p.kind)) continue;
    if (t.runtimes && !t.runtimes.includes(p.runtime)) continue;
    const reasons: string[] = [];
    let score = 1;
    // Set up for this host specifically (fly.toml, vercel.json…), or just able to use a generic Dockerfile.
    const own = p.configs.find((c) => c.target === t.configIds[0] && (c.target !== "docker" || t.id === "docker"));
    const usable = p.configs.find((c) => c.target === "docker" && ["docker", "fly", "cloud-run", "render", "railway"].includes(t.id));
    const cfg = own ?? usable;
    if (own && t.id !== "docker") {
      score += 10;
      reasons.push(`this repo is already set up for it (\`${own.path}\`)`);
    } else if (cfg) {
      score += 2;
      reasons.push(`it can build your \`${cfg.path}\``);
    }
    if (t.id === "vercel" && p.frameworks.includes("next")) (score += 5), reasons.push("made by the Next.js team");
    if ((t.id === "netlify" || t.id === "github-pages" || t.id === "cloudflare-pages") && (p.kind === "spa" || p.kind === "static-site")) (score += 3), reasons.push("static files are all it needs");
    if (t.id === "render" && (p.kind === "api-server" || p.kind === "fullstack")) (score += 3), reasons.push("connects to your GitHub repo and has a free option");
    if (t.id === "render" && p.db?.kind === "postgres") (score += 1), reasons.push("offers PostgreSQL");
    if (t.id === "fly" && p.db?.kind === "sqlite") (score += 3), reasons.push("has volumes, so a SQLite file can survive restarts");
    if (t.id === "heroku" && p.configs.some((c) => c.target === "heroku")) score += 2;
    if ((t.id === "pypi" && p.runtime === "python") || (t.id === "npm" && p.runtime === "node")) (score += 5), reasons.push(`it's how ${p.runtime === "python" ? "Python" : "JavaScript"} tools are shared`);
    if (t.id === "docker" && !p.configs.some((c) => c.target === "docker")) score -= 1;
    if (t.id === "heroku" && !reasons.length) score -= 0.5; // no free plan
    out.push({ target: t, score, reasons, configured: cfg?.path });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

export interface DeployStep {
  title: string;
  why: string;
  command?: string; // one line the student types
  link?: string;
}

/** The steps for one host, filled in from what the repo says. Written for someone who has never deployed. */
export function deploySteps(p: AppProfile, t: Target): DeployStep[] {
  const steps: DeployStep[] = [];
  const env = p.env.map((e) => e.name);
  const startCmd =
    p.start ??
    (p.runtime === "python" && p.entryModule
      ? p.frameworks.includes("fastapi")
        ? `uvicorn ${p.entryModule} --host 0.0.0.0 --port $PORT`
        : `gunicorn ${p.entryModule}`
      : p.runtime === "node"
        ? "npm start"
        : p.runtime === "go"
          ? "./app"
          : undefined);
  const needsGunicorn = p.runtime === "python" && startCmd?.startsWith("gunicorn");
  const needsUvicorn = p.runtime === "python" && startCmd?.startsWith("uvicorn");

  if (t.id === "pypi" || t.id === "npm") {
    steps.push({ title: "Choose a name and a version", why: `The name must be free on ${t.name}; every release needs a new version number.`, link: t.docs });
    if (t.id === "pypi") {
      steps.push({ title: "Build the package", why: "This makes the files that get uploaded (a wheel and a source archive) in `dist/`.", command: "python -m build" });
      steps.push({ title: "Upload it, to TestPyPI first", why: "TestPyPI is a practice copy of PyPI, so a mistake there costs nothing. Then upload to the real one.", command: "python -m twine upload --repository testpypi dist/*" });
    } else {
      steps.push({ title: "Check what will be published", why: "`npm pack` shows exactly which files go into the package, so nothing private slips in.", command: "npm pack --dry-run" });
      steps.push({ title: "Log in and publish", why: "Publishing makes the package public for everyone.", command: "npm publish" });
    }
    steps.push({ title: "Install it somewhere fresh to test", why: "A new folder or virtual environment shows whether it works for someone who isn't you.", command: t.id === "pypi" ? "pip install <your-package-name>" : "npx <your-package-name>" });
    return steps;
  }

  const staticHost = ["netlify", "github-pages", "cloudflare-pages"].includes(t.id) || (t.id === "vercel" && (p.kind === "spa" || p.kind === "static-site"));
  steps.push({ title: "Push your code to GitHub", why: "Hosts deploy from your repository, so what they run is exactly what you committed.", command: "git push" });
  if (t.id === "github-pages") {
    steps.push({ title: "Turn on Pages with GitHub Actions", why: "In the repo's Settings → Pages, choose \"GitHub Actions\" as the source. A workflow then builds and publishes the site on every push.", link: t.docs });
    if (p.build) steps.push({ title: "Use the static site workflow for your build", why: `The workflow runs \`${p.build}\` and publishes the \`${p.outDir ?? "dist"}\` folder. GitHub suggests a starter workflow for most tools.`, link: "https://docs.github.com/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages" });
    if (p.frameworks.includes("vite")) steps.push({ title: "Set the base path", why: "Project sites are served at `/<repo-name>/`, so the app must be built with that as its base path or the page loads blank. In Vite it's the `base` option.", link: "https://vite.dev/guide/static-deploy" });
    return steps.concat(watchSteps(p, t));
  }
  steps.push({ title: `Create a project on ${t.name} and connect the repository`, why: "From then on, every push to your main branch deploys automatically.", link: t.docs, command: t.id === "fly" ? "fly launch" : t.id === "heroku" ? "heroku create" : t.id === "railway" ? "railway link" : undefined });
  if (staticHost) {
    if (p.build) steps.push({ title: `Build command: \`${p.build}\``, why: "The host runs this to turn your source into plain HTML, CSS and JavaScript." });
    steps.push({ title: `Folder to publish: \`${p.outDir ?? "dist"}\``, why: "That's where the build puts the finished site; the host serves what's in it." });
    if (p.kind === "spa") steps.push({ title: "Send every address to index.html", why: "A single-page app handles its own addresses in the browser. Without a rewrite rule, refreshing a page like /about shows a 404.", link: t.id === "netlify" ? "https://docs.netlify.com/routing/redirects/rewrites-proxies/#history-pushstate-and-single-page-apps" : t.docs });
  } else if (p.startFrom && /dockerfile$/i.test(p.startFrom) && ["fly", "cloud-run", "docker", "render", "railway"].includes(t.id)) {
    steps.push({ title: `It builds from your \`${p.startFrom}\``, why: `${t.name} builds the container your Dockerfile describes and runs its \`CMD\`, so there's no separate build or start command to type.`, command: t.id === "cloud-run" ? "gcloud run deploy --source ." : t.id === "docker" ? "docker build -t app ." : t.id === "fly" ? "fly deploy" : undefined });
  } else {
    if (p.build && p.runtime === "node") steps.push({ title: `Build command: \`npm ci && ${p.build}\``, why: "`npm ci` installs exactly the locked versions; then the build runs." });
    else if (p.build && p.runtime === "go") steps.push({ title: `Build command: \`${p.build}\``, why: "It compiles your Go code into one program file the host runs." });
    else if (p.runtime === "node") steps.push({ title: "Build command: `npm ci`", why: "It installs exactly the versions in your lockfile." });
    else if (p.runtime === "python") steps.push({ title: "Build command: `pip install -r requirements.txt`", why: "It installs the packages your code imports." });
    if (startCmd) steps.push({ title: `Start command: \`${startCmd}\``, why: p.start ? `That's how ${p.startFrom ? `\`${p.startFrom}\`` : "the repo"} says to start it.` : "This starts your app the way production servers do." });
    if (needsGunicorn) steps.push({ title: "Add `gunicorn` to requirements.txt", why: "gunicorn is the production web server for Flask and Django apps; the host only has it if it's listed." });
    if (needsUvicorn) steps.push({ title: "Make sure `uvicorn` is in requirements.txt", why: "uvicorn is the server that runs FastAPI apps; the host only has it if it's listed." });
  }
  if (env.length)
    steps.push({
      title: `Set the environment variables: ${env.map((n) => `\`${n}\``).join(", ")}`,
      why: `Your code reads ${env.length === 1 ? "this" : "these"} at startup. Add each one in the host's settings (never in the code), with the value for production.`,
      command: t.id === "fly" ? `fly secrets set ${env[0]}=...` : t.id === "heroku" ? `heroku config:set ${env[0]}=...` : t.id === "vercel" ? `vercel env add ${env[0]}` : undefined,
    });
  if (p.db && p.db.kind !== "sqlite") steps.push({ title: `Create a ${p.db.kind === "postgres" ? "PostgreSQL" : p.db.kind} database`, why: `Your app talks to ${p.db.kind}. Create one on ${t.name} (or another provider) and put its connection address in the environment variable your code reads.`, link: t.docs });
  if (p.db && (p.db.kind === "postgres" || p.db.kind === "mysql")) steps.push({ title: "Create the tables", why: "A new database starts empty. Run your migrations once against it (many hosts let you set a \"release\" or \"pre-deploy\" command for this)." });
  if (p.db?.kind === "sqlite") steps.push({ title: "Decide where the data lives", why: t.id === "fly" ? "Create a volume and keep the SQLite file on it, so it survives restarts." : "This host's disk is wiped on each deploy, so a SQLite file loses its data. Switch to a hosted database before real users arrive.", command: t.id === "fly" ? "fly volumes create data --size 1" : undefined });
  return steps.concat(watchSteps(p, t));
}

function watchSteps(p: AppProfile, t: Target): DeployStep[] {
  return [
    { title: "Deploy, then open the logs", why: "If something's wrong, the first error in the logs nearly always says what. Read it top to bottom before changing anything.", command: t.id === "fly" ? "fly logs" : t.id === "heroku" ? "heroku logs --tail" : undefined },
    { title: "Open the address and try the main feature", why: p.kind === "api-server" ? "Call one route the way a real client would (the browser for a GET, or a tool like curl)." : "Click through what a user would do, and check something gets saved if it should." },
  ];
}

export interface Failure {
  symptom: string; // what you see
  meaning: string;
  check: string; // what to check, in words
}

/** The most likely things to go wrong, for this kind of app on this kind of host. */
export function likelyFailures(p: AppProfile, t: Target): Failure[] {
  const out: Failure[] = [];
  const web = ["api-server", "fullstack", "ssr-web"].includes(p.kind);
  if (web && t.id !== "vercel" && t.id !== "netlify")
    out.push({ symptom: "The deploy times out, or says no open port was detected", meaning: "The host couldn't reach your server.", check: "Does the server listen on the `PORT` environment variable, on `0.0.0.0`?" });
  if (p.runtime === "node") out.push({ symptom: "`Error: Cannot find module '…'`", meaning: "A package the code needs wasn't installed on the host.", check: "Is it in `dependencies` (not only `devDependencies`) in `package.json`, and is the lockfile committed?" });
  if (p.runtime === "python") out.push({ symptom: "`ModuleNotFoundError: No module named '…'`", meaning: "A package the code imports isn't in `requirements.txt`.", check: "Add the missing package to `requirements.txt` and deploy again." });
  if (p.env.length) out.push({ symptom: "It crashes at startup with `KeyError`, `undefined`, or \"missing environment variable\"", meaning: "An environment variable isn't set on the host.", check: `Are ${p.env.map((e) => `\`${e.name}\``).slice(0, 4).join(", ")} all set in the host's settings?` });
  if (p.db && p.db.kind !== "sqlite") out.push({ symptom: "`ECONNREFUSED 127.0.0.1:5432` or \"connection refused\"", meaning: "The app is trying to reach a database on its own machine, so the database address isn't set.", check: "Is the database URL environment variable set to the hosted database's address?" });
  if (p.kind === "spa") out.push({ symptom: "The home page works, but refreshing any other page shows 404", meaning: "The host is looking for a file for that address, but it only exists inside your app.", check: "Is there a rewrite rule sending every address to `index.html`?" });
  if (p.kind === "spa" || p.kind === "static-site") out.push({ symptom: "A blank page, with 404s for the JavaScript files in the browser console", meaning: "The app was built for a different base path than where it's served.", check: "Does the build's base path match the address (for example `/<repo-name>/` on GitHub Pages)?" });
  return out.slice(0, 4);
}

/** True for the docs and pricing pages in this catalog (and the step links), so the board may open them. */
export function isDeployLink(url: string): boolean {
  const known = [...TARGETS.flatMap((t) => [t.docs, t.pricing]), "https://docs.github.com/pages/", "https://vite.dev/guide/static-deploy", "https://docs.netlify.com/routing/", "https://packaging.python.org/"];
  return /^https:\/\//.test(url) && known.some((k) => url === k || url.startsWith(k.replace(/\/?$/, "/")));
}
