// scripts/card-citation-replay.mjs — powtórka historyczna: jakie reguły kart weryfikatory faktycznie cytowały
// (TASK-ORC-CONTEXT-CURATION-001). Czyta ~/.claude/metrics/verifier-archive/verifier-results.jsonl i katalog
// kart `patterns/**/_summary.md`; zero LLM, zero zapisu. Odpowiada na dwa pytania:
//   1. ile cytowań leży w sekcjach MUST/NEVER/RULES (= co zostaje w widoku kompaktowym kart),
//   2. porównanie polityk dostarczania kart weryfikatorowi warstwy: ile blokujących cytowań (NO_GO) dotyczyło karty,
//      której dana polityka NIE dostarczyłaby (P1 tagi = ORC-163, P7 tagi + katalogi przekrojowe, P0 komplet planu).
// Uruchom z korzenia repo: node scripts/card-citation-replay.mjs [prep.json]
import fs from 'node:fs'; import path from 'node:path';
const home = process.env.HOME;
// katalog ID kart: id -> {file, section, tags, cardChars, mustChars}
const cat = {}; const cards = [];
function walk(d){ for(const f of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,f.name); if(f.isDirectory()) walk(p); else if(f.name.endsWith('_summary.md')) cards.push(p);} }
walk('patterns');
for (const f of cards) {
  const txt = fs.readFileSync(f,'utf8'); const tags = ((/^\*\*Tags\*\*:\s*(.+)$/m.exec(txt)||[])[1]||'').match(/"([^"]+)"/g)?.map(s=>s.slice(1,-1))||[];
  let sec='(head)'; let must=0;
  for (const line of txt.split('\n')) {
    const h=/^##\s+(.+)/.exec(line); if(h) sec=h[1].trim().split(/\s/)[0].toUpperCase();
    if (/^(MUST|NEVER|RULES)/.test(sec)) must += line.length+1;
    const m=/^[-|]\s*\**([A-Z]{1,6}-?\d{1,3}[a-z]?)\**\b/.exec(line)||/^\*\*([A-Z]{1,6}-?\d{1,3}[a-z]?)\*\*/.exec(line);
    if (m) (cat[m[1]] ||= []).push({file:f, section:sec, tags});
  }
  cards[cards.indexOf(f)] = {file:f, chars:txt.length, must, tags};
}
const cardInfo = cards.filter(c=>typeof c==='object');
const totC = cardInfo.reduce((n,c)=>n+c.chars,0), totM = cardInfo.reduce((n,c)=>n+c.must,0);
console.log(`kart: ${cardInfo.length}, znaków ${totC}, w sekcjach MUST/NEVER ${totM} (${(100*totM/totC).toFixed(0)}%)`);
const secs={}; for(const l of Object.values(cat)) for(const e of l) secs[e.section]=(secs[e.section]||0)+1;
console.log('ID kart wg sekcji:', Object.entries(secs).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>k+':'+v).join(' '), '| ID razem', Object.keys(cat).length);
// archiwum werdyktów
const A = fs.readFileSync(home+'/.claude/metrics/verifier-archive/verifier-results.jsonl','utf8').trim().split('\n').map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
const text = r => [...(r.violations||[]),...(r.minor_findings||[])].map(v=>typeof v==='string'?v:JSON.stringify(v)).join('\n');
const idsOf = r => { const s=new Set(); for(const x of [...(r.ruleIds||[]),...(r.minorRuleIds||[])]) { const v=typeof x==='string'?x:x&&x.ruleId; if(v) s.add(String(v)); }
  for (const m of text(r).matchAll(/\b([A-Z]{1,6}-?\d{1,3}[a-z]?)\b/g)) s.add(m[1]); return s; };
const base = l => { const b=l.split(/[:-]/)[0]; return ['domain','application','infrastructure','testing'].includes(b)?b:null; };
const LAYER_TAGS = { domain:['api:domain'], application:['api:app'], infrastructure:['api:data-access','api:api-surface'], testing:['api:tests'] };
const match=(a,b)=>a===b||a.startsWith(b+':')||b.startsWith(a+':');
const delivered=(tags,layer)=>{ if(!tags.length||tags.some(t=>t.startsWith('any:'))) return true;
  const hit=Object.entries(LAYER_TAGS).filter(([,lt])=>lt.some(x=>tags.some(t=>match(t,x)))).map(([k])=>k);
  return hit.length===0 || hit.includes(layer); };


const catIds=new Set(Object.keys(cat));
const dirOf=f=>f.split('/')[1];
const POL={
 'P1 tagi (ORC-163 dziś)':(e,L)=>delivered(e.tags,L),
 'P7 tagi + katalogi cross-layer/architecture/testing':(e,L)=>delivered(e.tags,L)||['cross-layer','architecture','testing'].includes(dirOf(e.file)),
 'P8 tagi + wszystko poza katalogiem innej warstwy-domeny/infrastruktury':(e,L)=>delivered(e.tags,L)||!['domain','infrastructure','application'].includes(dirOf(e.file)),
 'P0 wszystkie karty planu':()=>true,
};
const vioIds=r=>{const s=new Set();for(const v of(r.violations||[])){const t=typeof v==='string'?v:JSON.stringify(v);for(const m of t.matchAll(/\b([A-Z]{1,6}-?\d{1,3}[a-z]?)\b/g))s.add(m[1])}for(const x of(r.ruleIds||[])){const v=typeof x==='string'?x:x&&x.ruleId;if(v)s.add(String(v))}return s};
// zestaw kart api-3 (20 kart) do liczenia rozmiaru: ścieżka -> znaki
// opcjonalnie: wynik `orchestrate-prepare --json` (argv[2]) do policzenia rozmiaru kart per warstwa
const prep=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):{patterns:[]};
const sizeOf=(L,pol)=>prep.patterns.reduce((n,p)=>{const f='patterns/'+p.path;const tags=((/^\*\*Tags\*\*:\s*(.+)$/m.exec(p.content)||[])[1]||'').match(/"([^"]+)"/g)?.map(x=>x.slice(1,-1))||[];return n+(pol({tags,file:f},L)?p.content.length:0)},0);
for(const [name,pol] of Object.entries(POL)){let n=0,lost=0;const rec=new Set(),recAll=new Set();
 for(const r of A){if(r.role!=='layer-verifier'||r.verdict!=='NO_GO')continue;const L=base(r.label);if(!L)continue;let any=false,lh=false;
  for(const id of vioIds(r)){if(!catIds.has(id))continue;any=true;n++;if(!cat[id].some(e=>pol(e,L))){lost++;lh=true}}
  if(any)recAll.add(r.key);if(lh)rec.add(r.key)}
 const sz=prep.patterns.length?['application','infrastructure','testing'].map(L=>Math.round(sizeOf(L,pol)/1000)+'k').join('/'):'(podaj prep.json)';
 console.log(name.padEnd(62),'utracone',String(lost).padStart(2)+'/'+n,'werdykty z utratą',rec.size+'/'+recAll.size,'| karty app/infra/test:',sz)}
