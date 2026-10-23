const test=require('node:test'),assert=require('node:assert/strict');
const createLoader=require('./load-typescript.cjs');
const {harness,request,until,tick}=require('./incremental-fixtures.cjs');
const {answer,proposalFor}=require('./pronunciation-review-fixture.cjs');
const {environment,deferred}=require('./playback-fixtures.cjs');
const {analysisFor,planFor}=require('./director-fixtures.cjs');
const load=createLoader(),pron=load('lib/theatre-pronunciation.ts'),auth=load('lib/theatre-pronunciation-authority.ts');
const parse=load('lib/theatre.ts').parseTheatreItems;
const entry=(name,extra={})=>({id:name.replace(/[^a-zA-Z0-9]/g,'_'),name,aliases:[],classification:'french-convention',language:'fr',target:'Confirmed conventional French reading.',evidence:[],...extra});
const text='THOMAS: Thomas ?\nJULIEN: Thomas !\nÉLISE: Thomas.\nÉLISE: Thomas...\nÉLISE: Thomas ?\n[Thomas regarde sa serviette soigneusement pliée devant lui.]\nLE CHŒUR: Thomas, nous sommes ici.\nJULIEN: James nous attend.';
const body={text,speed:'normal',language:'fr',contentType:'theatre',documentId:'authority',revision:1,performanceStyle:'naturel'};
async function draft(h,extra={}){const r=await h.rawPrepare(request({...body,...extra}));assert.equal(r.status,200);return r.json();}
async function accept(h,d,extra={}){const r=await h.rawPrepare(request({...body,pronunciationToken:d.pronunciationToken,pronunciationAnswer:answer(d.entries),...extra}));assert.equal(r.status,200);return r.json();}
function gateSession(h,fetcher){h.session.dispose();return new (h.load('lib/reading-playback.ts').ReadingPlaybackSession)(h.env,fetcher??((url,opts)=>(url.includes('theatre-clip')?h.clip:h.rawPrepare)(new Request('http://localhost'+url,opts))));}

test('raw preparation HOLD has no playable manifest, audio or model acceptance; draft cannot synthesize',async()=>{
 const h=harness(),d=await draft(h);assert.equal(d.mode,'pronunciation-clarification');assert.equal(d.sceneToken,undefined);assert.equal(d.clips,undefined);assert.equal(h.stats.calls.length,0);assert.equal(h.stats.analyses,1);
 assert.ok(d.entries.some(e=>e.name==='THOMAS'&&e.classification==='uncertain'));
 const r=await h.clip(request({sceneToken:d.pronunciationToken,itemId:'item-0',componentIndex:0}));assert.equal(r.status,409);assert.equal(h.stats.calls.length,0);
 for(const bad of [{inventoryReviewed:false,entries:[]},{inventoryReviewed:true,entries:d.entries},{inventoryReviewed:true,entries:[]}]){
  const r=await h.rawPrepare(request({...body,pronunciationToken:d.pronunciationToken,pronunciationAnswer:bad}));assert.equal(r.status,400);
 }
 const m=await accept(h,d);assert.equal(m.protocol,'incremental-v1');assert.match(m.pronunciationDigest,/^[a-f0-9]{64}$/);assert.equal(h.stats.analyses,1);assert.equal(h.stats.calls.length,0);
});

test('accepted decisions reach every actor, narrator and chorus component without changing input/voice/speed',async()=>{
 const h=harness(),d=await draft(h),a=answer(d.entries);a.entries.push(entry('James',{classification:'preserved-foreign',language:'en',target:'Owner requests the conventional English name reading.'}));
 const m=await accept(h,d,{pronunciationAnswer:a});
 for(const item of m.clips)for(let componentIndex=0;componentIndex<(item.chorus?3:1);componentIndex++){
  const r=await h.clip(request({sceneToken:m.sceneToken,itemId:item.id,componentIndex,debug:true}));assert.equal(r.status,200);const data=await r.json(),b=h.stats.calls.at(-1).body;
  assert.equal(b.input,item.text);assert.equal(b.voice,item.chorus?.components[componentIndex].voice??item.voice);assert.equal(b.speed,item.speed);assert.equal(b.model,'gpt-4o-mini-tts');assert.ok(b.instructions.length<=3800);
  assert.match(b.instructions,/Accepted production pronunciation/);assert.equal(data.pronunciationDigest,m.pronunciationDigest);assert.equal(data.debug.pronunciation.acceptance,'owner-confirmed');
  assert.match(b.instructions,item.text.includes('James')?/"language":"en"/:/"language":"fr"/);
  if(item.text.includes('?'))assert.match(b.instructions,/interrogative/);
  assert.doesNotMatch(JSON.stringify(data.debug),/sceneToken|pronunciationToken|incremental-test-placeholder/);
 }
 assert.equal(h.stats.calls.length,10);assert.equal(h.stats.analyses,1);
});

