export const SCHOOL_MENU_IDS=['calendar','links','resources','organization','students','career','seating','timetable','classTimetable','tools'];

// Older app versions do not send the tools field. Preserve its current value.
export function normalizeSavedMenu(value,previous={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const result={};
  for(const id of SCHOOL_MENU_IDS){
    if(id==='tools'&&value[id]===undefined){result[id]=previous?.[id]!==false;continue;}
    if(typeof value[id]!=='boolean')return null;
    result[id]=value[id];
  }
  return result;
}
