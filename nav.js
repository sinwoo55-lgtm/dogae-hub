(function(){
  function init(){
    var trigger=document.querySelector('a.back-btn, a.back');
    if(!trigger)return;
    var isCompact=trigger.classList.contains('back');
    var button=document.createElement('button');
    button.type='button';button.className=trigger.className+' hub-menu-trigger';
    button.setAttribute('aria-label','메뉴 열기');
    button.innerHTML=isCompact?'☰':'☰ 메뉴';
    trigger.replaceWith(button);
    var style=document.createElement('style');
    style.textContent='.hub-menu-trigger{position:fixed!important;top:14px!important;right:18px!important;left:auto!important;z-index:850!important;cursor:pointer!important;background:#fff!important;box-shadow:0 3px 12px rgba(12,24,58,.08)}.hub-nav-shade{position:fixed;inset:0;background:rgba(12,24,58,.38);z-index:900;opacity:0;pointer-events:none;transition:.2s}.hub-nav-shade.open{opacity:1;pointer-events:auto}.hub-nav{position:fixed;right:0;top:0;bottom:0;width:min(330px,88vw);background:#fff;z-index:901;padding:25px;box-shadow:-16px 0 45px rgba(12,24,58,.2);transform:translateX(100%);transition:.24s;font-family:"Noto Sans KR",sans-serif}.hub-nav.open{transform:translateX(0)}.hub-nav-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;color:#182B6A;font-family:"Noto Serif KR",serif;font-size:19px}.hub-nav-close{width:34px;height:34px;border:0;border-radius:9px;background:#EEF2FB;color:#253E8A;font-size:22px;cursor:pointer}.hub-nav a{display:flex;gap:12px;align-items:center;padding:13px 11px;border-radius:10px;text-decoration:none;color:#1A1E2E;font-size:14px}.hub-nav a:hover{background:#EEF2FB;color:#253E8A}';
    document.head.appendChild(style);
    var shade=document.createElement('div');shade.className='hub-nav-shade';
    var nav=document.createElement('aside');nav.className='hub-nav';
    nav.innerHTML='<div class="hub-nav-head">메뉴 <button class="hub-nav-close">×</button></div><a href="index.html">▣&nbsp; 캘린더</a><a href="links.html">🔗&nbsp; 링크 모음</a><a href="mindmap.html">🧭&nbsp; 업무분장</a><a href="career.html">🌱&nbsp; 진로 활동 탐색기</a><a href="seating.html">▦&nbsp; 자리 배치표</a><a href="forms.html">▤&nbsp; 양식 자료실</a>';
    document.body.append(shade,nav);
    function toggle(open){shade.classList.toggle('open',open);nav.classList.toggle('open',open)}
    button.addEventListener('click',function(){toggle(true)});shade.addEventListener('click',function(){toggle(false)});nav.querySelector('button').addEventListener('click',function(){toggle(false)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
