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
async function api(method,path,body){if(!valid())throw Error('Sessão Google expirada. Conecte novamente.');const r=await fetch(path,{method,headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok){const txt=await r.text();throw Error('Google Sheets '+r.status+': '+txt.slice(0,220))}return r.json()}
function iso(v){v=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):''}
function bool(v){return /^(true|sim|yes|1|conclu[ií]da)$/i.test(String(v||'').trim())}
function fromRow(a){return {id:String(a[0]||''),title:String(a[1]||''),due:iso(a[2]),priority:['Alta','Normal','Baixa'].includes(a[3])?a[3]:'Normal',repeat:({Diária:'daily',Semanal:'weekly',Mensal:'monthly',daily:'daily',weekly:'weekly',monthly:'monthly'}[a[4]]||'none'),done:bool(a[5]),order:Number.isFinite(Number(a[8]))&&String(a[8]||'').trim()!==''?Number(a[8]):null}}
function toRow(t){return [t.id,t.title,t.due||'',t.priority||'Normal',t.repeat||'none',t.done?'TRUE':'FALSE',t.created||new Date().toISOString(),new Date().toISOString(),t.order??'']}
async function readCloud(){const x=await api('GET',url('A2:I')+'?valueRenderOption=FORMATTED_VALUE');const list=x.values||[];remote.clear();rows.clear();list.forEach((r,i)=>{if(r[0]){const t=fromRow(r);remote.set(t.id,t);rows.set(t.id,i+2)}});return [...remote.values()].sort((a,b)=>(a.order??rows.get(a.id))-(b.order??rows.get(b.id)))}
function same(a,b){return !!a&&!!b&&a.title===b.title&&a.due===b.due&&a.priority===b.priority&&a.repeat===b.repeat&&!!a.done===!!b.done&&a.order===b.order}
async function writeChanges(snapshot){snapshot.forEach((t,i)=>t.order=i+1);const next=new Map(snapshot.map(t=>[t.id,t]));const updates=[];const additions=[];for(const [id,old] of remote){const row=rows.get(id);const current=next.get(id);if(!current)updates.push({range:"'Tarefas'!A"+row+":I"+row,values:[['','','','','','','','','']]});else if(!same(old,current))updates.push({range:"'Tarefas'!A"+row+":I"+row,values:[toRow(current)]})}for(const [id,t] of next){if(!remote.has(id))additions.push(toRow(t))}
if(updates.length)await api('POST','https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values:batchUpdate',{valueInputOption:'RAW',data:updates});
if(additions.length)await api('POST',url('A:I')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{values:additions});
await readCloud();localStorage.setItem(LAST_SYNC,fingerprint(snapshot))}
function schedule(){if(!ready)return;const snapshot=tasks.map((t,i)=>({...t,order:i+1}));queue=queue.then(async()=>{if(!valid()){ready=false;say('Sessão expirada. Alterações deste aparelho ainda não enviadas. Reconecte para conferir.');return}busy=true;say('Salvando no Google Sheets…');try{await writeChanges(snapshot);say('Sincronizado com Google Sheets ✓')}catch(e){ready=false;say('Falha na sincronização: '+e.message+' — exporte backup e reconecte.')}finally{busy=false}})}
const originalPersist=persist;persist=function(){tasks.forEach((t,i)=>t.order=i+1);originalPersist();schedule()};
async function load({automatic=false}={}){if(busy)return;ready=false;say('Lendo sua planilha…');try{const cloudTasks=await readCloud();const local=tasks.length;const sameData=fingerprint(tasks)===fingerprint(cloudTasks);const previous=localStorage.getItem(LAST_SYNC);const safeReplace=!local||sameData||previous===fingerprint(tasks);
if(local&&!sameData&&!safeReplace){if(automatic){say('Há tarefas locais diferentes da planilha. Toque em Atualizar da planilha para revisar.');refresh.hidden=false;return}if(!confirm('Há tarefas locais não sincronizadas. Exporte um backup antes de substituí-las pelos dados do Google Sheets. Continuar?')){say('Dados locais preservados.');refresh.hidden=false;return}}
if(local&&!cloudTasks.length&&!safeReplace){if(automatic){say('Planilha vazia e tarefas locais existentes. Conecte manualmente para decidir.');refresh.hidden=false;return}if(confirm('A planilha está vazia. Enviar as tarefas locais para ela?')){await api('POST',url('A:I')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{values:tasks.map((t,i)=>toRow({...t,order:i+1}))});await readCloud()}}
tasks=[...remote.values()].sort((a,b)=>(a.order??rows.get(a.id))-(b.order??rows.get(b.id)));originalPersist();localStorage.setItem(LAST_SYNC,fingerprint(tasks));ready=true;refresh.hidden=false;say('Sincronizado com Google Sheets ✓')}catch(e){say('Não foi possível conectar: '+e.message)}}
function initToken(){if(!window.google?.accounts?.oauth2)return false;if(!tokenClient)tokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPE,callback:async response=>{if(response.error){say('Login Google necessário: '+response.error);return}accessToken=response.access_token;expiresAt=Date.now()+(Number(response.expires_in)||3600)*1000;await load({automatic:true})}});return true}
function tryAutomatic(){if(valid()){load({automatic:true});return}if(!initToken())return;try{tokenClient.requestAccessToken({prompt:''})}catch(e){say('Toque em Conectar Google Sheets para autorizar.')}}
btn.onclick=()=>{if(!initToken()){say('Login Google ainda carregando. Tente novamente.');return}tokenClient.requestAccessToken({prompt:''})};
refresh.onclick=async()=>{if(!valid()){say('Sessão expirada. Conecte novamente.');return}if(ready&&tasks.some(t=>!remote.has(t.id)||!same(t,remote.get(t.id)))){if(!confirm('Existem alterações locais não sincronizadas. Recarregar da planilha e descartá-las?'))return}await load()};
window.addEventListener('focus',()=>{if(valid()&&ready)load({automatic:true})});
window.addEventListener('pageshow',()=>{setTimeout(tryAutomatic,800)});
})();