test('ready authority survives Clarté/Naturel/speed reuse, including a fresh server worker',async()=>{
 const h=harness(),d=await draft(h),m=await accept(h,d),worker=harness();
 for(const performanceStyle of ['clarte','naturel'])for(const speed of ['slow','normal','fast']){
  const r=await worker.rawPrepare(request({...body,performanceStyle,speed,pronunciationToken:m.sceneToken}));assert.equal(r.status,200);const next=await r.json();assert.equal(next.pronunciationDigest,m.pronunciationDigest);assert.equal(next.performanceStyle,performanceStyle);
 }
 assert.equal(worker.stats.analyses,0);assert.equal(worker.stats.calls.length,0);
});

test('source revision/text/casting mismatch, forged/expired tokens and old ticket versions fail closed',async()=>{
 const h=harness(),d=await draft(h),ticket=h.load('lib/theatre-scene-ticket.ts');
 for(const extra of [{revision:2},{text:text+'\nJULIEN: Fin.'},{pronunciationToken:'forged'}, {theatreCharacters:[{speakerId:'THOMAS',displayName:'Thomas',voicePresentation:'masculine'}]}]){
  const r=await h.rawPrepare(request({...body,pronunciationToken:d.pronunciationToken,...extra}));assert.ok([400,410].includes(r.status));
 }
 const opened=ticket.openScene(d.pronunciationToken,'incremental-test-placeholder');
 const expired=ticket.sealScene(opened.plan,1,'incremental-test-placeholder',Date.now()-3*3600000);
 assert.equal((await h.rawPrepare(request({...body,pronunciationToken:expired}))).status,410);
 // Construct an authenticated v1 ticket: payload version is independently rejected.
 const {createHash,createCipheriv,randomBytes}=require('node:crypto'),{deflateRawSync}=require('node:zlib');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update('theatre-scene-v1\0incremental-test-placeholder').digest(),iv);cipher.setAAD(Buffer.from('theatre-scene-v1'));
 const enc=Buffer.concat([cipher.update(deflateRawSync(Buffer.from(JSON.stringify({...opened,version:1})))),cipher.final()]);
 assert.throws(()=>ticket.openScene(Buffer.concat([iv,cipher.getAuthTag(),enc]).toString('base64url'),'incremental-test-placeholder'));
 assert.equal(h.stats.calls.length,0);assert.equal(h.stats.analyses,1);
});

test('owner review is recoverable; explicit exclusions are retained, implicit removal is rejected',async()=>{
 const p=await load('lib/theatre-generation.ts').prepareTheatrePlan('JULIEN: Bonjour, Thomas.',{analyze:async json=>{const {items}=JSON.parse(json);return {...analysisFor(items),pronunciation:{...proposalFor(items),entries:[entry('Thomas',{classification:'uncertain',language:'',target:'',resolution:{status:'unknown',basis:'uncertain',localLanguage:'fr',rationale:'Unresolved fixture.'}})]}};}}),d=auth.draftPronunciation(p,'source');d.entries.push(entry('Bonjour'));
 assert.throws(()=>auth.acceptPronunciation(d,{inventoryReviewed:true,entries:[]},p));
 const a=auth.acceptPronunciation(d,{inventoryReviewed:true,entries:[],excludedIds:d.entries.map(e=>e.id)},p);assert.equal(a.excludedIds.length,2);assert.equal(a.acceptance,'owner-confirmed');assert.equal(a.policyVersion,2);assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a.entries));
 p.pronunciation=structuredClone(a);p.pronunciation.sourceDigest='different';assert.throws(()=>auth.assertPronunciationAuthority(p));
});

test('Unicode identities, multiword aliases, exact spans and homonym ambiguity',()=>{
 const items=parse('JULIEN: Émile, Emile, Émilien et Jean Paul. Émile !');
 const entries=[entry('Émile'),entry('Jean Paul',{aliases:['Jean']})],spans=pron.pronunciationOccurrences(entries,items);
 assert.deepEqual(spans.map(o=>items[0].text.slice(o.start,o.end)),['Émile','Jean Paul','Émile']);
 assert.throws(()=>pron.pronunciationOccurrences([entry('Émile'),entry('Émile',{id:'another'})],items),/Ambiguous/);
 assert.equal(pron.pronunciationOccurrences([entry('Thomas')],parse('JULIEN: Thomason attend.')).length,0);
 assert.equal(pron.pronunciationOccurrences([entry('Émile')],parse('JULIEN: E\u0301mile !')).length,1);
 assert.equal(pron.pronunciationOccurrences([entry("Jean-Pierre"),entry("O’Neil")],parse('JULIEN: Jean-Pierre et O’Neil.')).length,2);
});

