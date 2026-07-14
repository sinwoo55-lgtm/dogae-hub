(function(){
  var selectedDay='',selectedPost=null,editingId=null,MAX_LANES=2;
  var detail=document.getElementById('dayDetail');
  var modal=document.createElement('div');
  modal.className='quick-modal';modal.hidden=true;
  modal.innerHTML='<div class="quick-card"><h2 id="quickTitle">일정 등록</h2><label for="quickAuthor">작성자</label><input id="quickAuthor" maxlength="20" placeholder="작성자 이름"><label for="quickPostTitle">제목 <span>*</span></label><input id="quickPostTitle" maxlength="80" placeholder="일정 또는 공지 제목"><label for="quickContent">설명 (선택)</label><textarea id="quickContent" maxlength="400" placeholder="게시판에서 제목 아래에 표시할 설명"></textarea><label for="quickDept">부서 (선택)</label><select id="quickDept"></select><label for="quickStart">시작일 (선택)</label><input id="quickStart" type="date"><label for="quickEnd">종료일 (선택)</label><input id="quickEnd" type="date"><label for="quickLink">링크 (선택)</label><input id="quickLink" placeholder="https://..."><label id="quickNoticeWrap" hidden><input id="quickNotice" type="checkbox"> 게시판 공지사항으로 등록</label><div class="quick-actions"><button class="cancel" id="quickCancel">취소</button><button class="save" id="quickSave">저장</button></div></div>';
  document.body.appendChild(modal);
  var q=function(id){return document.getElementById(id)};
  function start(p){return p.start||p.deadline||''}function end(p){return p.end||p.deadline||p.start||''}
  function title(p){return p.title||p.content||'제목 없음'}function description(p){return p.title?(p.content||''):''}
  function number(v){return v?Number(v.replaceAll('-','')):0}function todayKey(){return new Date().toISOString().slice(0,10)}
  function isNotice(p){return p.isNotice===true||(!start(p)&&!end(p))}
  function dayPosts(key){return posts.filter(function(p){var s=start(p),e=end(p);return !isNotice(p)&&s&&number(key)>=number(s)&&number(key)<=number(e)})}
  function eventColor(p){var found=(departments||[]).find(function(d){return d.name===p.dept});return found&&found.color?found.color:(p.link?'#3E6B8A':'#1E7C5A')}
  function dateLabel(key){return new Date(key+'T00:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'})}
  function admin(){return sessionStorage.getItem('isAdmin')==='true'}
  function rangeText(p){var s=start(p),e=end(p);return s&&e&&s!==e?s.slice(5).replace('-','.')+' ~ '+e.slice(5).replace('-','.'):(s?s.slice(5).replace('-','.'):'상시')}
  function addDays(key,days){var d=new Date(key+'T00:00:00');d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
  function remainingText(p){var e=end(p);if(!e)return '';var n=Math.ceil((new Date(e+'T00:00:00')-new Date(todayKey()+'T00:00:00'))/86400000);return n===0?'오늘 마감':n+'일 남음'}
  function visibleEvents(y,m){var first=y+'-'+String(m+1).padStart(2,'0')+'-01',last=y+'-'+String(m+1).padStart(2,'0')+'-'+String(new Date(y,m+1,0).getDate()).padStart(2,'0');var events=posts.filter(function(p){return !isNotice(p)&&start(p)&&end(p)&&start(p)<=last&&end(p)>=first}).slice().sort(function(a,b){var byStart=start(a).localeCompare(start(b));return byStart||end(b).localeCompare(end(a))});var lanes=[];events.forEach(function(p){var lane=lanes.findIndex(function(lastEnd){return lastEnd<start(p)});if(lane<0){lane=lanes.length;lanes.push(end(p))}else lanes[lane]=end(p);p._calendarLane=lane});return {events:events,first:first,last:last}}
  function lineClass(p,key,dow,bounds){var s=start(p),e=end(p),left=key===s||dow===0||key===bounds.first,right=key===e||dow===6||key===bounds.last;if(left&&right)return 'line-single';return (left?'line-start ':'')+(right?'line-end':'')}

  window.renderCalendar=function(){
    var y=viewDate.getFullYear(),m=viewDate.getMonth(),firstWeek=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),today=todayKey(),bounds=visibleEvents(y,m);
    q('monthTitle').textContent=new Date(y,m,1).toLocaleDateString('ko-KR',{year:'numeric',month:'long'});
    var html='';for(var i=0;i<firstWeek;i++)html+='<div class="day blank"></div>';
    for(var d=1;d<=days;d++){var key=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'),dow=(firstWeek+d-1)%7,active=bounds.events.filter(function(p){return start(p)<=key&&end(p)>=key}),lines='';
      for(var lane=0;lane<MAX_LANES;lane++){var p=active.find(function(item){return item._calendarLane===lane});lines+=p?'<span class="event-line '+lineClass(p,key,dow,bounds)+'" style="--event:'+eventColor(p)+'" title="'+esc(title(p))+'">'+((key===start(p)||key===bounds.first||dow===0)?esc(title(p)):'&nbsp;')+'</span>':'<span class="event-spacer"></span>'}
      var hidden=active.filter(function(p){return p._calendarLane>=MAX_LANES}).length;html+='<button class="day '+(key===today?'today ':'')+(key===selectedDay?'selected ':'')+(dow===0?'sun ':dow===6?'sat ':'')+'" data-day="'+key+'"><span class="day-num">'+d+'</span>'+lines+(hidden?'<span class="event-more">+'+hidden+'</span>':'')+'</button>'}
    q('calendar').innerHTML=html;
    q('calendar').querySelectorAll('[data-day]').forEach(function(el){el.addEventListener('click',function(){selectedPost=null;selectedDay=this.dataset.day;window.renderCalendar();renderDetail()})});
  };
  function detailRow(p){return '<div class="day-detail-item"><b>• '+esc(title(p))+'</b>'+(description(p)?'<span>'+esc(description(p))+'</span>':'')+'<small>'+esc(p.author||'작성자 미지정')+(p.dept?' · '+esc(p.dept):'')+' · '+rangeText(p)+'</small>'+(p.link?'<a href="'+esc(p.link)+'" target="_blank" rel="noopener">연결된 링크 ↗</a>':'')+(admin()?'<span class="day-item-actions"><button data-edit="'+p.id+'">수정</button><button data-delete="'+p.id+'">삭제</button></span>':'')+'</div>'}
  function renderDetail(){
    if(!selectedDay&&!selectedPost){detail.innerHTML='<div class="day-detail-title">날짜를 선택하면 해당 공지와 일정을 표시합니다.</div>';return}
    var list=selectedPost?[selectedPost]:dayPosts(selectedDay),rows=list.length?list.map(detailRow).join(''):'<div class="day-detail-item">등록된 일정이 없습니다.</div>';
    detail.innerHTML='<div class="day-detail-title">'+(selectedPost?(isNotice(selectedPost)?'공지사항':'일정 상세'):dateLabel(selectedDay)+' 일정')+'</div>'+rows+(selectedPost?'':'<button class="day-add" id="dayAdd">＋ 이 날짜에 일정 등록</button>');
    var add=q('dayAdd');if(add)add.onclick=function(){openQuick(null,false)};
    detail.querySelectorAll('[data-edit]').forEach(function(button){button.onclick=function(){openQuick(posts.find(function(p){return p.id===button.dataset.edit}),false)}});
    detail.querySelectorAll('[data-delete]').forEach(function(button){button.onclick=function(){removePost(button.dataset.delete)}});
  }
  window.renderBoard=function(){
    var today=todayKey(),limit=addDays(today,30),notices=posts.filter(isNotice),schedules=posts.filter(function(p){return !isNotice(p)&&start(p)&&end(p)&&end(p)>=today&&start(p)<=limit}).sort(function(a,b){return start(a).localeCompare(start(b))}),list=notices.concat(schedules).slice(0,12);
    q('postCount').textContent=list.length;q('board').innerHTML=list.length?list.map(function(p){var notice=isNotice(p);return '<button class="post '+(notice?'notice':'')+'" type="button" data-post="'+p.id+'"><span class="post-mark" style="--color:'+eventColor(p)+'"></span><span><span class="post-title">'+(notice?'<span class="notice-badge">공지</span>':'')+esc(title(p))+'</span>'+(description(p)?'<span class="post-description">'+esc(description(p))+'</span>':'')+'<span class="post-author">'+esc(p.author||'작성자 미지정')+(p.dept?' · '+esc(p.dept):'')+'</span></span><span class="post-date '+(notice?'notice-date':'')+'">'+(notice?'공지사항':remainingText(p))+'</span></button>'}).join(''):'<div class="empty">표시할 공지나 일정이 없습니다.</div>';
    q('board').querySelectorAll('[data-post]').forEach(function(button){button.onclick=function(){var p=posts.find(function(item){return item.id===button.dataset.post});selectedPost=p;selectedDay=isNotice(p)?'':(start(p)||end(p)||'');window.renderCalendar();renderDetail();document.querySelector('.cal-panel').scrollIntoView({behavior:'smooth',block:'start'})}});
  };
  window.render=function(){window.renderCalendar();window.renderBoard();renderDetail()};
  window.changeCalendarMonth=function(delta){viewDate.setMonth(viewDate.getMonth()+delta);selectedDay='';selectedPost=null;window.render()};
  window.updateHomeAdmin=function(){var add=q('addSchedule'),notice=q('addNotice');if(add){add.hidden=false;add.onclick=function(){selectedPost=null;selectedDay=selectedDay||todayKey();openQuick(null,false)}}if(notice){notice.hidden=!admin();notice.onclick=function(){selectedPost=null;selectedDay='';openQuick(null,true)}}window.render()};
  function departmentOptions(selected){return '<option value="">선택 안 함</option>'+(departments||[]).map(function(d){return '<option value="'+esc(d.name)+'"'+(d.name===selected?' selected':'')+'>'+esc(d.name)+'</option>'}).join('')}
  function openQuick(post,forceNotice){
    editingId=post?post.id:null;q('quickTitle').textContent=post?(isNotice(post)?'공지사항 수정':'일정 수정'):(forceNotice?'공지사항 등록':'일정 등록');q('quickAuthor').value=post?post.author||'':'';q('quickPostTitle').value=post?title(post):'';q('quickContent').value=post?description(post):'';q('quickDept').innerHTML=departmentOptions(post?post.dept:'');q('quickStart').value=post?start(post):(forceNotice?'':selectedDay);q('quickEnd').value=post?end(post):(forceNotice?'':selectedDay);q('quickLink').value=post?post.link||'':'';q('quickNoticeWrap').hidden=!admin();q('quickNotice').checked=forceNotice||(post&&post.isNotice===true);modal.hidden=false;q('quickPostTitle').focus();
  }
  q('quickCancel').onclick=function(){modal.hidden=true};modal.onclick=function(e){if(e.target===modal)modal.hidden=true};
  q('quickSave').onclick=async function(){
    var author=q('quickAuthor').value.trim(),postTitle=q('quickPostTitle').value.trim(),content=q('quickContent').value.trim(),link=q('quickLink').value.trim(),startDate=q('quickStart').value,endDate=q('quickEnd').value,isNoticePost=admin()&&q('quickNotice').checked;
    if(!author||!postTitle){alert('작성자와 제목을 입력하세요.');return}if(startDate&&endDate&&startDate>endDate){alert('종료일은 시작일보다 빠를 수 없습니다.');return}if(link&&!/^https?:\/\//.test(link))link='https://'+link;if(isNoticePost){startDate='';endDate=''}
    try{var r=await fetch('/api/dashboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'post:save',id:editingId||undefined,data:{author:author,title:postTitle,content:content,link:link,dept:q('quickDept').value,start:startDate,end:endDate,isNotice:isNoticePost}})}),data=await r.json();if(!r.ok)throw Error(data.error||'저장하지 못했습니다.');posts=data.posts||[];departments=data.departments||[];selectedPost=editingId?posts.find(function(p){return p.id===editingId}):null;lastSignature=JSON.stringify({posts:posts,departments:departments});modal.hidden=true;window.render()}catch(e){alert(e.message||'저장하지 못했습니다.')}
  };
  async function removePost(id){if(!confirm('이 항목을 삭제할까요?'))return;try{var r=await fetch('/api/dashboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'post:delete',id:id})}),data=await r.json();if(!r.ok)throw Error(data.error||'삭제하지 못했습니다.');posts=data.posts||[];departments=data.departments||[];selectedPost=null;lastSignature=JSON.stringify({posts:posts,departments:departments});window.render()}catch(e){alert(e.message||'삭제하지 못했습니다.')}}
  window.updateHomeAdmin();
  window.addEventListener('storage',function(e){if(e.key==='isAdmin')window.updateHomeAdmin()});
})();
