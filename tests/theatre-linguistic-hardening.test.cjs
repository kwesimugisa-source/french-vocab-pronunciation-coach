const test=require('node:test'),assert=require('node:assert/strict');
const {harness,request}=require('./incremental-fixtures.cjs');
const {planFor,analysisFor}=require('./director-fixtures.cjs');
for(const style of ['clarte','naturel'])for(const directed of [false,true])test(`linguistic requests preserve input/casting/speed: ${style}, Director=${directed}`,async()=>{
 const h=harness();const source='JULIEN: Alice !\nJULIEN: Paul ?!\nJULIEN: Euh…\n[Marc entre.]\n[Rose regarde la porte puis traverse lentement la grande salle pour retrouver ses amis.]';
 const plan=await h.load('lib/theatre-generation.ts').prepareTheatrePlan(source,{performanceStyle:style,directorEnabled:directed,...(directed?{analyze:async json=>{const {items}=JSON.parse(json);return {...analysisFor(items),director:planFor(items)};}}:{})});
 const ticket=h.load('lib/theatre-scene-ticket.ts');const m=ticket.sceneManifest(plan,1.1,ticket.sealScene(plan,1.1,'incremental-test-placeholder'));
 for(const item of m.clips){const r=await h.clip(request({sceneToken:m.sceneToken,itemId:item.id,componentIndex:0}));assert.equal(r.status,200);const b=h.stats.calls.at(-1).body;
 assert.equal(b.input,item.text);assert.equal(b.voice,item.voice);assert.equal(b.speed,item.speed);assert.match(b.instructions,/French vowel values/);assert.match(b.instructions,item.type==='stage'?/French-context narration/:/Short French-context utterance/);
 }
 assert.equal(h.stats.calls.length,m.clips.length);assert.equal(h.stats.analyses,0);h.session.dispose();
});
const load=require('./load-typescript.cjs')(),{theatreLinguisticGuidance}=load('lib/theatre-linguistic.ts');
for(const text of ['Elle a dit oui\u202f?','« Elle a dit oui ? »','Elle a dit oui ?!','Elle a dit oui ? Je comprends.'])test(`local question semantics: ${text}`,()=>{
 const guidance=theatreLinguisticGuidance({type:'dialogue',text});assert.match(guidance,/corresponding question/);assert.match(guidance,/not for unrelated statements/);assert.match(guidance,/do not mechanically exaggerate/);
});
test('statements and semantic silence do not gain question direction',()=>{
 assert.doesNotMatch(theatreLinguisticGuidance({type:'dialogue',text:'Elle a dit oui.'}),/interrogative/);
 assert.equal(theatreLinguisticGuidance({type:'stage',text:'[Silence.]',pauseMs:900}),'');
});
