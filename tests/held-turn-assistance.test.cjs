const test=require('node:test'),assert=require('node:assert/strict');
const {load,scene,environment,deferred,flush}=require('./playback-fixtures.cjs');
const {harness,until}=require('./incremental-fixtures.cjs');
const {TheatrePlaybackController}=load('lib/theatre-playback.ts');
const {HeldTurnAssistance}=load('lib/held-turn-assistance.ts');
function setup(options={}) {
 const env=environment(),c=new TheatrePlaybackController(env),sid=c.beginLoading();
 const text='CLARA: Ah… Oui ?!\nCLARA: Encore.\nCLARA: Fin.';
 c.acceptScene(sid,scene(text),text,{epoch:1,sessionId:sid,documentId:'doc',revision:4,speaker:'CLARA',style:'naturel',speed:'slow'});
 const streams=[],recorders=[],requests=[];let captures=0,calls=0;
 const recording={
  getUserMedia:async()=>{if(options.permission)return options.permission();const track={stopped:false,stop(){this.stopped=true;}};const stream={getTracks:()=>[track]};streams.push(stream);return stream;},
  createRecorder:()=>{if(options.unavailable)throw Error('unavailable');const r={mimeType:options.mime||'audio/mp4',state:'inactive',start(){this.state='recording';},stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['recording'],{type:this.mimeType})});this.onstop?.();}};recorders.push(r);return r;},
  fetch:async(url,opts)=>{requests.push({url,opts});return options.feedback?options.feedback():Response.json({transcript:'Ah… Oui ?!',weakPoints:[]});}
 };
 const a=new HeldTurnAssistance(c,env,()=>{captures++;c.setCaptureBlocked(true);return()=>{captures--;c.setCaptureBlocked(false);};},async turn=>{calls++;return options.model?options.model():scene(text).clips[turn.index];},recording);
 return {a,c,env,streams,recorders,requests,turn:()=>c.getSnapshot().learnerTurn,captures:()=>captures,calls:()=>calls};
}
test('first/consecutive/final assistance preserves exact turn and only Continue advances once',async()=>{
 const h=setup();
 for(let index=0;index<3;index++){
  const turn=h.turn();assert.equal(turn.index,index);await h.a.record(turn);h.a.stopRecording(turn);
  const target=h.a.getSnapshot().recording.recording.target;
  assert.deepEqual(target,{text:turn.text,itemId:turn.itemId,speaker:turn.speaker,sessionId:turn.run.sessionId,documentId:'doc',revision:4,contentType:'theatre'});
  await h.a.listen(turn,'self');h.env.latest().end();await h.a.listen(turn,'model');h.env.latest().end();await h.a.analyze(turn);
  assert.equal(h.turn(),turn);assert.equal(h.c.getSnapshot().completions.length,index);
  assert.equal(h.requests.at(-1).opts.body.get('text'),turn.text);assert.equal(h.requests.at(-1).opts.body.get('audio').name,'reading.mp4');
  assert.equal(h.a.continue(turn),true);assert.equal(h.a.continue(turn),false);
  await h.a.record(turn);await h.a.listen(turn,'model');assert.equal(h.c.getSnapshot().completions.length,index+1);
 }
 assert.equal(h.c.getSnapshot().status,'completed');assert.equal(h.calls(),3);assert.equal(h.captures(),0);h.a.dispose();
});
for(const failure of ['denied','unavailable'])test(`microphone ${failure} is recoverable and never gates Continue`,async()=>{
 const h=setup(failure==='denied'?{permission:async()=>{throw Error('denied');}}:{unavailable:true});const t=h.turn();await h.a.record(t);
 assert.equal(h.a.getSnapshot().recording.status,'error');assert.equal(h.turn(),t);assert.equal(h.captures(),0);assert.ok(h.streams.every(s=>s.getTracks()[0].stopped));assert.equal(h.a.continue(t),true);h.a.dispose();
});
for(const phase of ['permission','capture','model-request','model-play','self-play','analysis'])for(const action of ['continue','stop','replace','unmount'])test(`${action} during ${phase} invalidates callbacks and releases resources`,async()=>{
 const gate=deferred();let lateStopped=false;
 const h=setup({...(phase==='permission'?{permission:()=>gate.promise}:{}),...(phase==='model-request'?{model:()=>gate.promise}:{}),...(phase==='analysis'?{feedback:()=>gate.promise}:{})});
 const t=h.turn();let work;
 if(phase==='permission')work=h.a.record(t);
 if(['capture','self-play','analysis'].includes(phase)){await h.a.record(t);if(phase!=='capture')h.a.stopRecording(t);}
 if(phase==='self-play')await h.a.listen(t,'self');
 if(phase==='model-play')await h.a.listen(t,'model');
 if(phase==='model-request')work=h.a.listen(t,'model');
 if(phase==='analysis')work=h.a.analyze(t);
 const oldAudio=h.env.latest(),ended=oldAudio?.onended;
 if(action==='continue')assert.equal(h.a.continue(t),true);
 else if(action==='unmount')h.a.dispose();
 else {h.c.stop();if(action==='replace'){const sid=h.c.beginLoading();h.c.acceptScene(sid,scene('CLARA: Nouvelle.'),'CLARA: Nouvelle.',{...t.run,sessionId:sid,epoch:2,revision:5});}}
 const current=h.c.getSnapshot();
 if(phase==='permission')gate.resolve({getTracks:()=>[{stop(){lateStopped=true;}}]});
 if(phase==='model-request')gate.resolve(scene('CLARA: Ancienne.').clips[0]);
 if(phase==='analysis')gate.resolve(Response.json({transcript:'STALE',weakPoints:[]}));
 await work;await flush();ended?.(new Event('ended'));
 assert.equal(h.c.getSnapshot().currentIndex,current.currentIndex);assert.equal(h.a.getSnapshot().recording.feedback,null);
 assert.equal(h.captures(),0);assert.ok(h.streams.every(s=>s.getTracks()[0].stopped));
 if(phase==='permission')assert.equal(lateStopped,true);
 assert.ok(h.env.created.every(x=>h.env.revoked.includes(x.url)));assert.ok(h.env.audios.every(a=>a.removed));h.a.dispose();
});
test('source exclusion, duplicate actions, rerecord cleanup and autoplay recovery',async()=>{
 const h=setup(),t=h.turn();await h.a.record(t);await h.a.listen(t,'model');assert.equal(h.calls(),0);h.a.stopRecording(t);
 await h.a.listen(t,'self');const old=h.env.latest();await h.a.listen(t,'model');assert.equal(h.calls(),0);
 await h.a.record(t);assert.ok(old.removed);assert.equal(h.captures(),1);assert.equal(h.a.getSnapshot().recording.recording,null);h.a.stopRecording(t);
 h.env.nextPlay=Promise.reject(Error('autoplay'));await h.a.listen(t,'model');assert.match(h.a.getSnapshot().error,/bloquée/);assert.equal(h.captures(),0);
 await h.a.listen(t,'model');h.env.latest().fail();assert.match(h.a.getSnapshot().error,/impossible/);assert.equal(h.turn(),t);h.a.dispose();
});
test('analysis error retains recording and retries with same canonical reference',async()=>{
 let count=0;const h=setup({feedback:async()=>++count===1?new Response('',{status:500}):Response.json({transcript:'Réessai',weakPoints:[]})}),t=h.turn();
 await h.a.record(t);h.a.stopRecording(t);await h.a.analyze(t);assert.equal(h.a.getSnapshot().recording.status,'error');assert.ok(h.a.getSnapshot().recording.recording);
 await h.a.analyze(t);assert.equal(h.a.getSnapshot().recording.feedback.transcript,'Réessai');assert.equal(h.turn(),t);h.a.dispose();
});
test('recording supersedes pending model listening without late audio or overlapping capture',async()=>{
 const gate=deferred(),h=setup({model:()=>gate.promise}),t=h.turn(),work=h.a.listen(t,'model');
 await h.a.record(t);assert.equal(h.captures(),1);assert.equal(h.a.getSnapshot().recording.status,'recording');
 gate.resolve(scene('CLARA: Ah… Oui ?!').clips[0]);await work;assert.equal(h.env.audios.length,0);assert.equal(h.turn(),t);h.a.dispose();assert.equal(h.captures(),0);
});
for(const style of ['clarte','naturel'])test(`explicit model is sole learner TTS exception, cached and identical to ordinary request: ${style}`,async()=>{
 async function start(role){const h=harness();await h.session.changeTheatreStyle(style,'CLARA: Ah… Oui ?!','slow',h.doc);await h.session.start('CLARA: Ah… Oui ?!','slow',h.doc,undefined,role);return h;}
 const h=await start('CLARA'),a=h.session.roleAssistance,t=h.session.theatre.getSnapshot().learnerTurn;
 assert.equal(h.stats.calls.length,0);await a.listen(t,'model');assert.equal(h.stats.calls.length,1);h.env.latest().end();await a.listen(t,'model');h.env.latest().end();assert.equal(h.stats.calls.length,1);assert.equal(h.session.theatre.getSnapshot().learnerTurn,t);
 const ordinary=await start();await until(()=>ordinary.stats.calls.length===1);assert.deepEqual(h.stats.calls[0].body,ordinary.stats.calls[0].body);assert.ok(h.stats.calls[0].body.instructions.length<=3800);
 h.session.dispose();ordinary.session.dispose();
});
test('held UI is optional, canonical text stays outside assistance, transcript-only and no legacy scores',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Panel=load('components/article-reader/RolePlayControls.tsx').default;
 const h=setup(),t=h.turn();const html=renderToStaticMarkup(React.createElement(Panel,{enabled:true,roles:['CLARA'],speaker:'CLARA',playback:h.c.getSnapshot(),assistance:h.a}));
 assert.match(html,/Ah… Oui \?!/);assert.match(html,/<details/);assert.match(html,/Écouter mon enregistrement/);assert.match(html,/Comparer mon enregistrement au texte/);assert.doesNotMatch(html,/score|intonation.*[0-9]/);h.a.dispose();
});

