// Test-only collector for pre-incremental content/casting contract assertions.
// Every byte still passes through the real bounded routes. This helper is NOT
// the browser transport; incremental lifecycle tests use the raw routes.
module.exports = function completeReading(load) {
 const prepare=load('app/api/read-passage/route.ts').POST,component=load('app/api/theatre-clip/route.ts').POST;
 return async req=>{
  const response=await prepare(req);if(!response.ok || !response.headers.get('content-type')?.includes('application/json'))return response;
  const data=await response.clone().json();if(data.protocol!=='incremental-v1')return response;
  const failedItems=[];let generated=0;
  for(const clip of data.clips){let failed=false;const parts=clip.chorus?.components??[{voice:clip.voice,audioBase64:''}];
   for(let i=0;i<parts.length;i++){
    const reply=await component(new Request(new URL('/api/theatre-clip',req.url),{method:'POST',body:JSON.stringify({sceneToken:data.sceneToken,itemId:clip.id,componentIndex:i}),signal:req.signal}));
    if(!reply.ok){failed=true;continue;}const audio=await reply.json();parts[i].audioBase64=audio.audioBase64;if(!i)clip.audioBase64=audio.audioBase64;
   }
   if(failed)failedItems.push({id:clip.id,index:clip.index,sourceLines:clip.sourceLines});else generated++;
  }
  // Legacy integrity assertions inspect an assembled collection, not an HTTP
  // all-or-nothing server generation operation. New tests assert retained parts.
  if(failedItems.length)return Response.json({error:{code:'THEATRE_GENERATION_FAILED',message:'Theatre audio generation failed for one or more items.',failedItems,parsedItemCount:data.clips.length,expectedClipCount:data.clips.length,generatedClipCount:generated}},{status:500});
  data.integrity.generatedClipCount=generated;delete data.protocol;delete data.sceneToken;
  return Response.json(data);
 };
};
