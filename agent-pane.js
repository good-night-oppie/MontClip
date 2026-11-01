(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./ui-preferences'));else root.MontClipAgentPane=factory(root.MontClipView);})(typeof globalThis!=='undefined'?globalThis:this,function(view){
'use strict';
function referenceChips(kind,context){
 if(!context||typeof context.projectId!=='string'||!context.projectId)return [];
 const base={projectId:context.projectId,sequenceId:context.sequenceId,revision:context.revision,gen:context.gen};
 if(kind==='projectRef')return [{...base,type:'project'}];
 const valid=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>a;
 if(kind==='rangeRef')return valid(context.start,context.end)?[{...base,type:'range',start:context.start,end:context.end}]:[];
 if(kind!=='captionRef')return [];
 return (context.captions||[]).slice(0,20).filter(c=>typeof c.id==='string'&&typeof c.text==='string'&&c.text.length<=16000&&valid(c.start,c.end)).map(c=>({...base,type:'caption',clipId:c.id,sourceCaptionId:typeof c.sourceCaptionId==='string'?c.sourceCaptionId:null,text:c.text,start:c.start,end:c.end}));
}
function create(){const scopes=new Map();let scope=null,next=0,count=0;
 const fresh=()=>{if(count>=50)throw Error('LIMIT');count++;return{id:String(++next),draft:'',messages:[],references:[]};};
 return {context(c){const key=JSON.stringify([c.projectId??null,c.projectId?null:c.gen,c.sequenceId]);if(!scopes.has(key)){if(count>=50){scope={sessions:[{id:'blocked',draft:'',messages:[],references:[]}],active:'blocked'};throw Error('LIMIT');}const session=fresh();scopes.set(key,{sessions:[session],active:session.id});}scope=scopes.get(key);},
 current(){return JSON.parse(JSON.stringify(scope.sessions.find(s=>s.id===scope.active)));},
 draft(value){if(scope.active==='blocked'||typeof value!=='string'||value.length>16000)throw Error('LIMIT');scope.sessions.find(s=>s.id===scope.active).draft=value;},
 list(query=''){return scope.sessions.filter(s=>s.draft.toLowerCase().includes(query.toLowerCase())).map(s=>({id:s.id,title:s.draft.slice(0,60)}));},
 newSession(){const s=fresh();scope.sessions.push(s);scope.active=s.id;},select(id){if(!scope.sessions.some(s=>s.id===id))throw Error('UNKNOWN_SESSION');scope.active=id;},
 references(items){if(!Array.isArray(items)||items.length>20)throw Error('LIMIT');scope.sessions.find(s=>s.id===scope.active).references=JSON.parse(JSON.stringify(items));},
 send(){return {ok:false,code:'UNCONFIGURED'};},cancel(){return {ok:true,code:'NOT_SENT'};}};
}
function mount({panel,getContext,getLanguage,settings,getReferences=()=>[],onHide=()=>{}}){
 const state=create();let key='',status='',width=340;
 try{const r=settings?.get();if(r?.ok)width=r.value.width;}catch{}
 panel.innerHTML='<div class="agent-toolbar"><button type="button" data-action="new" data-key="paneNew"></button><button type="button" data-action="config" data-key="paneConfig"></button></div><input type="search" data-search><div data-sessions></div><p data-key="paneLocal"></p><div class="agent-toolbar"><button type="button" data-action="projectRef" data-key="paneProjectRef"></button><button type="button" data-action="captionRef" data-key="paneCaptionRef"></button><button type="button" data-action="rangeRef" data-key="paneRangeRef"></button></div><div data-references></div><div role="log" aria-live="polite" data-messages></div><div role="status" data-key="paneTools"></div><textarea maxlength="16000" rows="4" data-draft></textarea><div class="agent-toolbar"><button type="button" data-action="send" data-key="paneSend"></button><button type="button" data-action="cancel" data-key="paneCancel"></button></div><p role="status" data-status></p><section data-config hidden><label><span data-key="paneModel"></span><select disabled><option data-key="paneNone"></option></select></label><label><span data-key="paneWidth"></span><input type="range" min="280" max="480" step="10" data-width></label></section>';
 const $=s=>panel.querySelector(s),t=()=>view.text[getLanguage()];
 function sync(){const c=getContext(),k=JSON.stringify([c.projectId??null,c.sequenceId,c.gen]);if(k!==key){try{state.context(c);key=k;status='';$('[data-draft]').value=state.current().draft;return true;}catch{status='paneLimit';$('[data-draft]').value='';return false;}}return false;}
 function list(){const box=$('[data-sessions]');box.replaceChildren();for(const s of state.list($('[data-search]').value)){const b=document.createElement('button');b.type='button';b.textContent=s.title||t().paneNew;b.setAttribute('aria-pressed',String(s.id===state.current().id));b.onclick=()=>{sync();try{state.select(s.id);$('[data-draft]').value=state.current().draft;render();}catch{}};box.append(b);}}
 function references(){const box=$('[data-references]');box.replaceChildren();box.setAttribute('aria-label',t().paneReferences);state.current().references.forEach((ref,i)=>{const row=document.createElement('div'),label=document.createElement('span'),remove=document.createElement('button');label.textContent=ref.type==='project'?ref.projectId:(ref.text?ref.text+' ':'')+String(ref.start)+'–'+String(ref.end);label.title=ref.clipId||ref.projectId;remove.type='button';remove.textContent=t().paneRemoveRef;remove.onclick=()=>{if(sync()){render();return;}const refs=state.current().references;refs.splice(i,1);state.references(refs);render();};row.append(label,remove);box.append(row);});}
 function render(){sync();references();for(const el of panel.querySelectorAll('[data-key]'))el.textContent=t()[el.dataset.key];$('[data-draft]').setAttribute('aria-label',t().paneDraft);$('[data-search]').placeholder=t().paneSearch;$('[data-search]').setAttribute('aria-label',t().paneSearch);$('[data-messages]').textContent=t().paneEmpty;$('[data-status]').textContent=status?t()[status]:'';$('[data-action=send]').disabled=!state.current().draft.trim();$('[data-width]').value=width;document.documentElement.style.setProperty('--agent-pane-width',width+'px');list();}
 $('[data-draft]').oninput=e=>{if(sync()){render();return;}try{state.draft(e.target.value);status='';$('[data-action=send]').disabled=!state.current().draft.trim();list();}catch{status='paneLimit';render();}};
 $('[data-search]').oninput=()=>{sync();list();};
 panel.onclick=e=>{const action=e.target.dataset.action;if(!action)return;sync();if(action==='config'){$('[data-config]').hidden=!$('[data-config]').hidden;return;}try{if(['projectRef','captionRef','rangeRef'].includes(action)){const refs=getReferences(action);if(!refs.length)status='paneNoReference';else{state.references(state.current().references.concat(refs));status='';}}if(action==='new'){state.newSession();$('[data-draft]').value='';}if(action==='send'){state.send();status='pending';}if(action==='cancel'){state.cancel();status='';}render();}catch{status='paneLimit';render();}};
 let composing=false;
 $('[data-draft]').oncompositionstart=()=>{composing=true;};
 $('[data-draft]').oncompositionend=()=>{composing=false;};
 $('[data-draft]').onkeydown=e=>{if(e.isComposing||composing||e.keyCode===229){e.stopPropagation();return;}if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.isComposing&&!composing&&e.keyCode!==229){e.preventDefault();e.stopPropagation();if(state.current().draft.trim())panel.onclick({target:{dataset:{action:'send'}}});}};
 panel.onkeydown=e=>{if(e.key!=='Escape'||e.isComposing||composing)return;if(document.querySelector?.('dialog[open]'))return;e.preventDefault();e.stopPropagation();if(!$('[data-config]').hidden)$('[data-config]').hidden=true;else onHide();};
 $('[data-width]').onchange=e=>{width=Number(e.target.value);try{if(!settings?.set({width})?.ok)status='paneSaveFailed';}catch{status='paneSaveFailed';}render();};
 render();return {render,sync(){if(sync())render();}};
}
return {create,mount,referenceChips,text:view.text};
});
