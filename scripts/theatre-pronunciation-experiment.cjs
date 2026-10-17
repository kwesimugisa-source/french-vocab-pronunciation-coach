// CP1.2A only. --prepare is offline; --generate permits at most 36 SDK calls.
// Artifacts must live OUTSIDE the repository. No automatic retries, no Director API.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function write(p,value){
 const tmp=p+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));
 // Windows file scanners can briefly hold the destination. Retry ONLY the
 // local atomic rename, never synthesis. A failed write stops generation.
 for(let attempt=0;;attempt++)try{fs.renameSync(tmp,p);return;}catch(error){
  if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=20)throw error;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);
 }
}
const cases=[
 ['isolated-exclamation','Thomas !'],['isolated-question','Thomas ?'],
 ['short','Je vois Thomas.'],['long','Nous avons attendu Thomas pendant toute la soirée pour lui raconter ce qui est arrivé à notre famille.'],
 ['beginning','Thomas, viens nous rejoindre à cette table.'],['end','Viens nous rejoindre à cette table, Thomas.']
];
function outsideRepo(directory){
 const root=path.resolve(__dirname,'..'),out=path.resolve(directory),rel=path.relative(root,out);
 if(!rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))throw Error('Use an artifact directory outside the repository.');return out;
}
async function preparePackage(directory){
 const out=outsideRepo(directory);if(fs.existsSync(out))throw Error('Package already exists; never overwrite an experiment.');
 const load=require('../tests/load-typescript.cjs')();
 const {planFor,analysisFor}=require('../tests/director-fixtures.cjs');
 const text='THOMAS: Je suis ici.\n'+cases.map(([,text])=>'JULIEN: '+text).join('\n');
 const plan=await load('lib/theatre-generation.ts').prepareTheatrePlan(text,{directorEnabled:true,
  analyze:async()=>{const items=load('lib/theatre.ts').parseTheatreItems(text);return {...analysisFor(items),director:planFor(items)};}});
 if(!plan.analysis?.director)throw Error('Fixture Director was not accepted.');
 // Freeze one validated fixture plan; remove ephemeral cache reference.
 delete plan.analysisCacheKey;
 const voice=plan.casting.members.find(m=>m.speaker==='JULIEN'&&m.role==='character').voice;
 const {theatreSpeechInstructions,THEATRE_INSTRUCTION_BUDGET}=load('lib/theatre-speech-instructions.ts');
 const {dramaticInstructions}=load('lib/theatre-direction.ts'),{pronunciationInstructions}=load('lib/document-language.ts');
 const entries=[];
 for(const style of ['clarte','naturel'])for(let i=0;i<cases.length;i++){
  const item=plan.items[i+1],instructions=theatreSpeechInstructions('fr',item,plan.analysis,style,{voice,items:plan.items});
  const request={model:'gpt-4o-mini-tts',voice,input:item.text,speed:1,instructions};
  if(instructions.length>THEATRE_INSTRUCTION_BUDGET)throw Error('Instruction budget exceeded.');
  const before=pronunciationInstructions('fr',dramaticInstructions(item,plan.analysis,style,{voice,items:plan.items})).length;
  for(let repetition=1;repetition<=3;repetition++)entries.push({caseId:cases[i][0],style,repetition,input:item.text,request,
   instructionCharacters:instructions.length,beforeInstructionCharacters:before,instructionHash:hash(instructions),requestHash:hash(JSON.stringify(request)),status:'pending'});
 }
 for(let i=entries.length-1;i>0;i--){const j=crypto.randomInt(i+1);[entries[i],entries[j]]=[entries[j],entries[i]];}
 entries.forEach((e,i)=>{e.clipId='clip-'+String(i+1).padStart(2,'0');e.audioFilename='audio/'+e.clipId+'.mp3';});
 fs.mkdirSync(path.join(out,'audio'),{recursive:true});fs.mkdirSync(path.join(out,'answer-key'));
 write(path.join(out,'answer-key','fixture-plan.json'),plan);
 write(path.join(out,'answer-key','manifest.json'),{version:1,provenance:'Locally validated deterministic fixture; NOT the production scene capture',maxCalls:36,
  options:{timeout:55000,maxRetries:0},planHash:hash(JSON.stringify(plan)),entries});
 write(path.join(out,'call-ledger.json'),{version:1,attempts:[]});
 fs.writeFileSync(path.join(out,'listening-sheet.csv'),'clip_id,french,english,uncertain_other,question_delivery_yes_no_na,notes\n'+entries.map(e=>e.clipId+',,,,,').join('\n')+'\n');
 fs.writeFileSync(path.join(out,'LISTEN.html'),`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Écoute anonyme</title><style>body{font:18px system-ui;max-width:800px;margin:30px auto;padding:16px}section{padding:15px;border-bottom:1px solid #ccc}audio{width:100%}</style><h1>Écoute anonyme — CP1.2A</h1><p>Écoutez dans cet ordre. Notez dans listening-sheet.csv : français, anglais ou incertain/autre. Pour une question, évaluez sa formulation interrogative; sinon indiquez N/A. N’ouvrez pas answer-key avant de terminer. Les différences de fichiers ne prouvent pas des différences de prononciation.</p>${entries.map(e=>`<section><h2>${e.clipId}</h2><audio controls preload="none" src="${e.audioFilename}"></audio></section>`).join('')}</html>`);
 return {clips:entries.length,voice,budget:THEATRE_INSTRUCTION_BUDGET};
}
async function generatePackage(directory,speech){
 const out=outsideRepo(directory),lock=path.join(out,'generation.lock');let fd;
 try{fd=fs.openSync(lock,'wx');}catch{throw Error('Generation locked; inspect ledger before any manual recovery.');}
 try{
  const file=path.join(out,'answer-key','manifest.json'),manifest=read(file),ledgerFile=path.join(out,'call-ledger.json'),ledger=read(ledgerFile);
  if(manifest.maxCalls!==36||manifest.entries.length!==36||ledger.attempts.length>36)throw Error('Invalid experiment accounting.');
  for(const e of manifest.entries){
   if(ledger.attempts.some(a=>a.clipId===e.clipId))continue; // An attempted failure is never retried.
   if(ledger.attempts.length>=36)throw Error('Authorized limit reached.');
   if(hash(JSON.stringify(e.request))!==e.requestHash||hash(e.request.instructions)!==e.instructionHash||e.request.instructions.length>3800)throw Error('Frozen request changed.');
   const attempt={clipId:e.clipId,requestHash:e.requestHash,status:'attempted'};ledger.attempts.push(attempt);write(ledgerFile,ledger);
   try{
    const response=await speech(e.request,{timeout:55000,maxRetries:0});
    const audio=Buffer.from(await response.arrayBuffer());if(!audio.length)throw Error('Empty audio');
    fs.writeFileSync(path.join(out,e.audioFilename),audio);e.audioHash=hash(audio);e.audioBytes=audio.length;e.status='completed';attempt.status='completed';
   }catch{e.status='failed';attempt.status='failed';} // Never persist provider errors/headers.
   write(file,manifest);write(ledgerFile,ledger);
  }
  const summary={attemptedCalls:ledger.attempts.length,completed:manifest.entries.filter(e=>e.status==='completed').length,failed:manifest.entries.filter(e=>e.status==='failed').length,
   groups:cases.flatMap(([caseId])=>['clarte','naturel'].map(style=>{const group=manifest.entries.filter(e=>e.caseId===caseId&&e.style===style);return {caseId,style,requestHashes:new Set(group.map(e=>e.requestHash)).size,audioHashes:new Set(group.filter(e=>e.audioHash).map(e=>e.audioHash)).size,before:group[0].beforeInstructionCharacters,after:group[0].instructionCharacters};})),
   limitation:'Audio hash differences do not establish pronunciation differences. Await human listening.'};
  write(path.join(out,'answer-key','summary.json'),summary);return summary;
 }finally{if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);}}
}
module.exports={preparePackage,generatePackage};
if(require.main===module)(async()=>{
 const [mode,directory]=process.argv.slice(2);if(!directory||!['--prepare','--generate'].includes(mode))throw Error('Use --prepare or --generate and an external output directory.');
 if(mode==='--prepare'){console.log(JSON.stringify(await preparePackage(directory)));return;}
 // Load credentials locally, never into the manifest, ledger, stdout or errors.
 require('@next/env').loadEnvConfig(path.resolve(__dirname,'..'),false,{info(){},error(){}});
 if(!process.env.OPENAI_API_KEY)throw Error('Provider credential unavailable.');
 const OpenAI=require('openai');const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0});
 console.log(JSON.stringify(await generatePackage(directory,(body,options)=>client.audio.speech.create(body,options))));
})().catch(()=>{console.error('Experiment stopped. Inspect local accounting; no automatic retries.');process.exitCode=1;});
