// Explicit simulated OWNER approval for existing playback regression fixtures.
// Raw preparation routes remain available to test the production gate itself.
function answer(entries){return {inventoryReviewed:true,entries:entries.map(e=>({...e,classification:'french-convention',language:'fr',target:'Conventional French pronunciation confirmed by fixture owner.'}))};}
function reviewedPrepare(prepare){return async req=>{
 const body=await req.clone().json(),response=await prepare(req);
 if(!response.ok || !response.headers.get('content-type')?.includes('application/json'))return response;
 const draft=await response.clone().json();if(draft.mode!=='pronunciation-clarification')return response;
 return prepare(new Request(req.url,{method:'POST',headers:req.headers,signal:req.signal,body:JSON.stringify({...body,pronunciationToken:draft.pronunciationToken,pronunciationAnswer:answer(draft.entries)})}));
};}
function reviewPlan(load,plan){const a=load('lib/theatre-pronunciation-authority.ts');plan.analysis={...require('./dramatic-fixtures.cjs').analysisFor(plan.items),...plan.analysis,pronunciation:proposalFor(plan.items)};delete plan.analysis.pronunciationInspection;const draft=a.draftPronunciation(plan,'fixture-source');plan.pronunciation=draft.status==='ready'?draft:a.acceptPronunciation(draft,answer(draft.entries),plan);return plan;}
module.exports={answer,reviewedPrepare,reviewPlan};

// Explicit semantic uncertainty for tests exercising the owner-answer boundary.
// This is successful model output, never a transport/validation failure fallback.
function proposalFor(items) {
 const load=require('./load-typescript.cjs')();
 const entries=load('lib/theatre-pronunciation.ts').pronunciationInventory(undefined,items);
 return {version:1,context:{productionLanguage:'fr',inventoryComplete:true},entries:entries.map(e=>({...e,resolution:{status:'unknown',basis:'uncertain',localLanguage:'fr',rationale:'Fixture deliberately leaves this lexical decision unresolved.'}}))};
}
module.exports.proposalFor=proposalFor;

module.exports.analysisFor=(items)=>({...require('./dramatic-fixtures.cjs').analysisFor(items),pronunciation:proposalFor(items)});
module.exports.analysisReply=(body)=>({status:'completed',output_text:JSON.stringify(module.exports.analysisFor(JSON.parse(body.input[1].content).items))});