for(const mode of ['missing','malformed','failed'])test(`analysis ${mode} fails preparation without a clarification form`,async()=>{
 let calls=0;class OpenAI{constructor(){this.responses={create:async b=>{if(mode==='failed')throw Error('mock unavailable');const {items}=JSON.parse(b.input[1].content);return {status:'completed',output_text:JSON.stringify({...analysisFor(items),...(mode==='malformed'?{pronunciation:{version:1,entries:'invalid'}}:{})})};}};this.audio={speech:{create:async()=>{calls++;throw Error('not allowed');}}};}}
 const l=createLoader({openai:OpenAI}),r=await l('app/api/read-passage/route.ts').POST(request(body));assert.equal(r.status,503);const d=await r.json();assert.equal(d.code,'THEATRE_ANALYSIS_FAILED');assert.equal(d.mode,undefined);assert.equal(d.entries,undefined);assert.equal(calls,0);
});

test('same whole-scene request proposes names; proposal validation leaves dramatic analysis intact',async()=>{
 const items=parse(text),valid={...analysisFor(items),director:planFor(items),pronunciation:{version:1,entries:[entry('Thomas')]}};
 const mod=load('lib/theatre-direction.ts');assert.ok(mod.validateDramaticAnalysis(valid,items).pronunciation);
 assert.ok(mod.validateDramaticAnalysis({...valid,pronunciation:{version:1,entries:42}},items).scene);
 const h=harness();await draft(h);const request=h.stats.analysisInputs[0];assert.match(JSON.stringify(request),/SEPARATE whole-production lexical interpretation/);assert.match(JSON.stringify(request),/preserved-foreign/);assert.equal(h.stats.analyses,1);
});

test('client gates without prefetch; explicit learner model uses authority and cached replay stays held',async()=>{
 const h=harness(),s=gateSession(h),doc={...h.doc,documentId:body.documentId};await s.start(text,'normal',doc,undefined,'THOMAS');
 const c=s.getSnapshot().clarification;assert.ok(c);assert.equal(h.stats.calls.length,0);assert.equal(h.env.audios.length,0);assert.equal(s.getSnapshot().busy,false);
 await s.resolvePronunciation(c,answer(c.entries).entries,true);await until(()=>!!s.theatre.getSnapshot().learnerTurn);const turn=s.theatre.getSnapshot().learnerTurn;
 await s.roleAssistance.listen(turn,'model');assert.equal(s.theatre.getSnapshot().learnerTurn,turn);assert.match(h.stats.calls.find(c=>c.body.input==='Thomas ?').body.instructions,/Accepted production pronunciation/);h.env.latest().end();
 await until(()=>h.stats.calls.length===9);
 const count=h.stats.calls.filter(c=>c.body.input==='Thomas ?').length;await s.roleAssistance.listen(turn,'model');assert.equal(h.stats.calls.filter(c=>c.body.input==='Thomas ?').length,count);assert.equal(s.theatre.getSnapshot().learnerTurn,turn);s.dispose();
});

for(const action of ['stop','replace'])test(`${action} invalidates stale clarification object`,async()=>{
 const h=harness(),s=gateSession(h);await s.start(text,'normal',h.doc);const c=s.getSnapshot().clarification;
 if(action==='stop')s.stop();else await s.start('JULIEN: Nouveau.','normal',{...h.doc,revision:2});
 const analyses=h.stats.analyses;await s.resolvePronunciation(c,answer(c.entries).entries,true);assert.equal(h.stats.calls.length,0);assert.equal(h.stats.analyses,analyses);s.dispose();
});

test('late accepted response after cancellation cannot install loader or playback',async()=>{
 const h=harness(),gate=deferred();let hold=false;const s=gateSession(h,async(url,opts)=>{const r=await h.rawPrepare(new Request('http://localhost'+url,opts));if(hold)await gate.promise;return r;});
 await s.start(text,'normal',h.doc);const c=s.getSnapshot().clarification;hold=true;const pending=s.resolvePronunciation(c,answer(c.entries).entries,true);await tick();s.stop();gate.resolve();await pending;assert.equal(h.env.audios.length,0);assert.equal(h.stats.calls.length,0);assert.equal(s.getSnapshot().clarification,null);s.dispose();
});

