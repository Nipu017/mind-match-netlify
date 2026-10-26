let myId=null,myName="",roomCode="",roomState=null,localSubmitted=false,pollTimer=null,timerInterval=null,lastStatus="",lastRound=0;
const $=id=>document.getElementById(id),screens={home:$("home"),room:$("room")};
const colors=["#c7b7ff","#ffcf9c","#9be7cb","#ffabc7","#a9d5ff","#f3e58d","#d5b5ff","#ffa98d"];
function showScreen(n){Object.values(screens).forEach(e=>e.classList.add("hidden"));screens[n].classList.remove("hidden");}
function error(id,msg=""){$(id).textContent=msg;}
function escapeHTML(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function api(endpoint,body=null){const headers={"Content-Type":"application/json"};if(myId&&roomCode){headers["X-Player-Id"]=myId;headers["X-Room-Code"]=roomCode;}const response=await fetch("/.netlify/functions/game?action="+encodeURIComponent(endpoint),{method:body===null?"GET":"POST",headers,body:body===null?undefined:JSON.stringify(body),cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Something went wrong.");return data;}
function avatar(name,i){return `<span class="avatar" style="background:${colors[i%colors.length]}">${escapeHTML((name||"?").slice(0,1).toUpperCase())}</span>`;}
function renderPlayers(container,players){$(container).innerHTML=players.map((p,i)=>`<div class="player-card">${avatar(p.name,i)}<div style="min-width:0"><div class="player-name">${escapeHTML(p.name)}${p.id===roomState?.hostId?' <span style="color:var(--orange)">★</span>':''}</div><div class="player-status">${p.connected===false?'<span style="color:#ff9f9f">Disconnected</span>':roomState?.status==="playing"?(p.submitted?'<span style="color:var(--mint)">✓ Locked in</span>':'Thinking…'):`${p.score} points`}</div></div></div>`).join("");}
function startPolling(){clearInterval(pollTimer);pollTimer=setInterval(async()=>{try{const d=await api("state");renderRoom(d.room);}catch(e){error("room-error",e.message);}},650);}
async function enterRoom(result,name){myId=result.playerId;myName=name;roomState=result.room;roomCode=result.room.code;localSubmitted=false;showScreen("room");error("home-error");error("room-error");renderRoom(roomState);startPolling();}
$("create-form").addEventListener("submit",async e=>{e.preventDefault();try{const name=$("host-name").value.trim();await enterRoom(await api("create",{name}),name);}catch(e){error("home-error",e.message);}});
$("join-form").addEventListener("submit",async e=>{e.preventDefault();try{const name=$("join-name").value.trim();await enterRoom(await api("join",{name,code:$("room-code").value}),name);}catch(e){error("home-error",e.message);}});
$("room-code").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5));
$("copy-code").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(roomCode);$("copy-code").textContent="Copied ✓";}catch{$("copy-code").textContent=roomCode;}setTimeout(()=>$("copy-code").textContent="Copy code ↗",1800);});
$("start-game").addEventListener("click",async()=>{try{await api("start",{});error("room-error");}catch(e){error("room-error",e.message);}});
$("answer-form").addEventListener("submit",async e=>{e.preventDefault();if(localSubmitted)return;const answer=$("answer-input").value.trim();if(!answer){$("answer-input").focus();return;}try{await api("answer",{answer});localSubmitted=true;$("answer-input").disabled=true;$("submit-answer").disabled=true;$("submitted-note").classList.remove("hidden");$("answer-form").classList.add("hidden");error("room-error");}catch(e){error("room-error",e.message);}});
$("back-home").addEventListener("click",()=>{clearInterval(pollTimer);location.reload();});
function renderRoom(room){
 const priorStatus=roomState?.status,priorRound=roomState?.round;
 roomState=room;$("room-code-display").textContent=room.code;$("player-count").textContent=`${room.players.length} / 8`;
 $("room-title").innerHTML=`Room <span id="room-code-display">${room.code}</span>`;
 const me=room.players.find(p=>p.id===myId);const isHost=room.hostId===myId;
 if(room.status==="lobby"){
  $("lobby").classList.remove("hidden");$("game").classList.add("hidden");$("start-game").classList.toggle("hidden",!isHost);$("start-game").disabled=room.players.length<2;
  $("lobby-hint").textContent=room.players.length<2?"Waiting for at least one more player…":isHost?"Everyone's here. Start when you're ready.":"You're in! Waiting for the host to start.";
  renderPlayers("players",room.players);showScreen("room");return;
 }
 $("lobby").classList.add("hidden");$("game").classList.remove("hidden");
 if(room.status==="playing"){
  $("reveal-panel").classList.add("hidden");$("final-panel").classList.add("hidden");$("round-label").textContent=`ROUND ${room.round} OF ${room.totalRounds}`;
  $("prompt-text").textContent=room.prompt;$("prompt-help").textContent="Don't overthink it. What will the group say?";
  if(priorStatus!=="playing"||priorRound!==room.round){localSubmitted=Boolean(me?.submitted);$("answer-input").value="";$("answer-input").disabled=localSubmitted;$("submit-answer").disabled=localSubmitted;}
  localSubmitted=localSubmitted||Boolean(me?.submitted);
  $("answer-form").classList.toggle("hidden",localSubmitted);$("submitted-note").classList.toggle("hidden",!localSubmitted);
  const submitted=room.players.filter(p=>p.submitted).length;$("submitted-count").textContent=`${submitted} of ${room.players.length} locked in`;
  renderPlayers("live-players",room.players);updateTimer(room.deadline);
 }else if(room.status==="reveal"){
  clearInterval(timerInterval);$("answer-form").classList.add("hidden");$("submitted-note").classList.add("hidden");$("round-label").textContent=`ROUND ${room.round} OF ${room.totalRounds}`;
  $("prompt-text").textContent=room.prompt;$("prompt-help").textContent="Answers are in. Let's see who thought alike.";$("timer-value").textContent="✓";$("timer-bar").style.width="0%";renderReveal(room);
 }else if(room.status==="finished"){
  clearInterval(timerInterval);$("reveal-panel").classList.add("hidden");$("final-panel").classList.remove("hidden");
  const sorted=[...room.players].sort((a,b)=>b.score-a.score),top=sorted[0]?.score??0,winners=sorted.filter(p=>p.score===top);
  $("final-title").textContent=winners.length===1?`${winners[0].name} gets the vibe!`:"Great minds think alike.";
  $("final-subtitle").textContent=winners.length===1?"The Mind Match champion.":"It's a tie! You shared the top score.";
  $("final-leaderboard").innerHTML=sorted.map((p,i)=>`<div class="leader-row"><span class="leader-rank">${i===0?"✦":String(i+1).padStart(2,"0")}</span>${avatar(p.name,i)}<span class="player-name">${escapeHTML(p.name)}</span><span class="leader-score">${p.score} pts</span></div>`).join("");
 }
 showScreen("room");
}
function updateTimer(deadline){clearInterval(timerInterval);const tick=()=>{const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));$("timer-value").textContent=left;$("timer-bar").style.width=`${Math.max(0,left/20*100)}%`;};tick();timerInterval=setInterval(tick,250);}
function renderReveal(room){$("reveal-panel").classList.remove("hidden");const results=room.results,winning=new Set(results?.winnerIds||[]);$("reveal-title").textContent=results?.maxGroupSize>=2?`${results.maxGroupSize} ${results.maxGroupSize===1?"person":"people"} thought alike!`:"No matches this round.";
 const groups=results?.groups||[];$("answer-groups").innerHTML=groups.length?groups.map(g=>{const winner=g.playerIds.some(id=>winning.has(id));return `<div class="answer-group ${winner?"winner":""}"><div class="answer-top"><span class="answer-text">${escapeHTML(g.answer)}</span><span class="answer-count">${g.playerIds.length} ${g.playerIds.length===1?"match":"matches"}</span></div><div class="answer-names">${g.names.map(escapeHTML).join(", ")}</div>${winner?'<div class="winner-label">✦ +2 POINTS EACH</div>':""}</div>`;}).join(""):'<p class="muted">Nobody submitted an answer this round.</p>';
 const awarded=room.players.filter(p=>winning.has(p.id)).map(p=>p.name);$("reveal-footer").textContent=awarded.length?`${awarded.join(", ")} ${awarded.length===1?"earns":"earn"} 2 points. Next round starting soon…`:"No points awarded. Next round starting soon…";renderPlayers("live-players",room.players);}
