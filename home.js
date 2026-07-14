(function(){
  var selectedDay='',selectedPost=null,editingId=null;
  var detail=document.getElementById('dayDetail');
  var modal=document.createElement('div');
  modal.className='quick-modal';modal.hidden=true;
  modal.innerHTML='<div class="quick-card"><h2 id="quickTitle">일정 등록</h2><label for="quickAuthor">작성자</label><input id="quickAuthor" maxlength="20"><label for="quickContent">내용</label><textarea id="quickContent" maxlength="400" placeholder="공지 또는 일정 내용을 입력하세요"></textarea><label for="quickDept">부서 (선택)</label><select id="quickDept"></select><label for="quickStart">시작일 (선택)</label><input id="quickStart" type="date"><label for="quickEnd">종료일 (선택)</label><input id="quickEnd" type="date"><label for="quickLink">링크 (선택)</label><input id="quickLink" placeholder="https://..."><div class="quick-actions"><button class="cancel" id="quickCancel">취소</button><button class="save" id="quickSave">저장</button></div></div>';
  document.body.appendChild(modal);
  var q=function(id){return document.getElementById(id)};
  function start(p){return p.start||p.deadline||''}function end(p){return p.end||p.deadline||p.start||''}
  function number(v){return v?Number(v.replaceAll('-','')):0}
  function dayPosts(key){return posts.filter(function(p){var s=start(p),e=end(p);return s&&number(key)>=number(s)&&number(key)<=number(e)})}
  function eventColor(p){var found=(departments||[]).find(function(d){return d.name===p.dept});return found&&found.color?found.color:(p.link?'#3E6B8A':p.start?'#1E7C5A':'#718096')}
  function dateLabel(key){return new Date(key+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})}
  function admin(){return sessionStorage.getItem('isAdmin')==='true'}
  function rangeText(p){var s=start(p),e=end(p);return s&&e&&s!==e?s.slice(5).replace('-','.')+' ~ '+e.slice(5).replace('-','.'):(s?s.slice(5).replace('-','.'):'상시')}

  window.renderCalendar=function(){
    var y=viewDate.getFullYear(),m=viewDate.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),today=new Date().toISOString().slice(0,10);
    q('monthTitle').textContent=new Date(y,m,1).toLocaleDateString('ko-KR',{year:'numeric',month:'long'});
    var html='';for(var i=0;i<first;i++)html+='<div class="day blank"></div>';
    for(var d=1;d<=days;d++){var key=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');var all=dayPosts(key),list=all.slice(0,2),dow=(first+d-1)%7;
      html+='<button class="day '+(key===today?'today ':'')+(key===selectedDay?'selected ':'')+(dow===0?'sun ':dow===6?'sat ':'')+'" data-day="'+key+'"><span class="day-num">'+d+'</span>'+list.map(function(p){return '<span class="event-line" style="--event:'+eventColor(p)+'" title="'+esc(p.content)+'">'+esc(p.content)+'</span>'}).join('')+(all.length>2?'<span style="font-size:9px;color:var(--muted)">+'+(all.length-2)+'</span>':'')+'</button>'}
    q('calendar').innerHTML=html;
    q('calendar').querySelectorAll('[data-day]').forEach(function(el){el.addEventListener('click',function(){selectedPost=null;selectedDay=this.dataset.day;window.renderCalendar();renderDetail()})});
  };
  function renderDetail(){
    if(!selectedDay&&!selectedPost){detail.innerHTML='<div class="day-detail-title">날짜를 선택하면 해당 공지와 일정을 표시합니다.</div>';return}
    var list=selectedPost?[selectedPost]:dayPosts(selectedDay);
    var rows=list.length?list.map(function(p){return '<div class="day-detail-item"><b>• '+esc(p.content)+'</b><small>'+esc(p.author||'작성자 미지정')+(p.dept?' · '+esc(p.dept):'')+' · '+rangeText(p)+'</small>'+(p.link?'<a href="'+esc(p.link)+'" target="_blank" rel="noopener">연결된 링크 ↗</a>':'')+(admin()?'<span class="day-item-actions"><button data-edit="'+p.id+'">수정</button><button data-delete="'+p.id+'">삭제</button></span>':'')+'</div>'}).join(''):'<div class="day-detail-item">등록된 공지나 일정이 없습니다.</div>';
    detail.innerHTML='<div class="day-detail-title">'+(selectedPost?'공지 상세':dateLabel(selectedDay)+' 공지·일정')+'</div>'+rows+(admin()?'<button class="day-add" id="dayAdd">＋ '+(selectedPost?'새 공지·일정':'이 날짜에 공지·일정')+' 등록</button>':'');
    var add=q('dayAdd');if(add)add.onclick=function(){openQuick(null)};
    detail.querySelectorAll('[data-edit]').forEach(function(button){button.onclick=function(){openQuick(posts.find(function(p){return p.id===button.dataset.edit}))}});
    detail.querySelectorAll('[data-delete]').forEach(function(button){button.onclick=function(){removePost(button.dataset.delete)}});
  }
  window.renderBoard=function(){
    var now=new Date().toISOString().slice(0,10);var list=posts.filter(function(p){return !end(p)||end(p)>=now}).sort(function(a,b){return (end(a)||'9999-12-31').localeCompare(end(b)||'9999-12-31')}).slice(0,12);
    q('postCount').textContent=list.length;q('board').innerHTML=list.length?list.map(function(p){return '<button class="post" type="button" data-post="'+p.id+'"><span class="post-mark" style="--color:'+eventColor(p)+'"></span><span><span class="post-title">'+esc(p.content)+'</span><span class="post-meta">'+esc(p.author||'작성자 미지정')+(p.dept?' · '+esc(p.dept):'')+'</span></span><span class="post-date">'+rangeText(p)+'</span></button>'}).join(''):'<div class="empty">표시할 공지가 없습니다.</div>';
    q('board').querySelectorAll('[data-post]').forEach(function(button){button.onclick=function(){var p=posts.find(function(item){return item.id===button.dataset.post});selectedPost=p;selectedDay=start(p)||end(p)||'';window.renderCalendar();renderDetail();document.querySelector('.cal-panel').scrollIntoView({behavior:'smooth',block:'start'})}});
  };
  window.render=function(){window.renderCalendar();window.renderBoard();renderDetail()};
  function departmentOptions(selected){return '<option value="">선택 안 함</option>'+(departments||[]).map(function(d){return '<option value="'+esc(d.name)+'"'+(d.name===selected?' selected':'')+'>'+esc(d.name)+'</option>'}).join('')}
  function openQuick(post){
    editingId=post?post.id:null;q('quickTitle').textContent=post?'공지·일정 수정':'공지·일정 등록';q('quickAuthor').value=post?post.author||'':'관리자';q('quickContent').value=post?post.content||'':'';q('quickDept').innerHTML=departmentOptions(post?post.dept:'');q('quickStart').value=post?start(post):selectedDay;q('quickEnd').value=post?end(post):selectedDay;q('quickLink').value=post?post.link||'':'';modal.hidden=false;q('quickContent').focus();
  }
  q('quickCancel').onclick=function(){modal.hidden=true};modal.onclick=function(e){if(e.target===modal)modal.hidden=true};
  q('quickSave').onclick=async function(){
    var author=q('quickAuthor').value.trim(),content=q('quickContent').value.trim(),link=q('quickLink').value.trim(),startDate=q('quickStart').value,endDate=q('quickEnd').value;
    if(!author||!content){alert('작성자와 내용을 입력하세요.');return}if(startDate&&endDate&&startDate>endDate){alert('종료일은 시작일보다 빠를 수 없습니다.');return}if(link&&!/^https?:\/\//.test(link))link='https://'+link;
    try{var r=await fetch('/api/dashboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'post:save',id:editingId||undefined,data:{author:author,content:content,link:link,dept:q('quickDept').value,start:startDate,end:endDate}})}),data=await r.json();if(!r.ok)throw Error(data.error||'저장하지 못했습니다.');posts=data.posts||[];departments=data.departments||[];selectedPost=editingId?posts.find(function(p){return p.id===editingId}):null;lastSignature=JSON.stringify({posts:posts,departments:departments});modal.hidden=true;window.render()}catch(e){alert(e.message||'저장하지 못했습니다.')}
  };
  async function removePost(id){if(!confirm('이 공지·일정을 삭제할까요?'))return;try{var r=await fetch('/api/dashboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'post:delete',id:id})}),data=await r.json();if(!r.ok)throw Error(data.error||'삭제하지 못했습니다.');posts=data.posts||[];departments=data.departments||[];selectedPost=null;lastSignature=JSON.stringify({posts:posts,departments:departments});window.render()}catch(e){alert(e.message||'삭제하지 못했습니다.')}}
  window.addEventListener('storage',function(e){if(e.key==='isAdmin')window.render()});
})();
