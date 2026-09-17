const test = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("./load-typescript.cjs");
const { deferred, flush } = require("./playback-fixtures.cjs");
const { generatedDocument } = createLoader()("lib/content-document.ts");

// Execute Page's actual handlers with controlled hooks and service boundaries.
// This is a component-wiring test, not a browser/audio substitute.
function harness() {
  let cursor = 0, tree;
  const slots = [], effects = [], alerts = [], plays = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const [value] = react.useState(() => ({ current: initial })); return value; },
    useMemo(fn) { return fn(); },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((d, n) => !Object.is(d, previous.deps[n]))) {
        previous?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); });
      }
    },
  };
  let playback, pronunciation;
  class Playback {
    constructor() { playback = this; this.snapshot = { mode: null, busy: false, error: null, ambience: {}, theatre: { practiceTarget: null, queue: [] } }; this.theatre = { getSnapshot: () => this.snapshot.theatre }; }
    subscribe = () => () => {};
    getSnapshot = () => this.snapshot;
    stop() { this.snapshot.mode = null; this.snapshot.busy = false; }
    start(text, speed, identity) { plays.push({ text, speed, identity }); this.snapshot.mode = identity.contentType === "theatre" ? "theatre" : "ordinary"; this.snapshot.busy = true; }
    beginMicrophoneCapture = () => () => {};
  }
  class Pronunciation {
    constructor() { pronunciation = this; this.snapshot = { status: "idle", recording: null, feedback: null }; this.resets = 0; }
    subscribe = () => () => {};
    getSnapshot = () => this.snapshot;
    isBusy() { return this.snapshot.status === "recording"; }
    reset() { this.resets++; this.snapshot = { status: "idle", recording: null, feedback: null }; }
    start(target) { this.snapshot.status = "recording"; this.snapshot.target = target; }
    stop() { this.snapshot.status = "recorded"; this.snapshot.recording = { target: this.snapshot.target, blob: new Blob(["recording"]) }; }
  }
  const overrides = { react, "@/lib/reading-playback": { ReadingPlaybackSession: Playback }, "@/lib/pronunciation-session": { PronunciationSession: Pronunciation } };
  for (const name of ["BetaDiagnostics", "article-reader/PreparationNotice", "article-reader/ArticleHeader", "article-reader/ArticleTextPanel", "article-reader/ReadingControls", "article-reader/ReadingSetupBar", "article-reader/TheatreControls", "article-reader/TongueTwisterPractice", "layout/AppShell", "pronunciation/PronunciationSummary", "pronunciation/WeakPointsPanel", "vocabulary/WordInsightPanel"])
    overrides[`@/components/${name}`] = name.split("/").at(-1);
  const loader = createLoader(overrides), Page = loader("app/page.tsx").default;
  function render() { cursor = 0; tree = Page(); effects.splice(0).forEach(fn => fn()); return tree; }
  function nodes(value) { return Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === "object" ? [value, ...nodes(value.props?.children)] : []; }
  function find(type, predicate = () => true) { return nodes(tree).find(n => n.type === type && predicate(n.props))?.props; }
  const oldAlert = global.alert; global.alert = message => alerts.push(message);
  render();
  return { render, find, alerts, plays, journal: loader("lib/beta-events.ts").betaJournal, get playback() { return playback; }, get pronunciation() { return pronunciation; },
    document: () => find("ArticleHeader").article,
    setup: () => find("ReadingSetupBar"),
    import(text) {
      if (!find("textarea")) { find("button", p => /Importer un texte/.test(p.children)).onClick(); render(); }
      find("textarea").onChange({ target: { value: text } }); render();
      find("button", p => /Charger le texte/.test(p.children)).onClick(); render();
    },
    dispose() { slots.forEach(s => s?.cleanup?.()); global.alert = oldAlert; },
  };
}
const makeDoc = (type, level = "A1") => generatedDocument({ title: "Test", text: type === "theatre" ? "NORA: Bonjour.\nSAMIR: Salut." : "Le chat dort. Un chat joue." }, type, level, `generated-${type}`);

