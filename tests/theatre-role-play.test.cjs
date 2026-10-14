const test=require('node:test'),assert=require('node:assert/strict');
const createLoader=require('./load-typescript.cjs');
const {scene,environment,deferred,flush}=require('./playback-fixtures.cjs');
const {harness,until,tick}=require('./incremental-fixtures.cjs');
const load=createLoader(),{TheatrePlaybackController}=load('lib/theatre-playback.ts'),{theatreRoles}=load('lib/theatre-role-play.ts');
function runFor(sessionId,speaker='CLARA',extra={}){return {epoch:1,sessionId,documentId:'doc',revision:1,speaker,style:'naturel',speed:'normal',...extra};}
function cached(text,speaker='CLARA'){
 const env=environment(),c=new TheatrePlaybackController(env),sid=c.beginLoading(),data=scene(text);
 for(const clip of data.clips)if(clip.pauseMs)clip.audioBase64='';
 c.acceptScene(sid,data,text,runFor(sid,speaker));return {c,env,data};
}
test('canonical role list deduplicates normalized labels in first-speaking order, excluding narrator and chorus',()=>{
 assert.deepEqual(theatreRoles('[Clara entre.]\nClara: Ah !\nMARC: Oui.\n CLARA : Euh…\nLE CHŒUR: Ensemble.\nNARRATOR: Exclu.\nMarc: Non.'),['CLARA','MARC']);
});
test('cached audio cannot bypass first/consecutive/final learner holds; Continue token is single-use',()=>{
 const {c,env}=cached('CLARA: Ah !\nCLARA: Une phrase\nsur deux lignes.\nCLARA: Fin.');
 const first=c.getSnapshot().learnerTurn;assert.equal(first.text,'Ah !');assert.equal(env.audios.length,0);
 c.replay();c.resume();assert.equal(env.audios.length,0);assert.equal(c.enterPractice(first.itemId),false);
 assert.equal(c.continueLearner(first),true);assert.equal(c.continueLearner(first),false);
 const second=c.getSnapshot().learnerTurn;assert.equal(second.text,'Une phrase sur deux lignes.');assert.equal(second.index,1);
 c.continueLearner(second);const last=c.getSnapshot().learnerTurn;assert.equal(last.index,2);c.continueLearner(last);
 assert.equal(c.getSnapshot().status,'completed');assert.equal(c.continueLearner(last),false);
 assert.deepEqual(c.getSnapshot().completions.map(x=>x.via),['learner','learner','learner']);assert.equal(env.audios.length,0);
});
test('narrator and semantic silence between learner turns use existing media/advance paths',()=>{
 const env=environment(),timers=new Map();let id=0;env.setTimer=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};env.clearTimer=id=>timers.delete(id);
 const c=new TheatrePlaybackController(env),sid=c.beginLoading(),text='CLARA: Ah !\n[Marc entre.]\n[Silence.]\nCLARA: Oui.';
 const data=scene(text);data.clips[2].audioBase64='';c.acceptScene(sid,data,text,runFor(sid));
 c.continueLearner(c.getSnapshot().learnerTurn);assert.equal(c.getSnapshot().currentIndex,1);env.latest().end();assert.equal(c.getSnapshot().currentIndex,2);
 assert.equal(env.audios.length,1);const pause=[...timers.values()].find(t=>t.ms===900);assert.ok(pause);pause.fn();
 assert.equal(c.getSnapshot().learnerTurn.index,3);c.continueLearner(c.getSnapshot().learnerTurn);assert.equal(c.getSnapshot().status,'completed');
 assert.deepEqual(c.getSnapshot().completions.map(x=>x.via),['learner','audio','audio','learner']);
});
for(const change of [{speaker:'MARC'},{documentId:'new-doc'},{revision:2},{epoch:2},{style:'clarte'},{speed:'slow'}])test(`replacement invalidates old Continue: ${JSON.stringify(change)}`,()=>{
 const {c}=cached('CLARA: Ah !\nMARC: Oui.');const old=c.getSnapshot().learnerTurn;c.stop();const sid=c.beginLoading();
 c.acceptScene(sid,scene('CLARA: Ah !\nMARC: Oui.'),'CLARA: Ah !\nMARC: Oui.',runFor(sid,'CLARA',change));
 assert.equal(c.continueLearner(old),false);assert.equal(c.getSnapshot().completions.length,0);c.stop();
});
test('invalid accepted selection fails before preparation or media',()=>{
 const c=new TheatrePlaybackController(environment()),sid=c.beginLoading();assert.throws(()=>c.acceptScene(sid,scene('MARC: Oui.'),'MARC: Oui.',runFor(sid)),/personnage/);
});
test('automatic preparation preserves six canonical positions, excluding learner items without extending window',async()=>{
 const h=harness(),text=['MARC: Début.',...Array.from({length:6},(_,i)=>`CLARA: Attente ${i}.`),'MARC: Hors fenêtre.'].join('\n');
 await h.session.start(text,'normal',h.doc,undefined,'CLARA');await until(()=>h.session.theatre.getSnapshot().status==='playing');await tick();
 assert.equal(h.stats.calls.length,1);assert.equal(h.stats.calls[0].body.input,'Début.');h.env.latest().end();
 assert.equal(h.session.theatre.getSnapshot().status,'learner_turn');assert.equal(h.stats.calls.length,1);
 for(let i=1;i<=6;i++){const turn=h.session.theatre.getSnapshot().learnerTurn;assert.equal(turn.index,i);h.session.theatre.continueLearner(turn);}
 await until(()=>h.session.theatre.getSnapshot().status==='playing');assert.equal(h.stats.calls.length,2);h.env.latest().end();assert.equal(h.session.theatre.getSnapshot().status,'completed');h.session.dispose();
});
for(const style of ['clarte','naturel'])test(`50-item role scene ${style}: zero learner TTS, unchanged partner order/chorus/concurrency/Director`,async()=>{
 const h=harness();const lines=Array.from({length:50},(_,i)=>`${i===20?'LE CHŒUR':i%2?'MARC':'CLARA'}: Réplique ${i}.`),text=lines.join('\n');
 await h.session.changeTheatreStyle(style,text,'normal',h.doc);await h.session.start(text,'normal',h.doc,undefined,'CLARA');
 for(let i=0;i<50;i++){
  await until(()=>h.session.theatre.getSnapshot().currentIndex===i&&['playing','learner_turn'].includes(h.session.theatre.getSnapshot().status));
  const s=h.session.theatre.getSnapshot(),item=s.queue[i];
  if(item.speaker==='CLARA'){assert.equal(s.status,'learner_turn');assert.equal(item.audioBase64,'');assert.equal(s.learnerTurn.text,item.text);h.session.theatre.continueLearner(s.learnerTurn);}
  else{await tick();h.env.audios.filter(a=>!a.removed).forEach(a=>a.end());}
 }
 const s=h.session.theatre.getSnapshot();assert.equal(s.status,'completed');assert.equal(s.completions.length,50);assert.equal(h.stats.calls.length,28);assert.ok(h.stats.peak<=2);assert.equal(h.stats.analyses,1);
 assert.ok(h.stats.calls.every(call=>!s.queue.some(item=>item.speaker==='CLARA'&&item.text===call.body.input)));
 assert.deepEqual(h.session.getTheatreDiagnostics().playback.filter(e=>e.phase==='advance').map(e=>e.index),Array.from({length:50},(_,i)=>i));
 assert.equal(JSON.parse(h.stats.analysisInputs[0].input[1].content).items.length,50);h.session.dispose();
});
test('pending role manifest cannot attach after stop/mode replacement',async()=>{
 const hold=deferred(),env=environment();const {ReadingPlaybackSession}=load('lib/reading-playback.ts');
 const s=new ReadingPlaybackSession(env,()=>hold.promise);const work=s.start('CLARA: Ah !','normal',{documentId:'x',revision:1,contentType:'theatre',language:'fr'},undefined,'CLARA');s.stop();hold.resolve(Response.json({}));await work;
 assert.equal(s.theatre.getSnapshot().learnerTurn,null);assert.equal(s.theatre.getSnapshot().queue.length,0);assert.equal(env.audios.length,0);
});
test('switch to ordinary Theatre removes ownership and rejects old learner action',async()=>{
 const h=harness(),text='CLARA: Ah !';await h.session.start(text,'normal',h.doc,undefined,'CLARA');const old=h.session.theatre.getSnapshot().learnerTurn;assert.ok(old);assert.equal(h.stats.calls.length,0);
 h.session.stop();await h.session.start(text,'normal',h.doc);await until(()=>h.session.theatre.getSnapshot().status==='playing');assert.equal(h.session.theatre.getSnapshot().roleRun,null);assert.equal(h.session.theatre.continueLearner(old),false);assert.equal(h.stats.calls.length,1);h.session.dispose();
});
test('role UI displays exact canonical text and captures turn token without CP2 controls',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');const Panel=load('components/article-reader/RolePlayControls.tsx').default;
 const turn={text:'Ah…  Oui ?!',speaker:'CLARA',index:0,itemId:'line-1',run:runFor(1)};let received;
 const props={enabled:true,roles:['CLARA'],speaker:'CLARA',disabled:false,busy:true,playback:{learnerTurn:turn},onContinue:t=>{received=t;}};
 const tree=Panel(props);function nodes(n){return !n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)];}
 assert.ok(nodes(tree).some(n=>n.type==='p'&&n.props.children===turn.text));nodes(tree).find(n=>n.type==='button'&&n.props.children==='Continuer la scène').props.onClick({detail:1});assert.equal(received,turn);
 const html=renderToStaticMarkup(React.createElement(Panel,props));assert.match(html,/Votre tour/);assert.doesNotMatch(html,/Analyser|Écouter la réplique|Commencer l’enregistrement|score/);
});

test('Continue UI ignores second click of a pointer double-click after rerender',()=>{
 const React=require('react'),Panel=load('components/article-reader/RolePlayControls.tsx').default;let count=0;
 const turn={run:runFor(1),index:1,itemId:'line-2',speaker:'CLARA',text:'Oui.'};
 const tree=Panel({enabled:true,roles:['CLARA'],speaker:'CLARA',playback:{learnerTurn:turn},onContinue:()=>count++});
 function nodes(n){return !n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)];}
 const button=nodes(tree).find(n=>n.type==='button'&&n.props.children==='Continuer la scène');button.props.onClick({detail:2});assert.equal(count,0);button.props.onClick({detail:0});assert.equal(count,1);
});
