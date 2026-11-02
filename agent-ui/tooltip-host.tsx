import React from 'react';
export function Tip({children,content}:any){return <span title={typeof content==='string'?content:undefined}>{children}</span>;}
