import React, {createContext,useContext} from 'react';
export const Locale=createContext('zh-CN');
export function useTranslation(){const language=useContext(Locale);return {t:(key:string)=>language==='en'?(key.endsWith('.stop')?'Stop':'Send'):(key.endsWith('.stop')?'停止':'发送')};}
export const cn=(...parts:any[])=>parts.filter(Boolean).join(' ');
