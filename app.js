/* 赛博塔罗 · 应用逻辑 */
(function(){
'use strict';

var $ = function(id){ return document.getElementById(id); };
var CFG_KEY = 'cybertarot_cfg_v1';

var PRESETS = {
  deepseek: {url:'https://api.deepseek.com/v1', model:'deepseek-chat'},
  openai:   {url:'https://api.openai.com/v1', model:'gpt-4o-mini'},
  moonshot: {url:'https://api.moonshot.cn/v1', model:'moonshot-v1-8k'},
  qwen:     {url:'https://dashscope.aliyuncs.com/compatible-mode/v1', model:'qwen-plus'},
  custom:   {url:'', model:''}
};

var SPREADS = {
  1:  {name:'每日一牌', positions:['今日指引']},
  3:  {name:'时间之流', positions:['过去','现在','未来']},
  10: {name:'凯尔特十字', positions:['现状','阻碍·助力','根基','过去','目标','近期未来','自我态度','外部环境','希望与恐惧','最终结果']}
};

var CDN = 'https://cdn.jsdelivr.net/gh/feng5166/cyberfate@08d03879936946e9e014ac15aa389271c4d24af2/public/images/tarot/cards/';

var state = { spread:1, question:'', reading:[], positions:[], spreadName:'', busy:false };

/* ---------- 星空背景 ---------- */
(function(){
  var cv = $('bg'), ctx = cv.getContext('2d');
  var W,H,stars=[],meteors=[],lastM=0;
  function init(){
    var dpr = Math.min(window.devicePixelRatio||1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W*dpr; cv.height = H*dpr;
    cv.style.width = W+'px'; cv.style.height = H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    stars = [];
    var n = Math.min(200, Math.round(W*H/8000));
    for(var i=0;i<n;i++) stars.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.1+0.3,p:Math.random()*6.28,s:0.5+Math.random()});
  }
  window.addEventListener('resize', init);
  function tick(t){
    ctx.clearRect(0,0,W,H);
    for(var i=0;i<stars.length;i++){
      var s = stars[i];
      var a = 0.3+0.7*(0.5+0.5*Math.sin(t/1000*s.s+s.p));
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,6.283);
      ctx.fillStyle = 'rgba(255,240,205,'+a.toFixed(3)+')'; ctx.fill();
    }
    if(t-lastM > 5000+Math.random()*4000 && meteors.length<2){
      lastM = t;
      meteors.push({x:W*0.2+Math.random()*W*0.6, y:H*0.05+Math.random()*H*0.25, vx:5+Math.random()*3, vy:2+Math.random()*1.5, l:0, m:52});
    }
    for(var j=meteors.length-1;j>=0;j--){
      var m = meteors[j]; m.x+=m.vx; m.y+=m.vy; m.l++;
      var k = 1-m.l/m.m;
      if(k<=0){ meteors.splice(j,1); continue; }
      var g = ctx.createLinearGradient(m.x,m.y,m.x-m.vx*8,m.y-m.vy*8);
      g.addColorStop(0,'rgba(255,250,230,'+(0.85*k).toFixed(3)+')');
      g.addColorStop(1,'rgba(255,250,230,0)');
      ctx.strokeStyle=g; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(m.x,m.y); ctx.lineTo(m.x-m.vx*8,m.y-m.vy*8); ctx.stroke();
    }
    requestAnimationFrame(tick);
  }
  init(); requestAnimationFrame(tick);
})();

