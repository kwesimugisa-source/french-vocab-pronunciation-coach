const assert=require('node:assert/strict');
const {AsyncLocalStorage}=require('node:async_hooks');
const createLoader=require('./load-typescript.cjs');
const {environment,deferred}=require('./playback-fixtures.cjs');
const {analysisFor,planFor}=require('./director-fixtures.cjs');
process.env.OPENAI_API_KEY='incremental-test-placeholder';
const scene=Array.from({length:50},(_,i)=>`${i===20||i===40?'LE CHŒUR':i%2?'CLARA':'MARC'}: Ligne ${i+1}. Ah, nous attendons le train avec nos amis dans cette grande gare et nous cherchons les billets pour partir ensemble avant la fin de la journée.`).join('\n');
const tick=()=>new Promise(r=>setImmediate(r));
async function until(fn){for(let i=0;i<1500;i++){if(fn())return;await tick();}assert.fail('state did not settle');}
function harness(speech){
 const scope=new AsyncLocalStorage();
 const stats={analyses:0,analysisInputs:[],calls:[],requests:[],active:0,peak:0};
 class OpenAI{constructor(){this.responses={create:async b=>{stats.analyses++;stats.analysisInputs.push(b);const {items}=JSON.parse(b.input[1].content);return {status:'completed',output_text:JSON.stringify({...analysisFor(items),director:planFor(items)})};}};this.audio={speech:{create:async(b,o)=>{if(scope.getStore()) scope.getStore().count++;stats.calls.push({body:b,options:o});stats.active++;stats.peak=Math.max(stats.peak,stats.active);try{return speech?await speech(b,o,stats):{arrayBuffer:async()=>Buffer.from(b.input)};}finally{stats.active--;}}}};}}
 const load=createLoader({openai:OpenAI}),prepare=load('app/api/read-passage/route.ts').POST,clip=load('app/api/theatre-clip/route.ts').POST;
 const fetcher=async(url,options)=>{const entry={url,count:0};stats.requests.push(entry);const response=await scope.run(entry,()=> (url.includes('theatre-clip')?clip:prepare)(new Request('http://localhost'+url,options)));entry.status=response.status;return response;};
 const env=environment(),session=new (load('lib/reading-playback.ts').ReadingPlaybackSession)(env,fetcher);
 const doc={documentId:'long-scene',revision:1,contentType:'theatre',language:'fr'};
 return {stats,load,prepare,clip,fetcher,env,session,doc};
}
const request=(body,signal)=>new Request('http://localhost/api/read-passage',{method:'POST',body:JSON.stringify(body),signal});

module.exports={harness,until,scene,tick,request};
