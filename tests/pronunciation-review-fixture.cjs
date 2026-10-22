// Explicit simulated OWNER approval for existing playback regression fixtures.
// Raw preparation routes remain available to test the production gate itself.
function answer(entries){return {inventoryReviewed:true,entries:entries.map(e=>({...e,classification:'french-convention',language:'fr',target:'Conventional French pronunciation confirmed by fixture owner.'}))};}
function reviewedPrepare(prepare){return async req=>{
 const body=await req.clone().json(),response=await prepare(req);
 if(!response.ok || !response.headers.get('content-type')?.includes('application/json'))return response;
 const draft=await response.clone().json();if(draft.mode!=='pronunciation-clarification')return response;
 return prepare(new Request(req.url,{method:'POST',headers:req.headers,signal:req.signal,body:JSON.stringify({...body,pronunciationToken:draft.pronunciationToken,pronunciationAnswer:answer(draft.entries)})}));
};}
function reviewPlan(load,plan){const a=load('lib/theatre-pronunciation-authority.ts');const draft=a.draftPronunciation(plan,'fixture-source');plan.pronunciation=a.acceptPronunciation(draft,answer(draft.entries),plan);return plan;}
module.exports={answer,reviewedPrepare,reviewPlan};
