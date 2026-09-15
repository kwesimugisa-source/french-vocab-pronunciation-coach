const createLoader = require("./load-typescript.cjs");
const load = createLoader();
const { parseTheatreItems } = load("lib/theatre.ts");
const { TheatrePlaybackController } = load("lib/theatre-playback.ts");

const source = "(Le rideau se lève.)\nNORA: Bonjour.\nSAMIR: Salut.\n(Nora sourit.)\nNORA: Au revoir.\nCHŒUR: Ensemble !";
function scene(text = source) {
  const items = parseTheatreItems(text);
  return {
    mode: "theatre",
    integrity: { version: 1, parsedItemCount: items.length, expectedItemIds: items.map((item) => item.id), generatedClipCount: items.length },
    clips: items.map((item) => ({ ...item, voice: "alloy", speed: 1, audioBase64: Buffer.from(item.text).toString("base64") })),
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function environment() {
  const audios = [], created = [], revoked = [], timers = new Map();
  let timerId = 0;
  const env = {
    audios, created, revoked, timers, nextPlay: null,
    createUrl(blob) { const url = `blob:test-${created.length}`; created.push({ url, blob }); return url; },
    revokeUrl(url) { revoked.push(url); },
    setTimer(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimer(id) { timers.delete(id); },
    createAudio(url) {
      const audio = {
        url, currentTime: 0, ended: false, onended: null, onerror: null, ontimeupdate: null,
        playCalls: 0, pauseCalls: 0, loadCalls: 0, removed: false,
        playResult: env.nextPlay,
        play() { this.playCalls++; return this.playResult || Promise.resolve(); },
        pause() { this.pauseCalls++; },
        removeAttribute(name) { if (name === "src") this.removed = true; },
        load() { this.loadCalls++; },
        end() { this.ended = true; this.onended?.(new Event("ended")); },
        fail() { this.onerror?.(new Event("error")); },
        progress(time) { this.currentTime = time; this.ontimeupdate?.(new Event("timeupdate")); },
      };
      env.nextPlay = null;
      audios.push(audio);
      return audio;
    },
    latest() { return audios.at(-1); },
    expire() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); },
  };
  return env;
}
function setup(text = source) {
  const env = environment();
  const controller = new TheatrePlaybackController(env);
  const sessionId = controller.beginLoading();
  const data = scene(text);
  controller.acceptScene(sessionId, data, text);
  return { env, controller, data, sessionId };
}
module.exports = { source, scene, deferred, flush, environment, setup, load };