/* ---------- 小工具 ---------- */
function shuffle(a){
  for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; }
  return a;
}
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]; }); }
function mdRender(s){
  var h = escapeHtml(s);
  h = h.replace(/^\s*#{2,4}\s*(.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/\n/g,'<br>');
  return h;
}
function imgUrl(c){ return CDN + c.a + '/' + c.k + '.webp'; }
function backupUrl(c){ return 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(c.w) + '?width=420'; }
window.taroImgErr = function(img){
  if(img.dataset.fb !== '1'){ img.dataset.fb = '1'; img.src = img.dataset.backup; }
  else { img.style.display = 'none'; img.closest('.tcard').classList.add('noimg'); }
};
function toast(msg){
  var d = document.createElement('div');
  d.textContent = msg;
  d.style.cssText = 'position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:99;padding:11px 22px;border-radius:999px;background:rgba(38,22,66,.95);border:1px solid rgba(232,201,122,.5);color:#ffdf8e;font-size:.92rem;letter-spacing:.08em;box-shadow:0 10px 30px rgba(0,0,0,.5);transition:opacity .3s;font-family:inherit;';
  document.body.appendChild(d);
  setTimeout(function(){ d.style.opacity='0'; setTimeout(function(){ d.remove(); }, 320); }, 1900);
}

/* ---------- 抽牌与渲染 ---------- */
function draw(){
  var sp = SPREADS[state.spread];
  var deck = shuffle(window.TAROT_CARDS.slice());
  var n = sp.positions.length;
  var picked = deck.slice(0, n);
  state.reading = picked.map(function(c){ return { card:c, reversed: Math.random()<0.5, revealed:false }; });
  state.positions = sp.positions;
  state.spreadName = sp.name;
  renderTable();
}

function renderTable(){
  var wrap = $('cardTable');
  wrap.className = 'card-table g' + state.spread;
  wrap.innerHTML = state.reading.map(function(r,i){
    var c = r.card;
    return '<div class="slot">' +
      '<div class="slot-label">' + state.positions[i] + '</div>' +
      '<div class="tcard' + (r.reversed?' reversed':'') + '" data-idx="' + i + '">' +
        '<div class="inner">' +
          '<div class="face back"></div>' +
          '<div class="face front">' +
            '<img loading="lazy" alt="' + c.n + '" src="' + imgUrl(c) + '" data-backup="' + backupUrl(c) + '" onerror="taroImgErr(this)">' +
            '<div class="fallback"><span class="sym">' + c.s + '</span><span class="nm">' + c.n + '</span></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  $('stepSetup').hidden = true;
  $('stepRead').hidden = true;
  $('aiBox').innerHTML = '<div class="placeholder">牌面全部翻开后，这里会亮起 ✨</div>';
  $('stepDraw').hidden = false;
  $('drawHint').textContent = '深呼吸，凭直觉点击翻开每一张牌（共 ' + state.reading.length + ' 张）';
  $('stepDraw').scrollIntoView({behavior:'smooth', block:'start'});
}

$('cardTable').addEventListener('click', function(e){
  var card = e.target.closest('.tcard');
  if(!card) return;
  var idx = +card.dataset.idx;
  var r = state.reading[idx];
  if(!r || r.revealed) return;
  r.revealed = true;
  card.classList.add('flipped');
  var slot = card.closest('.slot');
  slot.querySelector('.slot-label').textContent = state.positions[idx] + ' · ' + r.card.n + (r.reversed?'（逆位）':'');
  if(state.reading.every(function(x){ return x.revealed; })){
    setTimeout(function(){
      $('stepRead').hidden = false;
      $('stepRead').scrollIntoView({behavior:'smooth', block:'start'});
    }, 700);
  }
});

$('shuffleBtn').addEventListener('click', function(){
  if(state.busy) return;
  state.busy = true;
  state.question = $('question').value.trim();
  var btn = $('shuffleBtn');
  btn.disabled = true; btn.textContent = '洗牌中…';
  setTimeout(function(){
    draw();
    btn.disabled = false; btn.textContent = '洗 牌';
    state.busy = false;
  }, 900);
});

document.querySelectorAll('.spread').forEach(function(b){
  b.addEventListener('click', function(){
    document.querySelectorAll('.spread').forEach(function(x){ x.classList.toggle('active', x===b); });
    state.spread = +b.dataset.spread;
  });
});

$('againBtn').addEventListener('click', function(){
  state.reading = [];
  $('stepDraw').hidden = true;
  $('stepRead').hidden = true;
  $('cardTable').innerHTML = '';
  $('stepSetup').hidden = false;
  $('stepSetup').scrollIntoView({behavior:'smooth'});
});

/* ---------- 复制牌面 ---------- */
function copyText(){
  var q = state.question || '（未填写问题）';
  var t = '🔮 赛博塔罗 · ' + state.spreadName + '（' + state.reading.length + '张）\n问题：' + q + '\n\n';
  state.reading.forEach(function(r,i){
    t += (i+1) + '. ' + state.positions[i] + '：' + r.card.n + (r.reversed?'（逆位）':'（正位）') + '\n';
  });
  var d = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  t += '\n—— ' + d.getFullYear() + '/' + (d.getMonth()+1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' 抽于赛博塔罗';
  return t;
}
$('copyBtn').addEventListener('click', function(){
  var t = copyText();
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(function(){ toast('已复制牌面 ✓ 可直接粘贴给我'); }, function(){ fallbackCopy(t); });
  } else { fallbackCopy(t); }
});
function fallbackCopy(t){
  var ta = document.createElement('textarea');
  ta.value = t; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); toast('已复制牌面 ✓'); }catch(e){ toast('复制失败，请长按手动选择'); }
  ta.remove();
}

/* ---------- AI 解读 ---------- */
function loadCfg(){
  try{ return JSON.parse(localStorage.getItem(CFG_KEY)||'{}'); }catch(e){ return {}; }
}
function openModal(){
  var cfg = loadCfg();
  $('provSel').value = cfg.prov || 'deepseek';
  var p = PRESETS[$('provSel').value] || PRESETS.deepseek;
  $('baseUrl').value = cfg.url || p.url;
  $('apiKey').value = cfg.key || '';
  $('model').value = cfg.model || p.model;
  $('modal').hidden = false;
}
function buildMessages(){
  var q = state.question || '（没有具体问题，请给我一份整体的指引）';
  var lines = state.reading.map(function(r,i){
    var ori = r.reversed ? '逆位' : '正位';
    var mean = r.reversed ? r.card.r : r.card.u;
    return (i+1) + '. ' + state.positions[i] + '：' + r.card.n + ' · ' + ori + '（参考牌义：' + mean + '）';
  }).join('\n');
  return [
    {role:'system', content:'你是一位温柔、敏锐、有经验的塔罗解读师，名字叫星野。请用简体中文解读。要求：先用一句话给出整体感受；然后逐张解读，结合【位置含义】【牌名与正逆位】【用户的问题】，每张2-4句，像面对面聊天一样自然；最后给出2-3条具体可落地的建议和一句温柔的提醒。语气温暖真诚，不恐吓、不绝对化、不堆砌术语。可用少量小标题（如"### 整体感受"）与换行让结构清晰。'},
    {role:'user', content:'【我的问题】' + q + '\n【牌阵】' + state.spreadName + '（共' + state.reading.length + '张）\n【抽牌结果】\n' + lines}
  ];
}
function streamChat(cfg, messages, onDelta){
  var url = cfg.url.replace(/\/+$/,'') + '/chat/completions';
  return fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer ' + cfg.key},
    body: JSON.stringify({ model:cfg.model, messages:messages, stream:true, temperature:0.85 })
  }).then(function(res){
    if(!res.ok){
      return res.text().then(function(detail){
        throw new Error('接口返回 ' + res.status + (detail ? '：' + detail.slice(0,300) : ''));
      });
    }
    var reader = res.body.getReader();
    var dec = new TextDecoder();
    var buf = '', full = '';
    function pump(){
      return reader.read().then(function(x){
        if(x.done) return full;
        buf += dec.decode(x.value, {stream:true});
        var i;
        while((i = buf.indexOf('\n')) >= 0){
          var line = buf.slice(0,i).replace(/\r$/,'');
          buf = buf.slice(i+1);
          if(line.indexOf('data:') !== 0) continue;
          var payload = line.slice(5).trim();
          if(payload === '[DONE]') return full;
          try{
            var j = JSON.parse(payload);
            var d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if(d){ full += d; onDelta(d); }
          }catch(e){}
        }
        return pump();
      });
    }
    return pump();
  });
}
$('aiBtn').addEventListener('click', function(){
  if(state.busy) return;
  var cfg = loadCfg();
  if(!cfg.key || !cfg.url || !cfg.model){
    openModal();
    toast('先填好接口设置，再点 AI 解读哦');
    return;
  }
  state.busy = true;
  var btn = $('aiBtn');
  btn.disabled = true; btn.textContent = '解读中…';
  var box = $('aiBox');
  box.innerHTML = '<div class="placeholder">✨ 星野正在为你解读，请稍候…</div>';
  var full = '';
  streamChat(cfg, buildMessages(), function(d){
    full += d;
    box.innerHTML = mdRender(full) + '<span style="opacity:.6">▍</span>';
  }).then(function(){
    box.innerHTML = mdRender(full || '（接口没有返回内容，请检查模型名是否正确）');
  }).catch(function(err){
    box.innerHTML = '<div class="err">解读失败：' + escapeHtml(err.message || String(err)) +
      '<br><br>小提示：请确认 ⚙ 设置里的接口地址、Key、模型名正确；如果浏览器提示跨域错误，说明该接口不允许网页直接调用，可换一个支持跨域的接口。</div>';
  }).then(function(){
    state.busy = false;
    btn.disabled = false; btn.textContent = '🔮 AI 解读';
  });
});

/* ---------- 设置面板 ---------- */
$('settingsBtn').addEventListener('click', openModal);
$('closeModal').addEventListener('click', function(){ $('modal').hidden = true; });
$('modal').addEventListener('click', function(e){ if(e.target === $('modal')) $('modal').hidden = true; });
$('provSel').addEventListener('change', function(){
  var v = $('provSel').value;
  var p = PRESETS[v];
  if(p && v !== 'custom'){ $('baseUrl').value = p.url; $('model').value = p.model; }
});
$('saveCfg').addEventListener('click', function(){
  localStorage.setItem(CFG_KEY, JSON.stringify({
    prov: $('provSel').value,
    url: $('baseUrl').value.trim(),
    key: $('apiKey').value.trim(),
    model: $('model').value.trim()
  }));
  $('modal').hidden = true;
  toast('设置已保存 ✓');
});

})();