test("Conversation page displays original labels but records only spoken dialogue; malformed structure never opens microphone", () => {
  const h = harness();
  try {
    const raw = "Marie : Bonjour, comment allez-vous ?\nDavid : Très bien, merci. Et vous ?\nMarie : Je vais très bien.";
    h.import(raw);
    assert.equal(h.document().contentType, "conversation"); assert.equal(h.document().text, raw);
    h.find("ReadingControls").onStartReading(); h.render();
    assert.equal(h.pronunciation.snapshot.target.text, "Bonjour, comment allez-vous ?\nTrès bien, merci. Et vous ?\nJe vais très bien.");
    assert.equal(h.find("TheatreControls"), undefined);
    h.import("Marie : Bonjour.\nUne ligne sans étiquette.");
    h.find("select", p => p["aria-label"] === "Type du texte importé").onChange({ target: { value: "conversation" } }); h.render();
    h.find("ReadingControls").onStartReading(); h.render();
    assert.equal(h.pronunciation.snapshot.status, "idle"); assert.match(h.alerts.at(-1), /mal structurée/);
  } finally { h.dispose(); }
});

for (const [from, to] of [["news", "poetry"], ["poetry", "theatre"], ["conversation", "theatre"], ["theatre", "conversation"]])
  test(`page ${from} → next selector ${to} retains active type/level and downstream identity`, async () => {
    const h = harness(), priorFetch = global.fetch, doc = makeDoc(from);
    global.fetch = async () => Response.json(doc);
    try {
      h.setup().onContentTypeChange(from); h.setup().onLevelChange("A1"); h.render(); await h.setup().onGenerateArticle(); h.render();
      h.setup().onContentTypeChange(to); h.setup().onLevelChange("C1"); h.setup().onReadingSpeedChange("slow"); h.render();
      assert.equal(h.document().contentType, from); assert.equal(h.document().level, "A1");
      h.setup().onPlayAudio(); assert.equal(h.plays[0].identity.contentType, from); assert.equal(h.plays[0].identity.level, "A1"); assert.equal(h.plays[0].speed, "slow");
      assert.equal(h.find("TheatreControls"), undefined); // render preceding initialization has no queue controls
      h.render(); assert.equal(!!h.find("TheatreControls"), from === "theatre");
      h.setup().onPlayAudio(); h.render(); assert.equal(h.playback.snapshot.busy, false);
    } finally { h.dispose(); global.fetch = priorFetch; }
  });
