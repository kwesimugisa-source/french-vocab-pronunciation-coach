// Constructed acceptance excerpt, not a claim to reproduce the full unavailable play.
const table = `[Un restaurant calme. Thomas et Élise sont assis à une table.]
[Thomas plie et replie sa serviette.]
ÉLISE : Tu es nerveux ?
THOMAS : Je ne suis pas nerveux.
ÉLISE : Tu n'as pas changé.
THOMAS : Toi non plus.
ÉLISE : Toi non plus. C'est inquiétant.
[Thomas prend une longue inspiration.]
ÉLISE : Que veux-tu vraiment ?
THOMAS : Toi.
ÉLISE : Oui.
THOMAS : Euh... j'avais beaucoup plus de mots dans la version trois.
LE CHŒUR : Ah !
THOMAS : Oh.
ÉLISE : Hmm ?
THOMAS : Oups.
ÉLISE : Thomas...`;
const createLoader = require('./load-typescript.cjs');
const load = createLoader();
const {parseTheatreItems} = load('lib/theatre.ts');
const {theatreRole} = load('lib/theatre-casting.ts');
const {analysisFor} = require('./dramatic-fixtures.cjs');
const ref = item => ({itemId:item.id, quote:item.text.slice(0,240)});
const fact = (value,item) => ({value,evidence:item?[ref(item)]:[]});
function planFor(items) {
 return {version:1,setting:{location:fact('unknown'),social:fact('unknown'),time:fact('unknown'),privacy:fact('unknown'),noise:fact('unknown')},relationships:[],beats:[],
 lines:items.filter(i=>theatreRole(i)==='character').map(i=>({itemId:i.id,addressee:null,hearers:[],intent:'respond',subtext:'unknown',pace:'steady',projection:'conversational',audience:'unknown',evidence:[ref(i)]}))};
}
const state = (speaker,item,overrides={})=>({speaker,objective:'respond to the other person',knowledge:'unknown',emotion:'neutral',intensity:'restrained',confidence:'unknown',openness:'unknown',urgency:'ordinary',evidence:[ref(item)],...overrides});
function tablePlan(items=parseTheatreItems(table)) {
 const p=planFor(items);
 p.setting={location:fact('restaurant',items[0]),social:fact('shared dining space',items[0]),time:fact('unknown'),privacy:fact('semi-private',items[0]),noise:fact('quiet',items[0])};
 p.beats=[{at:items[0].id,event:fact('Seated together at a restaurant table',items[0]),present:['THOMAS','ÉLISE'],presenceEvidence:[ref(items[0])],states:[]},
 {at:items[2].id,event:fact('Visible nervous movement is questioned',items[2]),present:['THOMAS','ÉLISE'],presenceEvidence:[ref(items[0])],states:[state('THOMAS',items[1],{objective:'conceal nervousness',emotion:'uncertain',openness:'guarded',evidence:[ref(items[1]),ref(items[2])]})]},
 {at:items[7].id,event:fact('Thomas prepares to answer',items[7]),present:['THOMAS','ÉLISE'],presenceEvidence:[ref(items[0])],states:[state('THOMAS',items[7],{objective:'express affection',emotion:'warm',openness:'open'})]},
 {at:items[10].id,event:fact('Elise responds affirmatively',items[10]),present:['THOMAS','ÉLISE'],presenceEvidence:[ref(items[0])],states:[state('THOMAS',items[10],{objective:'respond to acceptance',knowledge:'Elise has said yes',emotion:'relieved',openness:'open'})]}];
 p.relationships=[{from:'ÉLISE',to:'THOMAS',since:items[4].id,kind:'acquaintances',stance:'teasing',evidence:[ref(items[4])]}];
 for(const line of p.lines){const i=items.find(x=>x.id===line.itemId);line.addressee=i.speaker==='THOMAS'?'ÉLISE':'THOMAS';line.hearers=[line.addressee];line.audience='direct';}
 Object.assign(p.lines.find(l=>l.itemId===items[3].id),{intent:'deny',subtext:'restrained defensive denial',evidence:[ref(items[1]),ref(items[2]),ref(items[3])]});
 Object.assign(p.lines.find(l=>l.itemId===items[9].id),{intent:'confess',subtext:'a personal answer after preparation',projection:'soft',evidence:[ref(items[7]),ref(items[8])]});
 return p;
}
module.exports={table,tablePlan,planFor,ref,fact,state,parseTheatreItems,analysisFor};
