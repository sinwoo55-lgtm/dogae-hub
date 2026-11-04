export const isBoardId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function boardOrder(value){if(!Array.isArray(value)||value.length>300||value.some(id=>!isBoardId(id))||new Set(value).size!==value.length)return null;return [...value];}
// Place edited visible cards first while retaining scheduled, trashed and newly created records.
export function mergeBoardOrder(requested,existing,all){const valid=new Set(all),seen=new Set(),result=[];for(const id of [...requested,...existing,...all])if(valid.has(id)&&!seen.has(id)){seen.add(id);result.push(id);}return result;}
