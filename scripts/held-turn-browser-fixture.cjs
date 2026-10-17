// Provider-free UI acceptance fixture. Binds loopback only, serves no credentials
// or arbitrary files, and is never referenced by production routes/builds.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),modules=new Map();
function collect(file){
 file=path.resolve(file);if(modules.has(file))return;modules.set(file,'');
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const replaced=code.replace(/require\("([^"]+)"\)/g,(original,name)=>{
  if(!name.startsWith('.')&&!name.startsWith('@/'))return original;
  const base=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(file),name);
  const resolved=/\.tsx?$/.test(base)?base:fs.existsSync(base+'.ts')?base+'.ts':base+'.tsx';collect(resolved);return `require(${JSON.stringify(resolved)})`;
 });modules.set(file,replaced);
}
async function main(){
 const entry=path.join(root,'tests/held-turn-browser-fixture.tsx');collect(entry);
 const css=await require('postcss')([require('tailwindcss')({content:[path.join(root,'components/**/*.tsx'),entry],theme:{extend:{}}})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined});
 const bundle=`const modules={${[...modules].map(([id,code])=>`${JSON.stringify(id)}:(module,exports,require)=>{${code}\n}`).join(',')}};const cache={};function require(id){if(id==='react')return React;if(id==='react/jsx-runtime')return {jsx:(t,p,k)=>React.createElement(t,{...p,key:k}),jsxs:(t,p,k)=>React.createElement(t,{...p,key:k}),Fragment:React.Fragment};if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(require(${JSON.stringify(entry)}).default));`;
 const assets={'/react.js':fs.readFileSync(path.join(root,'node_modules/react/umd/react.development.js')),'/react-dom.js':fs.readFileSync(path.join(root,'node_modules/react-dom/umd/react-dom.development.js')),'/fixture.js':bundle,'/style.css':css.css};
 http.createServer((req,res)=>{res.setHeader('Cache-Control','no-store');if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><title>CP2 fixture</title><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script src="/fixture.js"></script></html>');}else if(Object.hasOwn(assets,req.url)){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(assets[req.url]);}else{res.statusCode=404;res.end();}}).listen(3102,'127.0.0.1',()=>console.log('Provider-free fixture: http://127.0.0.1:3102'));
}
main().catch(()=>{console.error('Fixture could not start');process.exitCode=1;});
