(function(){
  var pending=0,timer=null,overlay=null,delay=220;
  function mount(){
    if(overlay)return overlay;
    if(!document.body){document.addEventListener('DOMContentLoaded',mount,{once:true});return null;}
    overlay=document.createElement('div');
    overlay.id='hubLoadingOverlay';
    overlay.hidden=true;
    overlay.setAttribute('role','status');
    overlay.setAttribute('aria-live','polite');
    overlay.innerHTML='<div class="hub-loading-card"><span class="hub-loading-spinner" aria-hidden="true"></span><span>정보를 불러오는 중입니다.</span></div>';
    var style=document.createElement('style');
    style.textContent='#hubLoadingOverlay{position:fixed;inset:0;z-index:3000;display:grid;place-items:center;background:rgba(243,245,250,.58);backdrop-filter:blur(2px)}#hubLoadingOverlay[hidden]{display:none}.hub-loading-card{display:flex;align-items:center;gap:10px;padding:14px 18px;border:1px solid #DCE2F0;border-radius:13px;background:#fff;color:#253E8A;box-shadow:0 14px 34px rgba(23,36,93,.16);font:700 13px "Noto Sans KR",sans-serif}.hub-loading-spinner{width:18px;height:18px;border:2px solid #D9E1F5;border-top-color:#253E8A;border-radius:50%;animation:hubLoadingSpin .75s linear infinite}@keyframes hubLoadingSpin{to{transform:rotate(360deg)}}html[data-theme="dark"] #hubLoadingOverlay{background:rgba(9,16,31,.58)}html[data-theme="dark"] .hub-loading-card{background:#202B40;border-color:#37445B;color:#E9EEFF}';
    document.head.appendChild(style);document.body.appendChild(overlay);return overlay;
  }
  function show(){if(timer||!pending)return;timer=setTimeout(function(){timer=null;if(!pending)return;var el=mount();if(el)el.hidden=false;},delay);}
  function hide(){if(pending)return;if(timer){clearTimeout(timer);timer=null;}if(overlay)overlay.hidden=true;}
  function tracked(input,init){
    var method=(init&&init.method)||(input&&input.method)||'GET';
    if(String(method).toUpperCase()!=='GET')return false;
    var url=typeof input==='string'?input:(input&&input.url)||'';
    return !/\/api\/(realtime-token|schedule-sync)/.test(url);
  }
  var originalFetch=window.fetch;
  if(typeof originalFetch==='function')window.fetch=function(input,init){
    if(!tracked(input,init))return originalFetch.apply(this,arguments);
    pending+=1;show();
    return originalFetch.apply(this,arguments).finally(function(){pending=Math.max(0,pending-1);hide();});
  };
  window.hubLoading={show:function(){pending+=1;show();},hide:function(){pending=Math.max(0,pending-1);hide();}};
})();
