;(function(){
  // Marca temprana: así sabemos que el JS se ejecutó
  try { document.getElementById('debug').textContent = 'JS running...'; } catch(e) {}

  function $(q){ return document.querySelector(q); }
  function qsa(q){ return Array.prototype.slice.call(document.querySelectorAll(q)); }

  var state = { tx: [] };
  try { state = JSON.parse(localStorage.getItem('finapp_ultra2') || '{"tx":[]}'); } catch(e){ state = {tx:[]}; }
  function save(){ localStorage.setItem('finapp_ultra2', JSON.stringify(state)); }

  var PANELS = [{key:'resumen'},{key:'registrar'},{key:'respaldo'}];

  function show(key){
    qsa('#tabs .tab').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-key')===key); });
    PANELS.forEach(function(p){
      var el = document.getElementById('panel-'+p.key);
      if (el) el.hidden = (p.key!==key);
    });
  }

  var tabs = document.getElementById('tabs');
  tabs.addEventListener('click', function(e){
    var t = e.target;
    while (t && t !== tabs && !(t.tagName==='BUTTON' && t.className.indexOf('tab')>-1)) { t = t.parentNode; }
    if (!t || t===tabs) return;
    show(t.getAttribute('data-key'));
  });

  show('resumen');
  var pf = document.getElementById('proof');
  if (pf) pf.textContent = 'JavaScript OK - ' + new Date().toString();

  document.getElementById('add').addEventListener('click', function(){
    var d = document.getElementById('desc').value.trim();
    var a = Number(document.getElementById('amount').value||0);
    if(!d || !(a>0)){ alert('Completa descripcion y monto'); return; }
    state.tx.unshift({id:String(Date.now()), desc:d, amount:a, date:(new Date()).toISOString().slice(0,10)});
    save();
    renderList();
    document.getElementById('desc').value=''; document.getElementById('amount').value='';
  });

  function renderList(){
    var box = document.getElementById('list');
    if(!state.tx.length){ box.textContent='Sin datos'; return; }
    var out = [];
    for (var i=0;i<state.tx.length;i++){
      var t = state.tx[i];
      out.push(t.date+' - '+t.desc+': $'+numberFormat(t.amount));
    }
    box.innerHTML = out.join('<br/>');
  }
  function numberFormat(n){ return (n||0).toLocaleString('es-CO',{maximumFractionDigits:0}); }
  renderList();
})();