test('invalid clarification answer can be corrected without reanalysis',async()=>{
 const h=harness(),s=gateSession(h);await s.start(text,'normal',h.doc);let c=s.getSnapshot().clarification;await s.resolvePronunciation(c,c.entries,true);assert.ok(s.getSnapshot().error);c=s.getSnapshot().clarification;assert.ok(c);await s.resolvePronunciation(c,answer(c.entries).entries,true);await until(()=>h.stats.calls.length>0);assert.equal(h.stats.analyses,1);s.dispose();
});

test('mismatched audio authority is never cached and can retry under the accepted digest',async()=>{
 const h=harness(),d=await draft(h),m=await accept(h,d),Loader=h.load('lib/theatre-incremental.ts').IncrementalTheatreLoader;let wrong=true,calls=0;
 const l=new Loader(m,async(url,opts)=>{calls++;const r=await h.clip(new Request('http://localhost'+url,opts)),v=await r.json();return Response.json({...v,pronunciationDigest:wrong?'wrong':v.pronunciationDigest});},()=>({}));
 await assert.rejects(l.load(0));assert.ok(!l.getDiagnostics().some(e=>e.phase==='prepared'));wrong=false;await l.load(0);assert.equal(calls,2);await l.load(0);assert.equal(calls,2);l.dispose();
});

test('mandatory name decisions never truncate to fit the instruction budget',()=>{
 const item=parse('JULIEN: '+Array.from({length:30},(_,i)=>'Name'+i).join(' ')+' ?')[0],entries=Array.from({length:30},(_,i)=>entry('Name'+i,{target:'x'.repeat(120)})),authority={status:'ready',inventoryReviewed:true,entries,occurrences:pron.pronunciationOccurrences(entries,[item])};
 assert.throws(()=>load('lib/theatre-speech-instructions.ts').theatreSpeechInstructions('fr',item,null,'clarte',{voice:'ash',items:[item],pronunciation:authority}),/invalides/);
});

test('legacy helper refuses an authority-required scene before any synthesis',async()=>{
 let calls=0;await assert.rejects(load('lib/theatre-generation.ts').generateTheatreResponse(text,1,async()=>{calls++;return 'audio';},{requirePronunciationAuthority:true}));assert.equal(calls,0);
});

test('clarification UI exposes explicit inventory review and uncertainty without a playable control',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Component=load('components/article-reader/PronunciationClarification.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Component,{state:{entries:[entry('Thomas',{classification:'uncertain'})],inventoryComplete:false},busy:false,onAccept(){},onCancel(){}}));
 assert.match(html,/Prononciation à clarifier/);assert.match(html,/À clarifier/);assert.match(html,/ne garantissent pas/);assert.match(html,/Exclure/);assert.match(html,/disabled=""/);assert.doesNotMatch(html,/<audio|sceneToken|pronunciationToken/);
});

test('generated character display-name references are inventoried without inventing pronunciation',()=>{
 const items=parse('PERSONNAGE_1: Bonjour.\nJULIEN: Émile nous attend.'),entries=pron.pronunciationInventory(undefined,items,[{speakerId:'PERSONNAGE_1',displayName:'Émile'}]);
 assert.equal(entries.length,1);assert.equal(entries[0].name,'Émile');assert.equal(entries[0].classification,'uncertain');assert.equal(entries[0].target,'');
});

test('legacy authority-bearing helper consumes the shared adapter and verifies canonical source',async()=>{
 const g=load('lib/theatre-generation.ts'),source='JULIEN: Thomas ?',p=await g.prepareTheatrePlan(source,{analyze:async json=>{const {items}=JSON.parse(json);return {...analysisFor(items),pronunciation:{...proposalFor(items),entries:[entry('Thomas',{classification:'uncertain',language:'',target:'',resolution:{status:'unknown',basis:'uncertain',localLanguage:'fr',rationale:'Unresolved fixture.'}})]}};}}),d=auth.draftPronunciation(p,auth.pronunciationSourceDigest(source));
 const a=auth.acceptPronunciation(d,{inventoryReviewed:true,entries:[entry('Thomas')]},p),calls=[];
 await g.generateTheatreResponse(source,1,async b=>{calls.push(b);return 'YQ==';},{pronunciationAuthority:a});
 assert.equal(calls.length,1);assert.equal(calls[0].text,'Thomas ?');assert.match(calls[0].instructions,/Accepted production pronunciation/);assert.match(calls[0].instructions,/interrogative/);
 await assert.rejects(g.generateTheatreResponse('JULIEN: Thomas !',1,async()=>{throw Error('must not synthesize');},{pronunciationAuthority:a}));
});
