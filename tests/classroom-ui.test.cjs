const test=require("node:test"),assert=require("node:assert/strict");
const React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
const createLoader=require("./load-typescript.cjs"),load=createLoader();
const Panel=load("components/article-reader/ArticleTextPanel.tsx").default;
const {parseTheatreItems}=load("lib/theatre.ts");
const train=require("./last-train-fixture.cjs");
const article={title:train.title,text:train.text,source:"Fixture",contentType:"theatre"};
test("Theatre presentation marks active/practice by logical ID and keeps every source word",()=>{
 const items=parseTheatreItems(article.text);const html=renderToStaticMarkup(React.createElement(Panel,{article,onWordClick(){},selectedWord:null,activeItemId:items[1].id,practiceItemId:items[2].id}));
 assert.match(html,/aria-current="true"/);assert.match(html,/Point d’écoute/);assert.match(html,/Réplique en pratique/);assert.equal((html.match(/Chœur · ensemble/g)||[]).length,2);assert.equal((html.match(/Didascalie\./g)||[]).length,12);assert.match(html,/max-w-\[68ch\]/);
 assert.equal((html.match(/data-item-id=/g)||[]).length,47);
});
test("word handlers retain exact canonical offsets including repeated words, labels and multi-line speech",()=>{
 const direct=createLoader({react:{...React,useMemo:fn=>fn()}})("components/article-reader/ArticleTextPanel.tsx").default;
 for(const contentType of ["theatre","conversation","news","poetry"]){
  const text="[Une salle.]\nCLARA : Encore, encore !\nEncore ici.\n\nMARC: Euh... encore.";const clicks=[];
  const tree=direct({article:{...article,text,contentType},selectedWord:null,onWordClick:(word,offset)=>clicks.push({word,offset})});
  function walk(node){if(Array.isArray(node))return node.forEach(walk);if(!node||typeof node!=="object")return;if(node.type==="button")node.props.onClick();walk(node.props?.children);}walk(tree);
  assert.equal(clicks.length,text.match(/\S+/gu).length);for(const c of clicks)assert.equal(text.slice(c.offset,c.offset+c.word.length),c.word);assert.equal(new Set(clicks.map(c=>c.offset)).size,clicks.length);
 }
});
for(const contentType of ["news","opinion","creative","academic","everyday-life","poetry","conversation","tongue-twisters"])
 test(`${contentType} remains outside Theatre renderer`,()=>{const html=renderToStaticMarkup(React.createElement(Panel,{article:{...article,contentType},onWordClick(){},selectedWord:null,activeItemId:"line-1"}));assert.doesNotMatch(html,/data-item-id|Point d’écoute|Chœur · ensemble/);assert.match(html,/CLARA/);});
test("style/station aggregates are enum-only; all content-shaped payloads are rejected without breaking emit",()=>{
 const {BetaJournal}=load("lib/beta-events.ts"),j=new BetaJournal();j.emit({name:"theatre_style",performanceStyle:"naturel",contentType:"theatre"});j.emit({name:"ambience",environment:"station",status:"detected_available"});assert.equal(j.aggregate().counts["performanceStyle:naturel"],1);assert.equal(j.aggregate().counts["environment:station"],1);
 for(const field of ["text","transcript","audio","word","vocabularyWord","prompt","rawPrompt","ip","email"]){j.emit({name:"operation",[field]:"PRIVATE"});}j.emit({name:"theatre_style",performanceStyle:"PRIVATE"});j.emit({name:"ambience",environment:"PRIVATE"});assert.equal(j.inspect().length,2);assert.doesNotMatch(JSON.stringify(j.aggregate()),/PRIVATE/);
});
test("recording labels describe microphone actions and results retain measurement limits",()=>{
 const Controls=load("components/article-reader/ReadingControls.tsx").default;const html=renderToStaticMarkup(React.createElement(Controls,{isRecording:false,hasRecording:false}));assert.match(html,/Commencer l’enregistrement/);assert.match(html,/Arrêter l’enregistrement/);assert.match(html,/À vous de parler/);
 const Summary=load("components/pronunciation/PronunciationSummary.tsx").default;assert.match(renderToStaticMarkup(React.createElement(Summary,{summary:null})),/Aucune mesure acoustique/);
});

test("a colon within a stage direction never acquires character-label typography",()=>{const html=renderToStaticMarkup(React.createElement(Panel,{article:{...article,text:"[Une annonce : le train arrive.]"},selectedWord:null,onWordClick(){}}));assert.match(html,/Didascalie/);assert.doesNotMatch(html,/<strong/);});