test("page import/reinterpret/replace invalidates services and shows theatre before Play", () => {
  const h = harness();
  try {
    h.import("(La porte s’ouvre.)\nNORA\nBonjour.\nSAMIR\nSalut.");
    assert.equal(h.document().contentType, "theatre"); assert.equal(h.document().level, undefined);
    assert.ok(h.find("section", p => p.children?.some?.(c => c?.type === "h2" && c.props.children === "Lecture théâtrale")));
    assert.equal(h.find("TheatreControls"), undefined);
    h.setup().onPlayAudio(); h.render(); assert.ok(h.find("TheatreControls"));
    const revision = h.document().revision;
    h.find("select", p => p["aria-label"] === "Type du texte importé").onChange({ target: { value: "conversation" } }); h.render();
    assert.equal(h.document().revision, revision + 1); assert.equal(h.document().contentType, "conversation"); assert.equal(h.find("TheatreControls"), undefined); assert.equal(h.playback.snapshot.busy, false);
    h.import("Un petit texte ordinaire."); assert.equal(h.document().contentType, "unknown");
  } finally { h.dispose(); }
});
test("page keeps same-document recording when listening but resets on replacement", () => {
  const h = harness();
  try {
    h.find("ReadingControls").onStartReading(); h.render(); assert.equal(h.setup().audioDisabled, true);
    h.find("ReadingControls").onStopReading(); h.render();
    const recording = h.pronunciation.snapshot.recording, resets = h.pronunciation.resets;
    h.setup().onPlayAudio(); h.render(); assert.equal(h.pronunciation.snapshot.recording, recording); assert.equal(h.pronunciation.resets, resets);
    h.import("Bonjour les amis."); assert.equal(h.pronunciation.snapshot.recording, null); assert.ok(h.pronunciation.resets > resets);
    h.find("ReadingControls").onStartReading(); h.render(); h.import("Une autre lecture."); assert.equal(h.pronunciation.snapshot.status, "idle");
  } finally { h.dispose(); }
});
test("page rapid clicks and replacement discard obsolete vocabulary updates", async () => {
  const h = harness(), priorFetch = global.fetch, requests = [deferred(), deferred(), deferred()]; let count = 0; const bodies = [];
  global.fetch = (_url, options) => { bodies.push(JSON.parse(options.body)); return requests[count++].promise; };
  try {
    h.import("Le chat dort. Un chat joue.");
    const a = h.find("ArticleTextPanel").onWordClick("chat", 3);
    const b = h.find("ArticleTextPanel").onWordClick("chat", 16);
    requests[1].resolve(Response.json({ word: "chat", usage: "new" })); await b;
    requests[0].resolve(Response.json({ word: "chat", usage: "old" })); await a; h.render();
    assert.equal(h.find("WordInsightPanel").selectedWord.usage, "new"); assert.equal(bodies[1].sentence, "Un chat joue."); assert.equal(bodies[1].level, "unknown");
    const c = h.find("ArticleTextPanel").onWordClick("chat", 3); h.import("Un nouveau passage.");
    requests[2].resolve(Response.json({ word: "old" })); await c; h.render(); assert.equal(h.find("WordInsightPanel").selectedWord, null);
  } finally { h.dispose(); global.fetch = priorFetch; }
});
test("page failed/malformed generation preserves document; import wins a pending generation", async () => {
  const h = harness(), priorFetch = global.fetch;
  try {
    h.import("Un texte à conserver."); const original = h.document();
    for (const result of [new Response("failed", { status: 500 }), Response.json({ title: "Broken", text: 4 })]) {
      global.fetch = async () => result; await h.setup().onGenerateArticle(); h.render(); assert.equal(h.document(), original);
    }
    assert.equal(h.alerts.length, 2);
    const pending = deferred(); global.fetch = () => pending.promise;
    const generation = h.setup().onGenerateArticle(); h.import("Un texte plus récent.");
    pending.resolve(Response.json(makeDoc("news", "B1"))); await generation; h.render(); assert.equal(h.document().text, "Un texte plus récent.");
  } finally { h.dispose(); global.fetch = priorFetch; }
});
test("page generation after import stores requested identity even if selectors change in flight", async () => {
  const h = harness(), priorFetch = global.fetch, pending = deferred(); global.fetch = () => pending.promise;
  try {
    h.import("Bonjour le monde."); h.setup().onContentTypeChange("poetry"); h.setup().onLevelChange("A1"); h.render();
    const generation = h.setup().onGenerateArticle(); h.setup().onContentTypeChange("theatre"); h.setup().onLevelChange("C1"); h.render();
    pending.resolve(Response.json(makeDoc("poetry"))); await generation; h.render();
    assert.equal(h.document().contentType, "poetry"); assert.equal(h.document().level, "A1"); assert.equal(h.setup().contentType, "theatre");
  } finally { h.dispose(); global.fetch = priorFetch; }
});

test("Virelangues page retains generated sound, shares contextual speed and records selected sentence", async () => {
  const h = harness(), priorFetch = global.fetch, requests = [];
  const { soundTarget } = createLoader()("lib/tongue-twisters.ts");
  const doc = generatedDocument({ title: "R", text: "Trois gros rats gris.\n\nRare rire, rude rire !" }, "tongue-twisters", "A1", "sounds");
  doc.tongueTwisters.target = soundTarget({ id: "r" }); doc.tongueTwisters.exercises.forEach(e => e.target = doc.tongueTwisters.target);
  global.fetch = async (_url, options) => { requests.push(JSON.parse(options.body)); return Response.json(doc); };
  try {
    h.setup().onContentTypeChange("tongue-twisters"); h.setup().onLevelChange("A1"); h.setup().onTargetSoundChange("r"); h.render();
    await h.setup().onGenerateArticle(); h.render(); assert.equal(requests[0].targetSound.id, "r");
    h.setup().onTargetSoundChange("on"); h.render(); assert.equal(h.document().tongueTwisters.target.id, "r");
    assert.equal(h.setup().hideAudio, true); assert.equal(h.find("ReadingControls"), undefined); assert.equal(h.find("TheatreControls"), undefined);
    const second = h.document().tongueTwisters.exercises[1];
    h.find("TongueTwisterPractice").onSelect(second.id); h.render(); assert.equal(h.pronunciation.snapshot.status, "idle");
    for (const speed of ["very-slow", "slow", "normal", "fast"]) {
      h.find("TongueTwisterPractice").onSpeedChange(speed); h.render(); assert.equal(h.setup().readingSpeed, speed);
      h.find("TongueTwisterPractice").onListen(second.id); await flush(); assert.equal(h.plays.at(-1).speed, speed); assert.equal(h.plays.at(-1).text, second.text);
    }
    h.find("TongueTwisterPractice").onRecord(); h.render(); assert.equal(h.pronunciation.snapshot.target.text, second.text);
    h.find("TongueTwisterPractice").onStopRecording(); h.render();
    h.import("Une lecture ordinaire."); assert.equal(h.find("TongueTwisterPractice"), undefined); assert.ok(h.find("ReadingControls")); assert.equal(h.pronunciation.snapshot.recording, null);
  } finally { h.dispose(); global.fetch = priorFetch; }
});
test("custom sound validation prevents generation without replacing active document", async () => {
  const h = harness(), priorFetch = global.fetch; let calls = 0; global.fetch = async () => { calls++; throw new Error("should not call"); };
  try {
    const old = h.document(); h.setup().onContentTypeChange("tongue-twisters"); h.setup().onTargetSoundChange("custom"); h.setup().onCustomSoundChange("<instructions>"); h.render();
    await h.setup().onGenerateArticle(); h.render(); assert.equal(calls, 0); assert.equal(h.document(), old); assert.equal(h.alerts.length, 1);
  } finally { h.dispose(); global.fetch = priorFetch; }
});

