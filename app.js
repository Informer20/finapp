(function(){
  function $(q){ return document.querySelector(q); }
  function $all(q){ return Array.prototype.slice.call(document.querySelectorAll(q)); }

  var state = { tx: [] };
  try { state = JSON.parse(localStorage.getItem('finapp_ultra') || '{"tx":[]}'); } catch(e){ state = {tx:[]}; }
  function save(){ localStorage.setItem('finapp_ultra', JSON.stringify(state)); }

  var PANELS=[{key:'resumen'},{key:'registrar'},{key:'respaldo'}];

  function show(key){
    $all('#tabs .tab').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-key')===key); });
    PANELS.forEach(function(p){
      var el = document.getElementById('panel-'+p.key);
      if(el){ el.hidden = (p.key!==key); }
    });
  }

  document.getElementById('tabs').addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('button.tab') : (e.target.matches && e.target.matches('button.tab') ? e.target : null);
    if(!btn) return;
    show(btn.getAttribute('data-key'));
  });

  // arranque
  show('resumen');
  var pf = $('#proof');
  if(pf){ pf.textContent = 'JavaScript OK - ' + new Date().toString(); }

  // registrar
  $('#add').addEventListener('click', function(){
    var d = $('#desc').value.trim();
    var a = Number($('#amount').value||0);
    if(!d || !(a>0)){ alert('Completa descripcion y monto'); return; }
    state.tx.unshift({id: String(Date.now()), desc:d, amount:a, date: (new Date()).toISOString().slice(0,10)});
    save();
    renderList();
    $('#desc').value=''; $('#amount').value='';
  });

  function renderList(){
    var box = $('#list');
    if(!state.tx.length){ box.textContent = 'Sin datos'; return; }
    box.innerHTML = state.tx.map(function(t){
      return t.date + ' - ' + t.desc + ': $' + numberFormat(t.amount);
    }).join('<br/>');
  }
  function numberFormat(n){ return (n||0).toLocaleString('es-CO', {maximumFractionDigits:0}); }
  renderList();

  // export
  $('#export').addEventListener('click', function(){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)], {type:'application/json'}));
    a.download = 'finapp_ultra.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
})();