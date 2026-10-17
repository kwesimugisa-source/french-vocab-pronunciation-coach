const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-typescript.cjs')();
const {theatreSpeechInstructions:build,THEATRE_INSTRUCTION_BUDGET:budget}=load('lib/theatre-speech-instructions.ts');
const {parseTheatreItems,planFor,analysisFor,state,ref,fact}=require('./director-fixtures.cjs');
const {validateDramaticAnalysis,dramaticInstructions}=load('lib/theatre-direction.ts');
const {pronunciationInstructions}=load('lib/document-language.ts');
function fixture(text='JULIEN: Thomas ?\nTHOMAS: Oui.'){
 const items=parseTheatreItems(text),director=planFor(items);return {items,analysis:validateDramaticAnalysis({...analysisFor(items),director},items)};
}
for(const style of ['clarte','naturel'])for(const text of ['Thomas !','Thomas ?','Elle a dit oui ? Puis elle est partie.'])test(`budget preserves exact text/voice/style/question: ${style} ${text}`,()=>{
 const {items,analysis}=fixture(`JULIEN: ${text}\nTHOMAS: Oui.`),before=structuredClone({items,analysis});
 const result=build('fr',items[0],analysis,style,{voice:'ash',items});
 assert.ok(result.length<=budget);assert.equal(result,build('fr',items[0],analysis,style,{voice:'ash',items}));assert.deepEqual({items,analysis},before);
 assert.match(result,/Document language: French/);assert.match(result,/exact supplied input/);assert.match(result,/providerVoice":"ash/);assert.match(result,style==='clarte'?/Clarté:/:/Naturel:/);
 if(text.includes('?'))assert.match(result,/each punctuated question, not unrelated statements/);
 const previous=pronunciationInstructions('fr',dramaticInstructions(items[0],analysis,style,{voice:'ash',items}));assert.ok(result.length<previous.length);
});
for(const intent of ['question','respond','unknown'])test(`question authority survives Director ${intent}`,()=>{
 const {items,analysis}=fixture();analysis.director.lines[0].intent=intent;const result=build('fr',items[0],analysis,'naturel',{voice:'ash',items});assert.match(result,/Authored linguistic form: interrogative/);assert.match(result,new RegExp(`"intent":"${intent}"`));
});
test('maximum-size accepted Director fields retain essential state/delivery under budget',()=>{
 const names=Array.from({length:32},(_,i)=>'PERSONNAGE'+String(i).padStart(2,'0')+'A'.repeat(28));
 const items=parseTheatreItems(names.map((n,i)=>`${n}: ${i?'Oui.':'Thomas ?'}`).join('\n')),p=planFor(items),value='É'.repeat(160);
 for(const key of ['location','social','time'])p.setting[key]=fact(value,items[0]);
 p.beats=[{at:items[0].id,event:fact(value,items[0]),present:names,presenceEvidence:[ref(items[0])],states:[state(names[0],items[0],{objective:value,knowledge:value})]}];
 Object.assign(p.lines[0],{subtext:value,addressee:names[1],hearers:names.slice(1),intent:'question'});
 p.relationships=names.slice(1).map(to=>({from:names[0],to,since:items[0].id,kind:'friends',stance:'trusting',evidence:[ref(items[0])]}));
 const analysis=validateDramaticAnalysis({...analysisFor(items),director:p},items);assert.ok(analysis.director);
 const result=build('fr',items[0],analysis,'naturel',{voice:'ash',items});assert.ok(result.length<=budget);assert.match(result,/Scene-aware Director context/);
 const essential=JSON.parse(result.split('\n').find(s=>s.startsWith('Scene-aware Director context:')).split('context: ')[1].split('. Continue this state;')[0]);
 assert.equal(essential.state.objective,value);assert.equal(essential.state.knowledge,value);assert.equal(essential.delivery.subtext,value);assert.equal(essential.delivery.addressee,names[1]);
 assert.ok(result.split('Listener:').length-1<31);assert.ok(result.includes(value));
});
test('pathological optional context is omitted as complete fields, never chopped',()=>{
 const {items,analysis}=fixture();analysis.scene.arc='OPTIONALSTART'+ 'x'.repeat(10000)+'OPTIONALEND';items[1].text='NEIGHBORSTART'+'y'.repeat(10000)+'NEIGHBOREND';
 const result=build('fr',items[0],analysis,'clarte',{voice:'ash',items});assert.ok(result.length<=budget);assert.doesNotMatch(result,/OPTIONALSTART|OPTIONALEND|NEIGHBORSTART|NEIGHBOREND/);assert.match(result,/interrogative/);
});
test('pathological essential identity/context fails closed instead of emitting oversized instructions',()=>{
 const {items,analysis}=fixture();assert.throws(()=>build('fr',items[0],analysis,'naturel',{voice:'x'.repeat(10000),items}),/invalides/);
 analysis.director.lines[0].subtext='x'.repeat(10000);assert.throws(()=>build('fr',items[0],analysis,'naturel',{voice:'ash',items}),/essentiel/);
});
test('narrator/chorus/silent-beat constraints survive compaction',()=>{
 const {items,analysis}=fixture('[Thomas attend.]\n[Silence.]\nJULIEN: Ah !\nLE CHŒUR: Oui.');
 assert.match(build('fr',items[0],analysis,'naturel',{voice:'cedar',items}),/French-context narration/);
 assert.match(build('fr',items[2],analysis,'naturel',{voice:'ash',items}),/silent dramatic beat/);
 assert.match(build('fr',items[3],analysis,'naturel',{voice:'echo',items}),/steady, even articulation/);
});
test('actual component route uses compact budget and preserves exact request fields',async()=>{
 const {harness,request}=require('./incremental-fixtures.cjs'),h=harness();const text='JULIEN: Thomas ?\nTHOMAS: Oui.';
 const manifest=await(await h.prepare(request({text,contentType:'theatre',performanceStyle:'naturel'}))).json();
 const response=await h.clip(request({sceneToken:manifest.sceneToken,itemId:manifest.clips[0].id,componentIndex:0,debug:true}));assert.equal(response.status,200);
 const data=await response.json(),body=h.stats.calls[0].body;assert.deepEqual(data.debug.tts,body);assert.equal(body.input,'Thomas ?');assert.equal(body.voice,manifest.clips[0].voice);assert.equal(body.speed,1);assert.equal(body.model,'gpt-4o-mini-tts');assert.ok(body.instructions.length<=budget);assert.equal(h.stats.calls.length,1);h.session.dispose();
});