test('browser recorder selects supported MIME; chunk MIME fallback and filename agree',async()=>{
 const {PronunciationSession}=load('lib/pronunciation-session.ts');
 const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldRecorder=globalThis.MediaRecorder;
 const probes=[],received=[];let recorder,stops=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stops++;}}]})}}});
 globalThis.MediaRecorder=class {
  static isTypeSupported(type){probes.push(type);return type==='audio/mp4';}
  constructor(stream,options){received.push(options);this.mimeType=options.mimeType;this.state='inactive';recorder=this;}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'],{type:'audio/mp4'})});this.onstop?.();}
 };
 try {const s=new PronunciationSession();await s.start({text:'Oui.'});s.stop();assert.deepEqual(probes,['audio/webm;codecs=opus','audio/mp4']);assert.equal(received[0].mimeType,'audio/mp4');assert.equal(s.getSnapshot().recording.blob.type,'audio/mp4');assert.equal(stops,1);s.dispose();}
 finally {if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;globalThis.MediaRecorder=oldRecorder;}
 const h=setup({mime:'audio/ogg;codecs=opus'});await h.a.record(h.turn());h.recorders[0].mimeType='';h.recorders[0].stop=function(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'],{type:'audio/ogg'})});this.onstop?.();};h.a.stopRecording(h.turn());await h.a.analyze(h.turn());assert.equal(h.requests[0].opts.body.get('audio').name,'reading.ogg');assert.equal(h.a.getSnapshot().recording.recording.blob.type,'audio/ogg');h.a.dispose();
});

test('late play rejection and old feedback cannot overwrite a new held turn',async()=>{
 const pending=deferred(),h=setup();h.env.nextPlay=pending.promise;const t=h.turn(),work=h.a.listen(t,'model');await flush();h.a.continue(t);const next=h.turn();await h.a.record(next);pending.reject(Error('late'));await work;
 assert.equal(h.a.getSnapshot().turn,next);assert.equal(h.a.getSnapshot().recording.status,'recording');assert.equal(h.a.getSnapshot().error,null);h.a.dispose();await h.a.record(next);assert.equal(h.a.getSnapshot().recording.status,'idle');
});
