(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./ui-preferences'),require('./agent-session-schema'));else root.MontClipAgentPane=factory(root.MontClipView,root.MontClipSessions);})(typeof globalThis!=='undefined'?globalThis:this,function(view,schema){
'use strict';
function referenceChips(kind,context){
 if(!context||typeof context.projectId!=='string'||!context.projectId)return [];
 const base={projectId:context.projectId,sequenceId:context.sequenceId,revision:context.revision,gen:context.gen??null};
 if(kind==='projectRef')return [{...base,type:'project'}];
 const valid=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>a;
 if(kind==='rangeRef')return valid(context.start,context.end)?[{...base,type:'range',start:context.start,end:context.end}]:[];
 if(kind!=='captionRef')return [];
 return (context.captions||[]).slice(0,20).filter(c=>typeof c.id==='string'&&typeof c.text==='string'&&c.text.length<=16000&&valid(c.start,c.end)).map(c=>({...base,type:'caption',clipId:c.id,sourceCaptionId:typeof c.sourceCaptionId==='string'?c.sourceCaptionId:null,text:c.text,start:c.start,end:c.end}));
}
function displayMessage(value){
 const fallback={text:value,references:[]};if(typeof value!=='string')return fallback;
 const at=value.lastIndexOf('\n\n');if(at<0)return fallback;
 try{const v=JSON.parse(value.slice(at+2)),k=v&&typeof v==='object'?Object.keys(v).join(','):'';if(!v||k!=='references'&&!(k==='references,facts'&&v.facts&&typeof v.facts==='object'&&!Array.isArray(v.facts))||!Array.isArray(v.references)||v.references.length>20||!v.references.every(r=>r&&typeof r.projectId==='string'&&r.projectId.length>0&&schema.reference(r,r)))return fallback;return{text:value.slice(0,at),references:v.references};}catch{return fallback;}
}
function create({storage}={}){const scopes=new Map();let scope=null,next=0,count=0,token=null,dirty=false,persisted={ok:true,code:'VOLATILE'};
 if(storage){try{const r=storage.get();if(!r.ok||typeof r.token!=='string'||!r.token||!schema.valid(r.value))throw Error();token=r.token;for(const s of r.value.scopes){scopes.set(JSON.stringify([s.projectId,null,s.sequenceId]),JSON.parse(JSON.stringify(s)));count+=s.sessions.length;for(const item of s.sessions)next=Math.max(next,Number(item.id));}persisted={ok:true,code:'SAVED'};}catch{persisted={ok:false,code:'SESSION_READ_FAILED'};}}
 function changed(){if(token!==null){dirty=true;save();}}
 function save(){if(!storage)return persisted; if(token===null)return persisted;const value={version:1,scopes:[...scopes.values()].filter(s=>s.projectId).map(s=>({projectId:s.projectId,sequenceId:s.sequenceId,active:s.active,sessions:s.sessions}))};try{const r=storage.set({expected:token,value});if(r?.ok&&(typeof r.token!=='string'||!r.token))throw Error('Invalid save receipt');persisted={ok:!!r.ok,code:r.ok?'SAVED':r.code};if(r.ok){token=r.token;dirty=false;}}catch{persisted={ok:false,code:'SESSION_UNKNOWN'};}return persisted;}

 const fresh=()=>{if(count>=50)throw Error('SESSION_CAPACITY');count++;return{id:String(++next),draft:'',messages:[],references:[]};};
 return {context(c){const key=JSON.stringify([c.projectId??null,c.projectId?null:c.gen,c.sequenceId??null]);if(!scopes.has(key)){if(count>=50){scope={sessions:[{id:'blocked',draft:'',messages:[],references:[]}],active:'blocked'};throw Error('SCOPE_CAPACITY');}const session=fresh();scopes.set(key,{projectId:c.projectId??null,sequenceId:c.sequenceId??null,sessions:[session],active:session.id});}scope=scopes.get(key);},
 identify(c){const from=JSON.stringify([null,c.gen,c.sequenceId??null]),to=JSON.stringify([c.projectId,null,c.sequenceId??null]);const prior=scopes.get(from);if(!c.projectId||!prior||scope!==prior)return false;const existing=scopes.get(to);if(existing){existing.sessions.push(...prior.sessions);existing.active=prior.active;scope=existing;}else{prior.projectId=c.projectId;scopes.set(to,prior);}scopes.delete(from);changed();return true;},
 current(){return JSON.parse(JSON.stringify(scope.sessions.find(s=>s.id===scope.active)));},
 draft(value){if(scope.active==='blocked')throw Error('SCOPE_CAPACITY');if(typeof value!=='string'||value.length>16000)throw Error('TEXT_LIMIT');scope.sessions.find(s=>s.id===scope.active).draft=value;if(scope.projectId){changed();}},
 list(query=''){return scope.sessions.filter(s=>(s.draft+' '+s.messages.map(m=>displayMessage(m.text).text).join(' ')).toLowerCase().includes(query.toLowerCase())).map(s=>({id:s.id,title:(s.draft||displayMessage(s.messages[0]?.text||'').text).slice(0,60)}));},
 complete(expected,input,answer){const s=scope.sessions.find(s=>s.id===scope.active);if(s.id!==expected.id||s.draft!==expected.draft||JSON.stringify(s.references)!==JSON.stringify(expected.references))throw Error('STALE');if(s.messages.length>98||input.length>16000||answer.length>16000)throw Error('HISTORY_LIMIT');s.messages.push({role:'user',text:input},{role:'assistant',text:answer});s.draft='';s.references=[];if(scope.projectId)changed();},
 newSession(){if(scope.active==='blocked')throw Error('SCOPE_CAPACITY');const s=fresh();scope.sessions.push(s);scope.active=s.id;if(scope.projectId){changed();}},select(id){if(!scope.sessions.some(s=>s.id===id))throw Error('UNKNOWN_SESSION');scope.active=id;if(scope.projectId){changed();}},
 references(items){if(scope.active==='blocked')throw Error('SCOPE_CAPACITY');if(!Array.isArray(items)||items.length>20)throw Error('REFERENCE_LIMIT');scope.sessions.find(s=>s.id===scope.active).references=JSON.parse(JSON.stringify(items));if(scope.projectId){changed();}},
 flush(){return !dirty||save().ok;},persistence(){return {...persisted,mode:storage&&token===null?'temporary':storage?'persistent':'volatile'};},retry(){return save();},send(){return {ok:false,code:'UNCONFIGURED'};},cancel(){return {ok:true,code:'NOT_SENT'};}};
}
function errorKey(error){return ({SESSION_CAPACITY:'paneLimitSessions',SCOPE_CAPACITY:'paneScopeCapacity',TEXT_LIMIT:'paneLimitChars',REFERENCE_LIMIT:'paneReferenceLimit'})[error.message]||'paneActionFailed';}
function mount({panel,getContext,getLanguage,settings,sessionStorage,getReferences=()=>[],onHide=()=>{}}){
 const state=create({storage:sessionStorage});let key='',status='',width=340;
 try{const r=settings?.get();if(r?.ok)width=r.value.width;}catch{}
 panel.innerHTML='<div class="agent-toolbar"><button type="button" data-action="new" data-key="agent.input.newSession"></button><button type="button" data-action="config" data-key="paneConfig"></button></div><div class="agent-scroll"><input type="search" data-search><div data-sessions></div><p data-local></p><p role="status" data-persistence></p><button type="button" data-action="retry" data-key="paneRetry"></button><div class="agent-toolbar"><button type="button" data-action="projectRef" data-key="paneProjectRef"></button><button type="button" data-action="captionRef" data-key="paneCaptionRef"></button><button type="button" data-action="rangeRef" data-key="paneRangeRef"></button></div><div data-references></div><div role="log" aria-live="polite" data-messages></div><div role="status" data-key="paneTools"></div></div><textarea maxlength="16000" rows="4" data-draft></textarea><div class="agent-toolbar"><button type="button" data-action="send" data-key="agent.input.send"></button><button type="button" data-action="cancel" data-key="paneCancel"></button></div><p role="status" data-status></p><section data-config hidden><label><span data-key="agent.settings.models.title"></span><select disabled><option data-key="paneNone"></option></select></label><label><span data-key="paneWidth"></span><input type="range" min="280" max="480" step="10" data-width></label></section>';
 for(const button of panel.querySelectorAll('button'))button.classList.add('btn','tiny');
 const $=s=>panel.querySelector(s),t=()=>view.text[getLanguage()];
 function sync(){const c=getContext(),k=JSON.stringify([c.projectId??null,c.sequenceId,c.gen]);if(k!==key){try{state.context(c);key=k;status='';$('[data-draft]').value=state.current().draft;return true;}catch(error){key=k;status=errorKey(error);$('[data-draft]').value='';return false;}}return false;}
 function list(){const box=$('[data-sessions]');box.replaceChildren();for(const s of state.list($('[data-search]').value)){const b=document.createElement('button');b.type='button';b.className='btn tiny';b.textContent=s.title||t()['agent.input.newSession'];b.setAttribute('aria-pressed',String(s.id===state.current().id));b.onclick=()=>{sync();try{state.select(s.id);$('[data-draft]').value=state.current().draft;render();}catch{}};box.append(b);}}
 function references(){const box=$('[data-references]');box.replaceChildren();box.setAttribute('aria-label',t().paneReferences);state.current().references.forEach((ref,i)=>{const row=document.createElement('div'),label=document.createElement('span'),remove=document.createElement('button');label.textContent=ref.type==='project'?ref.projectId:(ref.text?ref.text+' ':'')+String(ref.start)+'–'+String(ref.end);label.title=ref.clipId||ref.projectId;remove.type='button';remove.className='btn tiny';remove.textContent=t()['agent.ref.remove'];remove.onclick=()=>{if(sync()){render();return;}const refs=state.current().references;refs.splice(i,1);state.references(refs);render();};row.append(label,remove);box.append(row);});}
 function render(){sync();references();for(const el of panel.querySelectorAll('[data-key]'))el.textContent=t()[el.dataset.key];$('[data-draft]').setAttribute('aria-label',t().paneDraft);$('[data-search]').placeholder=t().paneSearch;$('[data-search]').setAttribute('aria-label',t().paneSearch);const messages=$('[data-messages]');messages.replaceChildren();if(!state.current().messages.length)messages.textContent=t().paneEmpty;else for(const m of state.current().messages){const row=document.createElement('p');row.textContent=(m.role==='user'?t().paneUser:t().paneAssistant)+': '+m.text;messages.append(row);}const saved=state.persistence();$('[data-local]').textContent=t()[saved.mode==='temporary'?'paneLocalTemporary':sessionStorage?'paneLocalPolicy':'paneLocal'];$('[data-persistence]').textContent=saved.ok||saved.mode==='temporary'?'':t().paneSessionFailed;$('[data-action=retry]').hidden=saved.ok||saved.mode==='temporary';$('[data-status]').textContent=t()[status||'agent.state.disconnected.brief'];$('[data-action=send]').disabled=!state.current().draft.trim();$('[data-width]').value=width;document.documentElement.style.setProperty('--agent-pane-width',width+'px');list();}
 $('[data-draft]').onpaste=e=>{
  if(sync()){e.preventDefault();render();return;}
  const d=$('[data-draft]'),pasted=e.clipboardData?.getData('text/plain');
  if(typeof pasted!=='string')return;
  // Textarea normalizes CRLF/CR to LF; selection offsets and maxlength use UTF-16 units.
  const inserted=pasted.replace(/\r\n?/g,'\n');
  if(d.value.length-(d.selectionEnd-d.selectionStart)+inserted.length>16000){
   e.preventDefault();status='panePasteTooLong';render();
  }
 };
 $('[data-draft]').oninput=e=>{if(sync()){render();return;}try{state.draft(e.target.value);status='';$('[data-action=send]').disabled=!state.current().draft.trim();render();}catch(error){status=errorKey(error);render();}};
 $('[data-search]').oninput=()=>{sync();list();};
 panel.onclick=e=>{const action=e.target.dataset.action;if(!action)return;sync();if(action==='config'){$('[data-config]').hidden=!$('[data-config]').hidden;return;}try{if(['projectRef','captionRef','rangeRef'].includes(action)){const refs=getReferences(action);if(!refs.length)status='paneNoReference';else{state.references(state.current().references.concat(refs));status='';}}if(action==='retry')state.retry();if(action==='new'){state.newSession();status='';$('[data-draft]').value='';}if(action==='send'){const result=state.send();status=result.code==='UNCONFIGURED'?'agent.state.sendFailedNoProvider.brief':'paneActionFailed';}if(action==='cancel'){state.cancel();status='';}render();}catch(error){status=errorKey(error);render();}};
 let composing=false;
 $('[data-draft]').oncompositionstart=()=>{composing=true;};
 $('[data-draft]').oncompositionend=()=>{composing=false;};
 $('[data-draft]').onkeydown=e=>{if(e.isComposing||composing||e.keyCode===229){e.stopPropagation();return;}if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.isComposing&&!composing&&e.keyCode!==229){e.preventDefault();e.stopPropagation();if(state.current().draft.trim())panel.onclick({target:{dataset:{action:'send'}}});}};
 panel.onkeydown=e=>{if(e.key!=='Escape'||e.isComposing||composing)return;if(document.querySelector?.('dialog[open]'))return;e.preventDefault();e.stopPropagation();if(!$('[data-config]').hidden)$('[data-config]').hidden=true;else onHide();};
 $('[data-width]').onchange=e=>{width=Number(e.target.value);try{if(!settings?.set({width})?.ok)status='paneSaveFailed';}catch{status='paneSaveFailed';}render();};
 render();return {render,identify(c){return state.identify(c);},flush(){const ok=state.flush();if(!ok)render();return ok;},sync(){if(sync())render();}};
}
return {create,mount,displayMessage,referenceChips,text:view.text};
});