test("CP4.4 generation feedback begins immediately, blocks duplicates and ignores stale completion", async () => {
  const h=harness(), before=global.fetch, pending=[deferred(),deferred()]; let count=0;
  global.fetch=()=>pending[count++].promise;
  try {
    const first=h.setup().onGenerateArticle(); h.render();
    assert.equal(h.setup().isGenerating,true); assert.equal(h.find("PreparationNotice",p=>p.label==="Préparation du texte…").label,"Préparation du texte…");
    await h.setup().onGenerateArticle(); assert.equal(count,1);
    h.import("Nouveau texte."); const second=h.setup().onGenerateArticle(); h.render();
    pending[0].resolve(Response.json(makeDoc("news","B1"))); await first; h.render(); assert.equal(h.setup().isGenerating,true);
    pending[1].resolve(Response.json(makeDoc("news","B1"))); await second; h.render(); assert.equal(h.setup().isGenerating,false);
    assert.equal(h.journal.inspect().filter(e=>e.name==="document_created").length,1);
    assert.equal(h.journal.inspect().filter(e=>e.name==="operation"&&e.status==="completed").length,1);
  } finally {h.dispose();global.fetch=before;}
});

test("CP4.4 generation 429 preserves active document and emits normalized failure", async()=>{
  const h=harness(), before=global.fetch; global.fetch=async()=>new Response("SENSITIVE",{status:429});
  try {
    const original=h.document(); await h.setup().onGenerateArticle(); h.render();
    assert.equal(h.document(),original); assert.equal(h.setup().isGenerating,false); assert.match(h.alerts.at(-1),/Trop de demandes/);
    assert.equal(h.journal.inspect().find(e=>e.status==="failed").code,"RATE_LIMITED");
    assert.doesNotMatch(JSON.stringify(h.journal.inspect()),/SENSITIVE/);
  } finally {h.dispose();global.fetch=before;}
});

test("CP4.4 Theatre replay/practice events keep opaque document metadata without dialogue",()=>{
  const h=harness();
  try {
    h.import("(La porte s’ouvre.)\nNORA: Bonjour.\nSAMIR: Salut."); h.setup().onPlayAudio(); h.render();
    h.playback.theatre.replay=()=>{}; h.playback.theatre.enterPractice=()=>true;
    h.find("TheatreControls").onReplay(); h.find("TheatreControls").onPractise("line-2");
    const recorded=h.journal.inspect().filter(e=>["theatre_replay","theatre_practice"].includes(e.name));
    assert.equal(recorded.length,2); assert.ok(recorded.every(e=>e.contentType==="theatre" && e.revision===1));
    assert.notEqual(recorded[0].documentId,h.document().documentId); assert.doesNotMatch(JSON.stringify(recorded),/NORA|Bonjour/);
  } finally {h.dispose();}
});
