"use strict";
exports.run = async win => {
  const result = await win.webContents.executeJavaScript(`(async () => {
    const original=projectJSON(), view=mcView.get(), originalToast=toast;
    const beforeUndo=runtime.undo, beforeRedo=runtime.redo;
    let shown=''; toast=text=>{shown=text;};
    const fixture = () => ({...original, revision:project.revision, media:[], inPoint:2, outPoint:5, lockedTracks:[], clips:[
      {id:'v1',kind:'video',track:'V1',start:0,in:0,duration:10,linkGroup:'one',mediaId:'synthetic',name:'画面',props:{...DEFAULT_PROPS}},
      {id:'a1',kind:'audio',track:'A1',start:0,in:0,duration:10,linkGroup:'one',mediaId:'synthetic',name:'声音',props:{...DEFAULT_PROPS}},
      {id:'v2',kind:'video',track:'V1',start:10,in:0,duration:10,linkGroup:'two',mediaId:'synthetic',props:{...DEFAULT_PROPS}},
      {id:'a2',kind:'audio',track:'A1',start:10,in:0,duration:10,linkGroup:'two',mediaId:'synthetic',props:{...DEFAULT_PROPS}}]});
    const reset=()=>{applyProject(fixture()); runtime.undo=[];runtime.redo=[];selectClip('v1');};
    const key=(key,extra={})=>{const event=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra}); window.dispatchEvent(event);return event;};
    const snapshot=()=>JSON.stringify({doc:projectJSON(),undo:runtime.undo,redo:runtime.redo});
    try {
      reset(); updateMontClipView({mode:'simple',language:'zh-CN'});
      const before=snapshot();
      key('t');key('T',{shiftKey:true});key('Delete',{shiftKey:true});key('Backspace',{shiftKey:true});
      document.getElementById('btnRippleDelete').click();
      document.getElementById('btnTrimIO').click(); splitAtWorkArea();
      const hiddenProtected=snapshot()===before && getComputedStyle(document.getElementById('btnRippleDelete')).display==='none' && getComputedStyle(document.getElementById('btnTrimIO')).display==='none';
      const input=document.createElement('textarea');document.body.append(input);input.focus();
      const textNotClaimed=!key('T',{shiftKey:true}).defaultPrevented && !key('Delete',{shiftKey:true}).defaultPrevented;
      input.remove(); key('T',{shiftKey:true,isComposing:true});key('Delete',{shiftKey:true,keyCode:229});
      const dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();
      key('T',{shiftKey:true});key('Delete',{shiftKey:true});dialog.close();dialog.remove();
      const compositionDialogProtected=snapshot()===before;
      key('Delete');
      const plainDelete=project.clips.length===2 && project.clips.every(c=>c.start===10) && runtime.undo.length===1;
      if(!plainDelete) throw Error(JSON.stringify({clips:project.clips.map(c=>({id:c.id,start:c.start,group:c.linkGroup})),sel:state.selId,ids:[...state.selIds],active:document.activeElement.tagName,undo:runtime.undo.length}));
      undo(); const undoAtomic=project.clips.length===4;
      reset();state.lockedTracks.add('A1');project.lockedTracks=['A1'];
      const lockedBefore=snapshot(); key('Delete');
      const linkedLock=snapshot()===lockedBefore && shown.includes('锁住的轨道：A1') && shown.includes('关联片段都未删除') && shown.includes('先解锁');
      updateMontClipView({language:'en'});key('Delete');
      const englishLock=shown.includes('A1') && shown.includes('linked partners were not deleted') && !/[\\u4e00-\\u9fff]/.test(shown);
      reset();getClip('a1').locked=true;key('Delete');
      const clipLock=project.clips.length===4 && shown.includes('a1') && shown.includes('locked clips');
      reset(); updateMontClipView({mode:'advanced'});key('t');const advancedSplit=project.clips.length>4;
      reset();key('T',{shiftKey:true});const advancedTrim=project.clips.length===2 && project.clips.every(c=>c.duration===3);
      reset();key('Delete',{shiftKey:true});const advancedRipple=project.clips.length===2 && project.clips.every(c=>c.start===0);
      return {hiddenProtected,textNotClaimed,compositionDialogProtected,plainDelete,undoAtomic,linkedLock,englishLock,clipLock,advancedSplit,advancedTrim,advancedRipple};
    } finally {toast=originalToast;applyProject(original);runtime.undo=beforeUndo;runtime.redo=beforeRedo;updateMontClipView(view);scheduleSave();await flushSave();}
  })()`);
  process.stdout.write("MONTCLIP_SHORTCUTS "+JSON.stringify(result)+"\n");
  if(!Object.values(result).every(Boolean)) throw Error("Simple shortcut guards failed");
};

