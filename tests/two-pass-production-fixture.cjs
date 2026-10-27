// Deterministic, fabricated engineering control; no user-authored content.
const names=['ALICE','MARC','JULIE','PAUL'];
function productionText(){const rows=[];for(let i=0;i<39;i++){
 rows.push(i===0?'[Alice, Marc, Julie et Paul sont présents dans une salle calme. Ils préparent ensemble une réunion.]':i===13?'[Les quatre amis terminent la liste et commencent à installer les chaises.]':i===26?'[Les quatre amis ont installé les chaises et vérifient maintenant la salle.]':'[Les quatre amis restent ensemble dans la salle et poursuivent leur travail calmement.]');
 rows.push(`${names[(i*2)%4]} : ${i<13?'Nous préparons la liste pour notre réunion. Chaque personne aura une place.':i<26?'Nous installons les chaises pour notre réunion. La salle sera bientôt prête.':'Nous vérifions la salle avant notre réunion. Tout doit rester simple et accueillant.'}`);
 rows.push(i%13===12?'LE CHŒUR : Ensemble, nous sommes prêts.':`${names[(i*2+1)%4]} : Oui, avançons tranquillement. Nous avons le temps de terminer ce travail ensemble.`);
 }return rows.join('\n');}
module.exports={productionText};
