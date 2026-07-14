(function(){
  var selectedDay='';
  var detail=document.getElementById('dayDetail');
  var modal=document.createElement('div');
  modal.className='quick-modal';modal.hidden=true;
  modal.innerHTML='<div class="quick-card"><h2 id="quickTitle">일정 등록</h2><label for="quickAuthor">작성자</label><input id="quickAuthor" value="관리자" maxlength="20"><label for="quickContent">내용</label><textarea id="quickContent" maxlength="400" placeholder="일정 내용을 입력하세요"></textarea><label for="quickLink">링크 (선택)</label><input id="quickLink" placeholder="https://..."><div class="quick-actions"><button class="cancel" id="quickCancel">취소</button><button class="save" id="quickSave">등록</button></div></div>';
  document.body.appendChild(modal);
  var q=function(id){return document.getElementById(id)};
  function start(p){return p.start||p.deadline||''}function end(p){return p.end||p.deadline||p.start||''}
  function number(v){return v?Number(v.replaceAll('-','')):0}
  function dayPosts(key){return posts.filter(function(p){var s=start(p),e=end(p);return s&&number(key)>=number(s)&&number(key)<=number(e)})}
  function eventColor(p){return p.link?'#3E6B8A':p.start?'#1E7C5A':'#718096'}
  window.renderCalendar=function(){
    var y=viewDate.getFullYear(),m=viewDate.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),today=new Date().toISOString().slice(0,10);
    q('monthTitle').textContent=new Date(y,m,1).toLocaleDateString('ko-KR',{year:'numeric',month:'long'});
    var html='';for(var i=0;i<first;i++)html+='<div class="day blank"></div>';
    for(var d=1;d<=days;d++){var key=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');var list=dayPosts(key).slice(0,2),dow=(first+d-1)%7;
      html+='<button class="day '+(key===today?'today ':'')+(key===selectedDay?'selected ':'')+(dow===0?'sun ':dow===6?'sat ':'')+'" data-day="'+key+'"><span class="day-num">'+d+'</span>'+list.map(function(p){return '<span class="event-line" style="--event:'+eventColor(p)+'" title="'+esc(p.content)+'">'+esc(p.content)+'</span>'}).join('')+(dayPosts(key).length>2?'<span style="font-size:9px;color:var(--muted)">+'+(dayPosts(key).length-2)+'</span>':'')+'</button>'}
    q('calendar').innerHTML=html;
    q('calendar').querySelectorAll('[data-day]').forEach(function(el){el.addEventListener('click',function(){selectedDay=this.dataset.day;window.renderCalendar();renderDetail()})});
  };
  function renderDetail(){
    if(!selectedDay){detail.innerHTML='<div class="day-detail-title">날짜를 선택하면 해당 일정이 표시됩니다.</div>';return}
    var list=dayPosts(selectedDay), label=new Date(selectedDay+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
    detail.innerHTML='<div class="day-detail-title">'+label+' 일정</div>'+(list.length?list.map(function(p){return '<div class="day-detail-item">• '+esc(p.content)+'</div>'}).join(''):'<div class="day-detail-item">등록된 일정이 없습니다.</div>')+(sessionStorage.getItem('isAdmin')==='true'?'<button class="day-add" id="dayAdd">＋ 이 날짜에 일정 등록</button>':'');
    var add=q('dayAdd');if(add)add.onclick=openQuick;
  }
  window.renderBoard=function(){
    var now=new Date().toISOString().slice(0,10);var list=posts.filter(function(p){return !end(p)||end(p)>=now}).sort(function(a,b){return (end(a)||'9999-12-31').localeCompare(end(b)||'9999-12-31')}).slice(0,12);
    q('postCount').textContent=list.length;q('board').innerHTML=list.length?list.map(function(p){return '<a class="post" href="dashboard.html" style="color:inherit;text-decoration:none"><span class="post-mark" style="--color:'+eventColor(p)+'"></span><span><span class="post-title">'+esc(p.content)+'</span><span class="post-meta">'+esc(p.author||'작성자 미지정')+(p.dept?' · '+esc(p.dept):'')+'</span></span><span class="post-date">'+(end(p)?end(p).slice(5).replace('-','.'):'상시')+'</span></a>'}).join(''):'<div class="empty">표시할 공지가 없습니다.</div>';
  };
  window.render=function(){window.renderCalendar();window.renderBoard();renderDetail()};
  function openQuick(){q('quickTitle').textContent=selectedDay+' 일정 등록';q('quickContent').value='';q('quickLink').value='';modal.hidden=false;q('quickContent').focus()}
  q('quickCancel').onclick=function(){modal.hidden=true};modal.onclick=function(e){if(e.target===modal)modal.hidden=true};
  q('quickSave').onclick=async function(){var author=q('quickAuthor').value.trim(),content=q('quickContent').value.trim(),link=q('quickLink').value.trim();if(!author||!content){alert('작성자와 내용을 입력하세요.');return}if(link&&!/^https?:\/\//.test(link))link='https://'+link;try{var r=await fetch('/api/dashboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'post:save',data:{author:author,content:content,link:link,dept:'',start:selectedDay,end:selectedDay,deadline:selectedDay}})}),data=await r.json();if(!r.ok)throw Error(data.error||'등록하지 못했습니다.');lastSignature='';posts=data.posts||[];lastSignature=JSON.stringify(posts);modal.hidden=true;window.render()}catch(e){alert(e.message||'일정을 등록하지 못했습니다.')}}
  window.addEventListener('storage',function(e){if(e.key==='isAdmin')renderDetail()});
})();
