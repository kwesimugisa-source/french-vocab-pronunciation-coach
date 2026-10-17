const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {preparePackage,generatePackage}=require('../scripts/theatre-pronunciation-experiment.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
test('offline fixture and anonymous package; exactly 36 attempts, no retries or credential capture',async()=>{
 const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cp12a-mock-')),'package');
 const prepared=await preparePackage(out);assert.equal(prepared.clips,36);assert.ok(prepared.voice);const file=path.join(out,'answer-key','manifest.json');
 const manifest=read(file);assert.equal(manifest.entries.length,36);assert.equal(new Set(manifest.entries.map(e=>e.clipId)).size,36);assert.ok(manifest.entries.every(e=>e.request.instructions.length<=3800));
 let calls=0;const speech=async(body,options)=>{calls++;assert.equal(options.maxRetries,0);assert.equal(options.timeout,55000);if(calls===2)throw Error('SECRET_PROVIDER_CREDENTIAL');return {arrayBuffer:async()=>Buffer.from('mock-audio-'+calls)};};
 const summary=await generatePackage(out,speech);assert.equal(calls,36);assert.equal(summary.completed,35);assert.equal(summary.failed,1);assert.ok(summary.groups.every(g=>g.requestHashes===1));
 await generatePackage(out,()=>assert.fail('attempted calls must never repeat'));assert.equal(read(path.join(out,'call-ledger.json')).attempts.length,36);
 for(const name of ['manifest.json','summary.json'])assert.doesNotMatch(fs.readFileSync(path.join(out,'answer-key',name),'utf8'),/SECRET_PROVIDER_CREDENTIAL|authorization|sceneToken|apiKey/);
 const html=fs.readFileSync(path.join(out,'LISTEN.html'),'utf8');assert.doesNotMatch(html,/isolated-exclamation|naturel|clarte|Thomas/);assert.equal((html.match(/<audio /g)||[]).length,36);
 await assert.rejects(preparePackage(out),/already exists/);
});
test('experiment refuses frozen-body tampering before any synthesis',async()=>{
 const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cp12a-mock-')),'package');await preparePackage(out);const file=path.join(out,'answer-key','manifest.json'),m=read(file);m.entries[0].request.speed=.7;fs.writeFileSync(file,JSON.stringify(m));
 await assert.rejects(generatePackage(out,()=>assert.fail('no call allowed')),/Frozen request changed/);assert.equal(read(path.join(out,'call-ledger.json')).attempts.length,0);
});
test('experiment refuses repository artifact storage',async()=>{await assert.rejects(preparePackage(path.join(__dirname,'..','generated-audio')),/outside/);});
