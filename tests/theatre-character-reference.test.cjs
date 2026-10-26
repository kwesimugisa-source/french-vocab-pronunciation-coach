const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const load=require('./load-typescript.cjs')();const p=load('lib/theatre-pass-provider.ts'),cp=load('lib/theatre-two-pass.ts'),protocol=load('lib/theatre-preparation-protocol.ts');
const {fixture,unwrap}=require('./two-pass-protocol-fixtures.cjs'),{state,ref}=require('./director-fixtures.cjs');
function setup(){const f=fixture();f.data.director.relationships=[{from:'ALICE',to:'MARC',since:f.p.items[0].id,kind:'unknown',stance:'unknown',evidence:[]}];f.data.director.beats[0].states=[state('ALICE',f.p.items[0])];f.production=unwrap(cp.acceptProductionDirection(f.p,f.data));
 const first=protocol.beginPreparation(f.p),accepted=protocol.acceptPass1(first,f.production),second=protocol.beginPass2(accepted,randomUUID());
 f.delivery.lines[0].hearers=['MARC'];f.delivery.lines[0].addressee='MARC';return{...f,first,second};}
const sites=[['relationship.from','pass1',v=>v.director.relationships[0],'from','ALICE'],['relationship.to','pass1',v=>v.director.relationships[0],'to','MARC'],
 ['beat.present','pass1',v=>v.director.beats[0].present,0,'ALICE'],['state.speaker','pass1',v=>v.director.beats[0].states[0],'speaker','ALICE'],
 ['line.hearers','pass2',v=>v.lines[0].hearers,0,'MARC'],['line.addressee','pass2',v=>v.lines[0],'addressee','MARC']];
for(const[name,pass,at,key,id]of sites)test(name+' exact accepted; casing variants and unknown rejected by schema AND CP1',()=>{
 const f=setup(),s=pass==='pass1'?f.first:f.second,schema=p.characterBoundSchema(s,pass),base=pass==='pass1'?f.data:f.delivery;
 const wrap=v=>pass==='pass1'?v:{performance:v};assert.equal(p.matchesPassSchema(wrap(base),schema),true);
 for(const bad of [id.toLowerCase(),id[0]+id.slice(1).toLowerCase(),'UNKNOWN']){const raw=structuredClone(base);at(raw)[key]=bad;assert.equal(p.matchesPassSchema(wrap(raw),schema),false);
 const result=pass==='pass1'?cp.acceptProductionDirection(f.p,raw):cp.acceptPerformanceDirection(f.p,f.production,f.second.authority,raw);assert.equal(result.ok,false);assert.equal(at(raw)[key],bad);}
 // Canonical parser IDs are uppercase: uppercasing an already exact ID is not an invalid variant.
 assert.equal(id.toUpperCase(),id);
});
test('all six actual request schema sites have exact canonical enums, nullable addressee preserved',()=>{const f=setup(),a=p.buildPassRequest(f.first,'pass1'),b=p.buildPassRequest(f.second,'pass2'),ids=['ALICE','MARC'];
 const d=a.text.format.schema.properties.director.properties,beat=d.beats.items.properties,line=b.text.format.schema.properties.performance.anyOf[0].properties.lines.items.properties;
 for(const schema of [d.relationships.items.properties.from,d.relationships.items.properties.to,beat.present.items,beat.states.items.properties.speaker,line.hearers.items])assert.deepEqual(schema.enum,ids);
 assert.deepEqual(line.addressee.enum,[...ids,null]);assert.equal(p.matchesPassSchema(null,line.addressee),true);
 assert.deepEqual(JSON.parse(a.input[1].content).canonicalCharacterIds,ids);
 for(const request of [a,b])for(const word of ['opaque','case-sensitive','exactly','title-case','lowercase','uppercase','translate','normalize','abbreviate','respell','invent'])assert.ok(request.input[0].content.includes(word));
});
test('uppercase is rejected when not the exact opaque identifier; no case-insensitive enum matching',()=>{const schema={type:'string',enum:['aLiCe']};assert.equal(p.matchesPassSchema('aLiCe',schema),true);for(const value of ['ALICE','alice','Alice'])assert.equal(p.matchesPassSchema(value,schema),false);});
test('request-local binding never mutates reusable schemas or lexical identity fields',()=>{const before=JSON.stringify([p.PASS1_SCHEMA,p.PASS2_SCHEMA]),f=setup();const a=p.buildPassRequest(f.first,'pass1'),b=p.buildPassRequest(f.second,'pass2');
 assert.equal(JSON.stringify([p.PASS1_SCHEMA,p.PASS2_SCHEMA]),before);assert.deepEqual(a.text.format.schema.properties.pronunciation,load('lib/theatre-pronunciation.ts').PRONUNCIATION_SCHEMA);
 for(const request of [a,b]){const input=JSON.parse(request.input[1].content);assert.deepEqual(input.items,f.p.items);assert.deepEqual(input.characters,f.p.characters);}
 assert.equal(f.p.text,fixture().p.text);assert.deepEqual(p.acceptedProjection(f.second).beats[0].present,['ALICE','MARC']);assert.equal(p.acceptedProjection(f.second).beats[0].states[0].speaker,'ALICE');
});
test('captured-case-shape failure is rejected without post-generation normalization',async()=>{const f=setup(),raw=structuredClone(f.data);raw.director.relationships[0].from='Alice';raw.director.relationships[0].to='Marc';const text=JSON.stringify(raw);
 const client={responses:{create:async()=>({status:'completed',output:[],output_text:text})}};
 await assert.rejects(p.requestPass(client,f.first,'pass1'),e=>e.reason==='validation_rejected');assert.equal(JSON.stringify(raw),text);
 const rejected=cp.acceptProductionDirection(f.p,raw);assert.equal(rejected.error.reason,'unknown_character');assert.equal(rejected.error.path,'production.director.relationships[0]');
});
test('empty canonical cast forbids all identity-bearing entries without invalid empty enums',()=>{const f=fixture('[La salle est vide.]'),s=protocol.beginPreparation(f.p),a=p.characterBoundSchema(s,'pass1');assert.equal(p.matchesPassSchema(f.data,a),true);
 const d=a.properties.director.properties,beat=d.beats.items.properties;assert.equal(d.relationships.maxItems,0);assert.equal(beat.present.maxItems,0);assert.equal(beat.states.maxItems,0);
 const second=protocol.beginPass2(protocol.acceptPass1(s,f.production),randomUUID()),b=p.characterBoundSchema(second,'pass2');assert.equal(b.properties.performance.anyOf[0].properties.lines.maxItems,0);assert.equal(p.matchesPassSchema({performance:f.delivery},b),true);assert.doesNotMatch(JSON.stringify([a,b]),/"enum":\[\]/);
 const bad=structuredClone(f.data);bad.director.beats[0].present=['INVENTED'];assert.equal(p.matchesPassSchema(bad,a),false);
});
