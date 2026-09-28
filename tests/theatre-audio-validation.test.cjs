const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./load-typescript.cjs')();
const {validateTheatreAudio}=load('lib/theatre-audio-validation.ts');
const {IncrementalTheatreLoader}=load('lib/theatre-incremental.ts');
const {deferred}=require('./playback-fixtures.cjs');
const buffer=(samples=[.01],duration=.00001)=>({length:samples.length,duration,numberOfChannels:1,getChannelData:()=>Float32Array.from(samples)});
for(const [name,data,status] of [
 ['zero frames',buffer([]),'invalid'],['zero duration',buffer([1],0),'invalid'],['infinite duration',buffer([1],Infinity),'invalid'],
 ['NaN duration',buffer([1],NaN),'invalid'],['nonfinite sample',buffer([NaN]),'invalid'],['infinite sample',buffer([Infinity]),'invalid'],
 ['silence',buffer([0,0]),'invalid'],['quiet short utterance',buffer([1e-30]),'valid'],['unavailable',null,'unavailable']
])test(`audio validation: ${name}`,async()=>assert.equal((await validateTheatreAudio('YQ==',new AbortController().signal,async()=>data)).status,status));
test('decoder rejection is invalid, abort is cancellation',async()=>{
 assert.equal((await validateTheatreAudio('YQ==',new AbortController().signal,async()=>{throw Error('decode');})).status,'invalid');
 const abort=new AbortController(),hold=deferred();const work=validateTheatreAudio('YQ==',abort.signal,()=>hold.promise);abort.abort();hold.resolve(buffer());await assert.rejects(work,{name:'AbortError'});
});
test('all channels are scanned; any nonzero channel suffices but nonfinite channel rejects',async()=>{
 const data={length:1,duration:.1,numberOfChannels:2,getChannelData:i=>Float32Array.of(i?1e-20:0)};
 assert.equal((await validateTheatreAudio('YQ==',new AbortController().signal,async()=>data)).status,'valid');
 data.getChannelData=i=>Float32Array.of(i?NaN:1);assert.equal((await validateTheatreAudio('YQ==',new AbortController().signal,async()=>data)).status,'invalid');
});
test('browser capability fallback and isolated decoding never render, play or fetch',async()=>{
 const old={OfflineAudioContext:global.OfflineAudioContext,document:global.document,fetch:global.fetch};
 try {
  global.fetch=()=>assert.fail('network forbidden');
  global.document={createElement:()=>({canPlayType:()=> 'probably',play:()=>assert.fail('play forbidden')})};
  global.OfflineAudioContext=undefined;
  assert.equal((await validateTheatreAudio('YQ==',new AbortController().signal)).status,'unavailable');
  global.OfflineAudioContext=class{constructor(){throw Error('unsupported');}};
  assert.equal((await validateTheatreAudio('YQ==',new AbortController().signal)).status,'unavailable');
  for(const [name,status] of [['NotSupportedError','unavailable'],['InvalidStateError','unavailable'],['EncodingError','invalid']]){
   global.OfflineAudioContext=class{async decodeAudioData(){throw Object.assign(Error(),{name});}};
   assert.equal((await validateTheatreAudio('YQ==',new AbortController().signal)).status,status);
  }
  global.OfflineAudioContext=class{async decodeAudioData(){return buffer();}startRendering(){assert.fail('render forbidden');}};
  assert.equal((await validateTheatreAudio('YQ==',new AbortController().signal)).status,'valid');
 }finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete global[k];else global[k]=v;}}
});
function fixture(validate,chorus=false){
 const calls=[];const clip={id:'item-0',index:0,type:'dialogue',speaker:'MARC',text:'Ah !',sourceLines:[1],voice:'alloy',speed:1,audioBase64:'',...(chorus?{chorus:{components:['alloy','ash','ballad'].map(voice=>({voice,audioBase64:''}))}}:{})};
 const manifest={clips:[clip]};
 const loader=new IncrementalTheatreLoader(manifest,async(_,options)=>{const {componentIndex}=JSON.parse(options.body);calls.push(componentIndex);return Response.json({mode:'theatre-component',itemId:clip.id,componentIndex,voice:clip.chorus?.components[componentIndex].voice??clip.voice,speed:1,audioBase64:'YQ=='});},()=>({}),7,false,validate);
 return {loader,calls};
}
test('invalid component never prepared/cached; retry preserves successful chorus components',async()=>{
 let count=0;const {loader,calls}=fixture(async()=>({status:++count===2?'invalid':'valid'}),true);
 await assert.rejects(loader.load(0),/inutilisable/);
 assert.deepEqual(loader.getDiagnostics().filter(e=>e.phase==='prepared').map(e=>e.component),[0]);
 const result=await loader.load(0);assert.deepEqual(calls,[0,1,1,2]);assert.ok(result.chorus.components.every(c=>c.audioBase64));
 assert.ok(loader.getDiagnostics().some(e=>e.phase==='cached'&&e.component===0));
});
test('unavailable validation accepts existing safe response and records unavailable',async()=>{
 const {loader,calls}=fixture(async()=>({status:'unavailable'}));assert.equal((await loader.load(0)).audioBase64,'YQ==');assert.equal(calls.length,1);
 assert.ok(loader.getDiagnostics().some(e=>e.phase==='validation_unavailable'));
});
test('stopped/replaced loader cannot attach late decoding result',async()=>{
 const hold=deferred();let started=false;const {loader}=fixture(async()=>{started=true;return hold.promise;});
 const work=loader.load(0);while(!started)await new Promise(r=>setImmediate(r));loader.dispose();hold.resolve({status:'valid'});await assert.rejects(work);
 assert.equal(loader.getDiagnostics().some(e=>e.phase==='prepared'),false);assert.ok(loader.getDiagnostics().some(e=>e.phase==='stale'));
});
