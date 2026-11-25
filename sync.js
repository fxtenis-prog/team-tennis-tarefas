/* Team Tennis: OAuth client-side; no client secret or API key. */
(()=>{
'use strict';
const CLIENT_ID='234420364719-8kbakbe0pmfk1hid2t6m09fm0briro4t.apps.googleusercontent.com';
const SHEET_ID='158PxVFwVwSBBzuWyXUHBsLs-5UAQeg8jT9IYoLFrnVk';
const SCOPE='https://www.googleapis.com/auth/spreadsheets';
let tokenClient=null,accessToken='',expiresAt=0,remote=new Map(),rows=new Map(),ready=false,busy=false,queue=Promise.resolve();
const LAST_SYNC='team-tennis-last-synced-v1';
function fingerprint(list){return JSON.stringify(list.map(t=>[t.id,t.title,t.due||'',t.priority,t.repeat,!!t.done,t.order??null]).sort((a,b)=>a[0].localeCompare(b[0])))}
const status=document.createElement('p');status.className='muted';status.id='cloud-status';status.textContent='Planilha desconectada. Tarefas salvas apenas neste aparelho.';
const btn=document.createElement('button');btn.className='primary';btn.textContent='Conectar Google Sheets';
const refresh=document.createElement('button');refresh.textContent='Atualizar da planilha';refresh.hidden=true;
const cloud=document.createElement('section');cloud.className='card';const h=document.createElement('h2');h.textContent='☁️ Sincronização Google';cloud.append(h,btn,refresh,status);
document.querySelector('main').insertBefore(cloud,document.querySelector('main').children[1]);
const say=s=>status.textContent=s;
const esc=s=>encodeURIComponent(s);
const range=r=>esc("'Tarefas'!"+r);
const url=r=>'https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values/'+range(r);
function valid(){return accessToken&&Date.now()<expiresAt-60000}
async function api(method,path,body){if(!valid())throw Error('Sessão Google expirada. Conecte novamente.');const r=await fetch(path,{method,headers:{Authorization:'Bearer '+accessToken,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});if(!r.ok){if(r.status===401){accessToken='';expiresAt=0;}const txt=await r.text();throw Error('Google Sheets '+r.status+': '+txt.slice(0,220))}return r.json()}
function iso(v){v=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):''}
function bool(v){return /^(true|sim|yes|1|conclu[ií]da)$/i.test(String(v||'').trim())}
function fromRow(a){return {id:String(a[0]||''),title:String(a[1]||''),due:iso(a[2]),priority:['Alta','Normal','Baixa'].includes(a[3])?a[3]:'Normal',repeat:({Diária:'daily',Semanal:'weekly',Mensal:'monthly',daily:'daily',weekly:'weekly',monthly:'monthly'}[a[4]]||'none'),done:bool(a[5]),order:Number.isFinite(Number(a[8]))&&String(a[8]||'').trim()!==''?Number(a[8]):null}}
function toRow(t){return [t.id,t.title,t.due||'',t.priority||'Normal',t.repeat||'none',t.done?'TRUE':'FALSE',t.created||new Date().toISOString(),new Date().toISOString(),t.order??'']}
async function readCloud(){const x=await api('GET',url('A2:I')+'?valueRenderOption=FORMATTED_VALUE');const list=x.values||[];remote.clear();rows.clear();list.forEach((r,i)=>{if(r[0]){const t=fromRow(r);remote.set(t.id,t);rows.set(t.id,i+2)}});return [...remote.values()].sort((a,b)=>a.order===null&&b.order===null?rows.get(b.id)-rows.get(a.id):a.order===null?-1:b.order===null?1:a.order-b.order)}
const fields=['title','due','priority','repeat','done','order'];
const norm=(t,k)=>k==='done'?!!t[k]:k==='order'?(t[k]??null):(t[k]||'');
const equal=(a,b)=>fields.every(k=>norm(a,k)===norm(b,k));
function baseline(){try{const a=JSON.parse(localStorage.getItem(LAST_SYNC)||'null');return Array.isArray(a)?new Map(a.map(x=>[x[0],{id:x[0],title:x[1],due:x[2],priority:x[3],repeat:x[4],done:x[5],order:x[6]}])):null}catch{return null}}
const note=document.querySelector('.note');if(note)note.textContent='Sincronização automática quando conectado. Alterações offline ficam neste aparelho. Exporte backups regularmente.';
let revision=0,again=false,timer=null;
function schedule(){revision++;clearTimeout(timer);timer=setTimeout(()=>sync(),500)}
const originalPersist=persist;
persist=function(){
 const known=tasks.filter(t=>typeof t.order==='number'&&Number.isFinite(t.order));
 const min=known.length?Math.min(...known.map(t=>t.order)):0;
 let next=min-tasks.filter(t=>t.order==null).length;
 for(const t of tasks)if(t.order==null)t.order=next++;
 originalPersist();schedule()
};
const originalSaveVisualOrder=saveVisualOrder;
saveVisualOrder=function(){originalSaveVisualOrder();tasks.forEach((t,i)=>t.order=i+1);originalPersist();schedule()};
async function sync(){
 if(busy){again=true;return}
 if(!navigator.onLine){say('Offline — alterações preservadas neste aparelho.');return}
 if(!valid()){ready=false;say('Sessão Google expirada ou desconectada. Autorize para sincronizar; dados locais preservados.');return}
 busy=true;again=false;const rev=revision;const local=tasks.map(t=>({...t}));const base=baseline();
 try{
  say('Sincronizando…');const cloudTasks=await readCloud();const localMap=new Map(local.map(t=>[t.id,t]));const updates=[],additions=[];const conflicts=[];const blocked=new Set();
  for(const t of local){
   const c=remote.get(t.id),b=base?.get(t.id);
   if(!c){if(b){conflicts.push(t.title);blocked.add(t.id);continue}additions.push(toRow(t));continue}
   if(!b){if(!equal(t,c)){conflicts.push(t.title);blocked.add(t.id)}continue}
   const merged={...c};let changed=false;
   for(const k of fields){const l=norm(t,k),old=norm(b,k),v=norm(c,k);if(l===old)continue;if(v!==old&&v!==l){if(k==='order')continue;conflicts.push(t.title);blocked.add(t.id);continue}if(l!==v){merged[k]=l;changed=true}}
   if(changed&&!blocked.has(t.id)){const row=rows.get(t.id);updates.push({range:"'Tarefas'!B"+row+":F"+row,values:[[merged.title,merged.due||'',merged.priority,merged.repeat,merged.done?'TRUE':'FALSE']]},{range:"'Tarefas'!H"+row+":I"+row,values:[[new Date().toISOString(),merged.order??'']]})}
  }
  if(revision!==rev){again=true;return}
  if(updates.length)await api('POST','https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values:batchUpdate',{valueInputOption:'RAW',data:updates});
  if(additions.length)await api('POST',url('A:I')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{values:additions});
  const latest=await readCloud();
  if(revision!==rev){again=true;return}
  const removed=cloudTasks.some(c=>base?.has(c.id)&&!localMap.has(c.id));
  // Preserve unsent conflicting edits and their old baseline, but accept successful independent writes.
  const retained=latest.map(t=>blocked.has(t.id)?localMap.get(t.id):t);
  for(const t of local)if(blocked.has(t.id)&&!remote.has(t.id))retained.push(t);
  tasks=retained;originalPersist();
  const nextBase=latest.filter(t=>!blocked.has(t.id));
  for(const id of blocked){const old=base?.get(id);if(old)nextBase.push(old)}
  localStorage.setItem(LAST_SYNC,fingerprint(nextBase));ready=true;refresh.hidden=false;
  if(conflicts.length){say('Alterações independentes sincronizadas. Conflitos preservados: '+[...new Set(conflicts)].slice(0,3).join(', '));return}
  say(removed?'Sincronizado. Exclusões locais não apagaram registros da planilha.':'Sincronizado com Google Sheets ✓');
 }catch(e){ready=false;say('Falha na sincronização: '+e.message+' — dados locais preservados. Nova tentativa automática.')}
 finally{busy=false;if(again)setTimeout(sync,200)}
}
async function load(){await sync()}
function initToken(){if(!window.google?.accounts?.oauth2)return false;if(!tokenClient)tokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPE,callback:async response=>{if(response.error){say('Login Google necessário: '+response.error);return}accessToken=response.access_token;expiresAt=Date.now()+(Number(response.expires_in)||3600)*1000;await sync()}});return true}
function tryAutomatic(){if(valid()){load({automatic:true});return}if(!initToken())return;try{tokenClient.requestAccessToken({prompt:''})}catch(e){say('Toque em Conectar Google Sheets para autorizar.')}}
btn.onclick=()=>{if(!initToken()){say('Login Google ainda carregando. Tente novamente.');return}tokenClient.requestAccessToken({prompt:''})};
refresh.onclick=()=>sync();
window.addEventListener('focus',()=>{if(valid())sync()});
window.addEventListener('online',()=>{if(valid())sync();else say('Internet voltou. Autorize o Google para enviar alterações.');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&valid())sync()});
setInterval(()=>{if(!document.hidden&&valid())sync()},30000);
window.addEventListener('pageshow',()=>{setTimeout(tryAutomatic,800)});
})();
