// Mock-provider wire adapter ONLY. Existing hand-authored test scenarios keep
// their semantic intent while selecting spans from the actual request catalogue.
// Never imported by production; invalid authored fixture quotes stay invalid.
function selectFixtureEvidence(raw,request) {
 const catalogue=JSON.parse(request.input[1].content).evidenceCatalogue;
 function walk(v){if(Array.isArray(v))return v.map(walk);if(v&&typeof v==='object'){
  if(typeof v.itemId==='string'&&typeof v.quote==='string'){
   const spans=catalogue.entries.filter(e=>e.itemId===v.itemId);
   return (spans.find(e=>e.quote===v.quote)??spans.find(e=>v.quote.includes(e.quote)))?.ref??`e_${catalogue.scope}_zzz`;
  }
  return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)]));
 }return v;}return walk(raw);
}
function mockEvidenceResponse(response,request) {
 if(request.text.format.name!=='theatre_pass1'||typeof response?.output_text!=='string')return response;
 let raw;try{raw=JSON.parse(response.output_text);}catch{return response;}
 return {...response,output_text:JSON.stringify(selectFixtureEvidence(raw,request))};
}
module.exports={selectFixtureEvidence,mockEvidenceResponse};
