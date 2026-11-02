(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./ui-preferences'));else root.MontClipAgentPane=factory(root.MontClipView);})(typeof globalThis!=='undefined'?globalThis:this,function(view){
'use strict';
function create(){const scopes=new Map();let scope=null,next=0,count=0;
 const fresh=()=>{if(count>=50)throw Error('LIMIT');count++;return{id:String(++next),draft:'',messages:[]};};
 return {context(c){const key=JSON.stringify([c.projectId??null,c.projectId?null:c.gen,c.sequenceId]);if(!scopes.has(key)){if(count>=50){scope={sessions:[{id:'blocked',draft:'',messages:[]}],active:'blocked'};throw Error('LIMIT');}const session=fresh();scopes.set(key,{sessions:[session],active:session.id});}scope=scopes.get(key);},
 current(){return JSON.parse(JSON.stringify(scope.sessions.find(s=>s.id===scope.active)));},
 draft(value){if(scope.active==='blocked'||typeof value!=='string'||value.length>16000)throw Error('LIMIT');scope.sessions.find(s=>s.id===scope.active).draft=value;},
 list(query=''){return scope.sessions.filter(s=>s.draft.toLowerCase().includes(query.toLowerCase())).map(s=>({id:s.id,title:s.draft.slice(0,60)}));},
 newSession(){const s=fresh();scope.sessions.push(s);scope.active=s.id;},select(id){if(!scope.sessions.some(s=>s.id===id))throw Error('UNKNOWN_SESSION');scope.active=id;},
 send(){return {ok:false,code:'UNCONFIGURED'};},cancel(){return {ok:true,code:'NOT_SENT'};}};
}
function mount({panel,getContext,getLanguage,settings}){
 const state=create();let key='',status='',width=340;
 try{const r=settings?.get();if(r?.ok)width=r.value.width;}catch{}
 panel.innerHTML='<div class="agent-toolbar"><button type="button" data-action="new" data-key="paneNew"></button><button type="button" data-action="config" data-key="paneConfig"></button></div><input type="search" data-search><div data-sessions></div><p data-key="paneLocal"></p><div role="log" aria-live="polite" data-messages></div><div role="status" data-key="paneTools"></div><textarea maxlength="16000" rows="4" data-draft></textarea><div class="agent-toolbar"><button type="button" data-action="send" data-key="paneSend"></button><button type="button" data-action="cancel" data-key="paneCancel"></button></div><p role="status" data-status></p><section data-config hidden><label><span data-key="paneModel"></span><select disabled><option data-key="paneNone"></option></select></label><label><span data-key="paneWidth"></span><input type="range" min="280" max="480" step="10" data-width></label></section>';
 const $=s=>panel.querySelector(s),t=()=>view.text[getLanguage()];
 function sync(){const c=getContext(),k=JSON.stringify([c.projectId??null,c.sequenceId,c.gen]);if(k!==key){try{state.context(c);key=k;status='';$('[data-draft]').value=state.current().draft;return true;}catch{status='paneLimit';$('[data-draft]').value='';return false;}}return false;}
 function list(){const box=$('[data-sessions]');box.replaceChildren();for(const s of state.list($('[data-search]').value)){const b=document.createElement('button');b.type='button';b.textContent=s.title||t().paneNew;b.setAttribute('aria-pressed',String(s.id===state.current().id));b.onclick=()=>{sync();try{state.select(s.id);$('[data-draft]').value=state.current().draft;render();}catch{}};box.append(b);}}
 function render(){sync();for(const el of panel.querySelectorAll('[data-key]'))el.textContent=t()[el.dataset.key];$('[data-draft]').setAttribute('aria-label',t().paneDraft);$('[data-search]').placeholder=t().paneSearch;$('[data-search]').setAttribute('aria-label',t().paneSearch);$('[data-messages]').textContent=t().paneEmpty;$('[data-status]').textContent=status?t()[status]:'';$('[data-width]').value=width;document.documentElement.style.setProperty('--agent-pane-width',width+'px');list();}
 $('[data-draft]').oninput=e=>{if(sync()){render();return;}try{state.draft(e.target.value);status='';list();}catch{status='paneLimit';render();}};
 $('[data-search]').oninput=()=>{sync();list();};
 panel.onclick=e=>{const action=e.target.dataset.action;if(!action)return;sync();if(action==='config'){$('[data-config]').hidden=!$('[data-config]').hidden;return;}try{if(action==='new'){state.newSession();$('[data-draft]').value='';}if(action==='send'){state.send();status='pending';}if(action==='cancel'){state.cancel();status='';}render();}catch{status='paneLimit';render();}};
 $('[data-width]').onchange=e=>{width=Number(e.target.value);try{if(!settings?.set({width})?.ok)status='paneSaveFailed';}catch{status='paneSaveFailed';}render();};
 render();return {render,sync(){if(sync())render();}};
}
return {create,mount,text:view.text};
});
