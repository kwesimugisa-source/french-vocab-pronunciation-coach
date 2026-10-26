const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const createLoader = require('./load-typescript.cjs');
const load = createLoader({openai:class {constructor(){throw Error('Provider forbidden');}}});
const api = load('lib/theatre-two-pass.ts');
const {planFor,analysisFor,state,ref} = require('./director-fixtures.cjs');
const clone = structuredClone;
const unwrap = r => {assert.equal(r.ok,true,JSON.stringify(r.ok?null:r.error));return r.value;};
const rejected = (r,reason) => {assert.equal(r.ok,false);if(reason)assert.equal(r.error.reason,reason);return r.error;};
const source = '[Alice et Marc attendent dans une salle.]\nALICE: Bonjour, Marc.\nMARC: Bonjour, Alice.\n[Alice et Marc restent dans la salle.]\nALICE: Nous attendons.';
function authorityHash(a){a.digest=createHash('sha256').update(JSON.stringify({...a,digest:undefined})).digest('hex');return a;}
function fixture(text=source,style='naturel') {
  const p=unwrap(api.createCanonicalPreparation(text,{productionId:'fixture-production',documentId:'fixture',documentRevision:1,performanceStyle:style}));
  const {items}=p;
  const director=planFor(items);
  const characters=[...new Set(items.filter(i=>load('lib/theatre-casting.ts').theatreRole(i)==='character').map(i=>i.speaker))];
  director.beats=[{at:items[0].id,event:{value:'unknown',evidence:[]},present:characters,presenceEvidence:[ref(items[0])],states:[]}];
  const proposal={version:1,context:{productionLanguage:'fr',inventoryComplete:true},entries:characters.map((name,i)=>({
    id:`cast-${i}`,name,aliases:[],classification:'french-convention',language:'fr',target:'French convention',
    evidence:[ref(items.find(item=>item.text.toUpperCase().includes(name)))],
    resolution:{status:'established',basis:'convention',localLanguage:'fr',rationale:'Established French dialogue'}
  }))};
  const ambience={environment:'none',confidence:'high',basis:'explicit',evidence:[],rationale:'No ambient layer',contradictory:false};
  const {lines,...global}=director;
  const data={version:1,scene:analysisFor(items).scene,director:global,ambience,pronunciation:proposal};
  const production=unwrap(api.acceptProductionDirection(p,data));
  const legacy={items,casting:p.casting,performanceStyle:style,pronunciationCharacters:[],analysis:{...analysisFor(items),director,ambience,pronunciation:proposal},direction:{fallbackReason:null}};
  const draft=load('lib/theatre-pronunciation-authority.ts').draftPronunciation(legacy,p.sourceDigest);
  const authority=authorityHash({...clone(draft),productionId:p.productionId});
  const delivery={version:1,items:analysisFor(items).items,lines};
  const performance=unwrap(api.acceptPerformanceDirection(p,production,authority,delivery));
  return {p,data,production,authority,delivery,performance};
}

module.exports={fixture,unwrap,source,authorityHash};
