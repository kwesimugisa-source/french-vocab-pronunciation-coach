// Compile source in memory with the existing TypeScript dependency. No emitted
// build files, extra test framework, network access or real OpenAI client needed.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

module.exports = function createLoader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    cache.set(filename, loaded);
    loaded.require = (name) => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.startsWith(".")) {
        const resolved = path.resolve(path.dirname(filename), name);
        return load(resolved.endsWith(".ts") ? resolved : `${resolved}.ts`);
      }
      return require(name);
    };
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    });
    loaded._compile(compiled.outputText, filename);
    return loaded.exports;
  }
  return load;
};
