(function(){
  // Prueba de vida
  console.log("FinApp SAFE: JS cargado");
  const $ = (q)=>document.querySelector(q);
  const $$ = (q)=>Array.from(document.querySelectorAll(q));

  // Estado mínimo
  let data = JSON.parse(localStorage.getItem('finapp_safe') || '{"tx":[]}');
  function save(){ localStorage.setItem('finapp_safe', JSON.stringify(data)); }

  const PANELS=[
    {key:'resumen', label:'Resumen'},
    {key:'registrar', label:'Registrar'},
    {key:'respaldo', label:'Respaldo'}
  ];

  // Render tabs (idempotente)
  const tabs = $('#tabs');
  if (!tabs.querySelector('[data-key="resumen"]')) {
    PANELS.forEach(p=>{
      const b=document.createElement('button');
      b.className='tab'; b.textContent=p.label; b.dataset.key=p.key;
      tabs.appendChild(b);
    });
  }

  function show(key){
    $$('#tabs .tab').forEach(b=>b.classList.toggle('active', b.dataset.key===key));
    PANELS.forEach(p=>{
      const el = document.getElementById('panel-'+p.key);
      if (el) el.hidden = (p.key!==key);
    });
  }

  // Navegación
  tabs.addEventListener('click', (e)=>{
    const btn = e.target.closest('button.tab'); if(!btn) return;
    show(btn.dataset.key);
  });

  // Arranque
  show('resumen');
  const pf = $('#proof');
  if (pf) pf.textContent = 'Fecha/Hora local: ' + new Date().toString();

  // Registrar
  $('#add').addEventListener('click', ()=>{
    const desc = $('#desc').value.trim();
    const amount = Number($('#amount').value||0);
    if(!desc || amount<=0){ alert('Completa descripción y monto'); return; }
    data.tx.unshift({id:Date.now().toString(36), desc, amount, date: (new Date()).toISOString().slice(0,10)});
    save();
    renderList();
    $('#desc').value=''; $('#amount').value='';
  });

  function renderList(){
    const box = $('#list');
    box.innerHTML = data.tx.map(t => `${t.date} — ${t.desc}: $${amountFormat(t.amount)}`).join('<br/>') || 'Sin datos';
  }
  function amountFormat(n){ return (n||0).toLocaleString('es-CO',{maximumFractionDigits:0}); }
  renderList();

  // Exportar
  $('#export').addEventListener('click', ()=>{
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
    a.download = 'finapp_safe.json';
    a.click(); URL.revokeObjectURL(a.href);
  });
})();