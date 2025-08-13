(function(){
  'use strict';

  // ==== Utils ====
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const fmtMoney = (n)=>{
    const sign = n<0?"-":"";
    const v = Math.abs(n||0);
    return `${sign}COP $${v.toLocaleString('es-CO',{maximumFractionDigits:0})}`;
  };
  const todayStr = ()=>{
    const d=new Date();
    const tz = new Date(d.getTime()-d.getTimezoneOffset()*60000);
    return tz.toISOString().slice(0,10);
  };
  const startOfMonth=(d)=> new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth=(d)=> new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
  const startOfWeek=(d)=>{ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; };
  const endOfWeek=(d)=>{const s=startOfWeek(d); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return e;};
  const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
  const escapeHtml=(s)=> (s==null?'':String(s)).replace(/[&<>"']/g, function(c){
    return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]);
  });

  // Convierte "YYYY-MM-DD" a Date local (sin corrimiento a UTC)
  function parseLocalDate(s) {
    if (!s) return new Date();
    const [y, m, d] = s.split('-').map(n => parseInt(n, 10));
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  // Normaliza fechas variadas a "YYYY-MM-DD"
  function normalizeDate(val) {
    if (!val) return todayStr();
    val = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    let m = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) { const [,d,mm,y]=m; return `${y}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
    m = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) { let [,mm,d,y]=m; if(String(y).length===2) y=`20${y}`; return `${y}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
    if (/^\d{3,5}$/.test(val)) { const serial=parseInt(val,10); const base=new Date(1899,11,30); base.setDate(base.getDate()+serial);
      return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`; }
    const d=new Date(val); if(!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return todayStr();
  }

  // ==== State ====
  const DEFAULTS={
    categories:["Fijos","Necesarios","Transporte","Alimentación","Salud","Educación","Ocio","Servicios","Otros","Sueldo","Honorarios","Comida","Banco de occidente"],
    methods:["Efectivo","Nequi","Bancolombia","Daviplata","Tarjeta Crédito","Tarjeta Débito","Banco de occidente"],
    savePercent:20,
    transactions:[],
    debts:[]
  };
  const load = ()=>{ try{ return JSON.parse(localStorage.getItem('finapp_data')) || DEFAULTS }catch(e){ return DEFAULTS } };
  const save = ()=> localStorage.setItem('finapp_data', JSON.stringify(state));
  let state = load();

  // ==== Theme ====
  const themeBtns = $$('#themeBtns .tab');
  const applyTheme = (mode)=>{
    if(mode==='auto'){ document.documentElement.removeAttribute('data-theme'); }
    else if(mode==='dark'){ document.documentElement.setAttribute('data-theme','dark'); }
    else { document.documentElement.setAttribute('data-theme','light'); }
    localStorage.setItem('finapp_theme', mode);
    themeBtns.forEach(b=>b.classList.toggle('active', b.dataset.theme===mode));
  };
  themeBtns.forEach(b=>b.addEventListener('click', ()=>applyTheme(b.dataset.theme)));
  applyTheme(localStorage.getItem('finapp_theme')||'auto');

  // Online pill
  const onlinePill = $('#onlinePill');
  const setOnline=()=> onlinePill.textContent = (navigator.onLine?'● Online':'○ Offline');
  window.addEventListener('online', setOnline); window.addEventListener('offline', setOnline); setOnline();

  // ==== Navigation ====
  const PANELS=[
    {key:'resumen', label:'Resumen'},
    {key:'registrar', label:'Registrar'},
    {key:'deudas', label:'Deudas'},
    {key:'categorias', label:'Categorías'},
    {key:'respaldo', label:'Respaldo'}
  ];
  const tabs=$('#tabs');
  PANELS.forEach(p=>{ const b=document.createElement('button'); b.className='tab'; b.textContent=p.label; b.dataset.key=p.key; tabs.appendChild(b); });
  function show(key){
    $$('#tabs .tab').forEach(b=>b.classList.toggle('active', b.dataset.key===key));
    PANELS.forEach(p=>{ const el=$(`#panel-${p.key}`); if(el) el.hidden=(p.key!==key); });
    if(key==='resumen'){ renderResumen(); drawCharts(); }
    if(key==='registrar'){ renderTxTable(); fillSelectors(); }
    if(key==='deudas'){ renderDebts(); }
    if(key==='categorias'){ renderLists(); }
  }
  tabs.addEventListener('click', e=>{ const b=e.target.closest('button.tab'); if(!b) return; show(b.dataset.key); });
  show('resumen');

  // ==== Registrar Movimiento ====
  let currentType='Gasto';
  $('#type-expense') && $('#type-expense').addEventListener('click',()=>{currentType='Gasto'; $('#chosenType').textContent='Tipo: Gasto'});
  $('#type-income') && $('#type-income').addEventListener('click',()=>{currentType='Ingreso'; $('#chosenType').textContent='Tipo: Ingreso'});
  $('#txDate') && ( $('#txDate').value = todayStr() );

  function fillSelectors(){
    const cat=$('#txCategory'); const method=$('#txMethod');
    if(!cat || !method) return;
    cat.innerHTML=''; method.innerHTML='';
    state.categories.forEach(c=>{ const o=document.createElement('option'); o.textContent=c; cat.appendChild(o); });
    state.methods.forEach(m=>{ const o=document.createElement('option'); o.textContent=m; method.appendChild(o); });
  }
  fillSelectors();

  function clearForm(){ if($('#txAmount')) $('#txAmount').value=''; if($('#txDesc')) $('#txDesc').value=''; if($('#txNote')) $('#txNote').value=''; if($('#txDate')) $('#txDate').value=todayStr(); }
  $('#clearTx') && $('#clearTx').addEventListener('click', clearForm);

  function addTx(){
    const t={
      id: uid(),
      date: normalizeDate($('#txDate')?.value || todayStr()),
      type: currentType,
      description: ($('#txDesc')?.value||'').trim() || (currentType==='Gasto'?'Gasto':'Ingreso'),
      category: $('#txCategory')?.value || 'Otros',
      method: $('#txMethod')?.value || 'Efectivo',
      amount: Number($('#txAmount')?.value||0),
      note: ($('#txNote')?.value||'').trim()
    };
    if(!(t.amount>0)){ alert('Ingresa un monto mayor a 0'); return; }
    state.transactions.unshift(t); save(); renderTxTable(); clearForm(); renderResumen(); drawCharts();
  }
  $('#saveTx') && $('#saveTx').addEventListener('click', addTx);
  document.addEventListener('keydown', (e)=>{
    if(e.key==='/' || (e.ctrlKey && e.key.toLowerCase()==='k')){ e.preventDefault(); $('#search')?.focus(); }
    if(e.key==='Enter' && !e.shiftKey){
      const active = document.activeElement?.tagName?.toLowerCase();
      if(['input','select','textarea','button'].includes(active)) { e.preventDefault(); if($('#panel-registrar') && !$('#panel-registrar').hidden) addTx(); }
    }
  });

  // ==== Tabla Movimientos con edición en línea ====
  function renderTxTable(){
    if(!$('#txTable')) return;
    const q = $('#search')?.value?.toLowerCase()||'';
    const ty = $('#filterType')?.value||'all';
    const m  = $('#filterMonth')?.value; // yyyy-mm
    let rows = [...state.transactions];
    if(q){ rows = rows.filter(r=> `${r.description} ${r.category} ${r.method}`.toLowerCase().includes(q)); }
    if(ty!=='all'){ rows=rows.filter(r=>r.type===ty); }
    if(m){ rows=rows.filter(r=> r.date?.startsWith(m)); }

    let html = `<tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Método</th><th class='right'>Monto</th><th></th></tr>`;
    rows.forEach(r=>{
      const sign = r.type==='Gasto'?-1:1;
      html += `<tr data-id="${r.id}">
        <td data-k="date">${escapeHtml(r.date)}</td>
        <td data-k="type"><span class="pill">${escapeHtml(r.type)}</span></td>
        <td data-k="description">${escapeHtml(r.description)}</td>
        <td data-k="category">${escapeHtml(r.category)}</td>
        <td data-k="method">${escapeHtml(r.method)}</td>
        <td data-k="amount" class='right mono ${sign<0?'bad':'ok'}'>${fmtMoney(sign*r.amount)}</td>
        <td class='right'>
          <button class='ghost editTx'>Editar</button>
          <button class='ghost delTx'>Eliminar</button>
        </td>
      </tr>`
    })
    $('#txTable').innerHTML=html;
  }
  $('#search') && $('#search').addEventListener('input', renderTxTable);
  $('#filterType') && $('#filterType').addEventListener('change', renderTxTable);
  $('#filterMonth') && $('#filterMonth').addEventListener('change', renderTxTable);
  $('#resetFilters') && $('#resetFilters').addEventListener('click', ()=>{ if($('#search')) $('#search').value=''; if($('#filterType')) $('#filterType').value='all'; if($('#filterMonth')) $('#filterMonth').value=''; renderTxTable();});

  document.addEventListener('click', (e)=>{
    const del=e.target.closest?.('button.delTx');
    const edit=e.target.closest?.('button.editTx');
    const saveBtn=e.target.closest?.('button.saveTx');
    const cancelBtn=e.target.closest?.('button.cancelTx');

    if(del){
      const id=del.closest('tr').dataset.id; state.transactions = state.transactions.filter(t=>t.id!==id); save(); renderTxTable(); renderResumen(); drawCharts();
      return;
    }
    if(edit){
      const tr=edit.closest('tr');
      const id=tr.dataset.id;
      const get = (k)=> tr.querySelector(`[data-k="${k}"]`);
      const obj = state.transactions.find(t=>t.id===id);
      get('date').innerHTML = `<input type="date" value="${escapeHtml(obj.date)}">`;
      get('type').innerHTML = `<select><option ${obj.type==='Gasto'?'selected':''}>Gasto</option><option ${obj.type==='Ingreso'?'selected':''}>Ingreso</option></select>`;
      get('description').innerHTML = `<input value="${escapeHtml(obj.description)}">`;
      get('category').innerHTML = `<input value="${escapeHtml(obj.category)}">`;
      get('method').innerHTML = `<input value="${escapeHtml(obj.method)}">`;
      get('amount').innerHTML = `<input type="number" value="${obj.amount}">`;
      edit.outerHTML = `<button class='ghost saveTx'>Guardar</button><button class='ghost cancelTx'>Cancelar</button>`;
      return;
    }
    if(saveBtn){
      const tr=saveBtn.closest('tr'); const id=tr.dataset.id;
      const cells = (k)=> tr.querySelector(`[data-k="${k}"] input, [data-k="${k}"] select`).value;
      const obj = state.transactions.find(t=>t.id===id);
      obj.date = normalizeDate(cells('date') || obj.date);
      obj.type = cells('type') || obj.type;
      obj.description = cells('description') || obj.description;
      obj.category = cells('category') || obj.category;
      obj.method = cells('method') || obj.method;
      obj.amount = Number(cells('amount'))||obj.amount;
      save(); renderTxTable(); renderResumen(); drawCharts();
      return;
    }
    if(cancelBtn){ renderTxTable(); return; }
  });

  // ==== Resumen ====
  function sumPeriod(start, end) {
    const tx = state.transactions.filter(t => {
      const d = parseLocalDate(t.date);
      return d >= start && d <= end;
    });
    const income  = tx.filter(t => t.type === 'Ingreso').reduce((a,b)=>a+b.amount,0);
    const expense = tx.filter(t => t.type === 'Gasto').reduce((a,b)=>a+b.amount,0);
    return { income, expense, balance: income - expense, list: tx };
  }
  function renderResumen(){
    if(!$('#mIncome')) return;
    const now=new Date();
    const m = sumPeriod(startOfMonth(now), endOfMonth(now));
    const w = sumPeriod(startOfWeek(now), endOfWeek(now));
    const t = sumPeriod(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0),
                        new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999));
    $('#mIncome').textContent=fmtMoney(m.income);
    $('#mExpense').textContent=fmtMoney(m.expense);
    $('#mBalance').textContent=fmtMoney(m.balance);
    $('#wIncome').textContent=fmtMoney(w.income);
    $('#wExpense').textContent=fmtMoney(w.expense);
    $('#wBalance').textContent=fmtMoney(w.balance);
    $('#tIncome').textContent=fmtMoney(t.income);
    $('#tExpense').textContent=fmtMoney(t.expense);
    $('#tBalance').textContent=fmtMoney(t.balance);

    const min = state.debts.reduce((a,b)=>a+(Number(b.min)||0),0);
    $('#minDebt').textContent=fmtMoney(min);
  }

  // ==== Charts ====
  function makeCanvas(id){
    const canvas=$(id); if(!canvas) return null;
    const parent=canvas.parentElement;
    const dpr = window.devicePixelRatio||1;
    const w = parent.clientWidth; const h = 260;
    canvas.width = Math.floor(w*dpr);
    canvas.height = Math.floor(h*dpr);
    canvas.style.width = w+'px'; canvas.style.height = h+'px';
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    return {ctx,w,h};
  }
  function drawBars(ctx, w, h, values, labels, color){
    const padX = 30, padTop=18, padBottom=28;
    const chartH = h - padTop - padBottom;
    const bw = Math.min(90, (w - padX*2) / (values.length||1) * 0.6);
    const gap = (w - padX*2 - bw*(values.length||1)) / ((values.length||1)+1);
    const max = Math.max(1, Math.max(...values));
    ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    ctx.textBaseline='bottom';
    ctx.strokeStyle='rgba(148,163,184,.25)';
    ctx.beginPath(); ctx.moveTo(padX, h-padBottom); ctx.lineTo(w-padX, h-padBottom); ctx.stroke();

    values.forEach((v,i)=>{
      const x = padX + gap*(i+1) + bw*i;
      const bh = Math.round(chartH * (v/max));
      const y = h-padBottom - bh;
      ctx.fillStyle = color;
      ctx.fillRect(x,y,bw,bh);
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign='center';
      ctx.fillText(`COP $${v.toLocaleString('es-CO')}`, x+bw/2, y-2);
      ctx.textAlign='start';
      ctx.fillText(labels[i], x, h-10);
    });
  }
  function drawCharts(){
    const now=new Date();
    const m = sumPeriod(startOfMonth(now), endOfMonth(now));
    (function(){
      const o=makeCanvas('#chartInOut'); if(!o) return;
      const {ctx,w,h}=o; drawBars(ctx,w,h,[m.income,m.expense],['Ingresos','Gastos'],'#ef4444');
    })();
    (function(){
      const o=makeCanvas('#chartByCat'); if(!o) return;
      const byCat={}; const mlist = m.list;
      mlist.filter(x=>x.type==='Gasto').forEach(x=>{ byCat[x.category]=(byCat[x.category]||0)+x.amount; });
      const entries = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,6);
      const vals = entries.map(x=>x[1]); const labs = entries.map(x=>x[0]||'—');
      drawBars(o.ctx,o.w,o.h, vals.length?vals:[0], vals.length?labs:['—'], '#3b82f6');
    })();
  }

  // ==== Deudas ====
  const clearDebt=()=>{ if($('#dbCreditor')) $('#dbCreditor').value=''; if($('#dbType')) $('#dbType').value='TC'; if($('#dbAmount')) $('#dbAmount').value=''; if($('#dbAnnual')) $('#dbAnnual').value=''; if($('#dbMin')) $('#dbMin').value=''; if($('#dbCut')) $('#dbCut').value=''; };
  $('#clearDebt') && $('#clearDebt').addEventListener('click', clearDebt);
  $('#saveDebt') && $('#saveDebt').addEventListener('click', ()=>{
    const d={id:uid(), creditor:($('#dbCreditor')?.value||'').trim(), type:$('#dbType')?.value,
      amount:Number($('#dbAmount')?.value||0), annual:Number($('#dbAnnual')?.value||0),
      min:Number($('#dbMin')?.value||0), cut:$('#dbCut')?.value||''};
    if(!d.creditor){ alert('Ingresa el acreedor'); return; }
    state.debts.unshift(d); save(); renderDebts(); clearDebt(); renderResumen();
  });
  document.addEventListener('click', (e)=>{
    const b=e.target.closest?.('button.delDebt'); if(!b) return;
    const id=b.dataset.id; state.debts=state.debts.filter(d=>d.id!==id); save(); renderDebts(); renderResumen();
  });
  function renderDebts(){
    if(!$('#dbTable')) return;
    let html = `<tr><th>Acreedor</th><th>Tipo</th><th class='right'>Adeudado</th><th class='right'>Tasa anual</th><th class='right'>Mínimo/mes</th><th>Corte</th><th></th></tr>`;
    state.debts.forEach(d=>{
      html += `<tr>
        <td>${escapeHtml(d.creditor)}</td>
        <td>${escapeHtml(d.type)}</td>
        <td class='right mono'>${fmtMoney(d.amount||0)}</td>
        <td class='right mono'>${(d.annual||0).toLocaleString('es-CO',{maximumFractionDigits:2})}%</td>
        <td class='right mono'>${fmtMoney(d.min||0)}</td>
        <td>${escapeHtml(d.cut||'')}</td>
        <td class='right'><button class='ghost delDebt' data-id='${d.id}'>Eliminar</button></td>
      </tr>`
    })
    $('#dbTable').innerHTML=html;
  }

  // ==== Categorías & Métodos ====
  function renderLists(){
    if(!$('#catList')) return;
    const c = state.categories.map((x,i)=>`<span class='pill tag' data-i='${i}'>${escapeHtml(x)} <button title='Eliminar' data-i='${i}' class='ghost' style='padding:2px 6px;margin-left:6px'>×</button></span>`).join('');
    $('#catList').innerHTML = c || '<span class="muted">Sin categorías</span>';
    const m = state.methods.map((x,i)=>`<span class='pill tag' data-i='${i}'>${escapeHtml(x)} <button title='Eliminar' data-i='${i}' class='ghost' style='padding:2px 6px;margin-left:6px'>×</button></span>`).join('');
    $('#methodList').innerHTML = m || '<span class="muted">Sin métodos</span>';
    if($('#savePct')) $('#savePct').value = Number(state.savePercent||0);
  }
  $('#addCat') && $('#addCat').addEventListener('click', ()=>{ const v=$('#newCat')?.value.trim(); if(!v) return; if(!state.categories.includes(v)) state.categories.push(v); if($('#newCat')) $('#newCat').value=''; save(); renderLists(); fillSelectors(); });
  $('#addMethod') && $('#addMethod').addEventListener('click', ()=>{ const v=$('#newMethod')?.value.trim(); if(!v) return; if(!state.methods.includes(v)) state.methods.push(v); if($('#newMethod')) $('#newMethod').value=''; save(); renderLists(); fillSelectors(); });
  $('#catList') && $('#catList').addEventListener('click', (e)=>{ const b=e.target.closest('button'); if(!b) return; const i=Number(b.dataset.i); state.categories.splice(i,1); save(); renderLists(); fillSelectors(); });
  $('#methodList') && $('#methodList').addEventListener('click', (e)=>{ const b=e.target.closest('button'); if(!b) return; const i=Number(b.dataset.i); state.methods.splice(i,1); save(); renderLists(); fillSelectors(); });
  $('#saveSettings') && $('#saveSettings').addEventListener('click', ()=>{ const p = Number($('#savePct')?.value||0); state.savePercent = Math.max(0, Math.min(100,p)); save(); renderResumen(); alert('Ajustes guardados'); });

  // ==== Export / Import ====
  function download(filename, text){
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text], {type:'application/octet-stream'})); a.download=filename; a.click(); URL.revokeObjectURL(a.href);
  }
  $('#exportJSON') && $('#exportJSON').addEventListener('click', ()=>{
    download(`finapp_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(state, null, 2));
  });
  $('#exportCSV') && $('#exportCSV').addEventListener('click', ()=>{
    const hdr=['date','type','description','category','method','amount','note'];
    const rows = [hdr.join(',')].concat(state.transactions.map(t=> hdr.map(k=>`"${String(t[k]??'').replace(/"/g,'""')}"`).join(',')));
    download(`movimientos_${new Date().toISOString().slice(0,10)}.csv`, rows.join('\n'));
  });
  function parseCSV(text){
    const sep = text.indexOf(';')>-1?';':',';
    const lines = text.split(/\r?\n/).filter(Boolean);
    const headers = lines.shift().split(sep).map(h=>h.trim().replace(/^"|"$|^\uFEFF/g,''));
    return lines.map(line=>{
      const cells=[]; let cur=''; let q=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(ch==='"'){ q=!q; continue; }
        if(ch===sep && !q){ cells.push(cur); cur=''; continue; }
        cur+=ch;
      }
      cells.push(cur);
      const obj={}; headers.forEach((h,i)=>obj[h]= (cells[i]||'').trim());
      return obj;
    });
  }
  $('#importBtn') && $('#importBtn').addEventListener('click', ()=>{
    const f=$('#importFile')?.files[0]; if(!f) { alert('Elige un archivo .json o .csv'); return; }
    const reader=new FileReader(); reader.onload=(e)=>{
      try{
        if(f.name.toLowerCase().endsWith('.json')){
          const obj=JSON.parse(e.target.result);
          if(!obj.transactions) throw new Error('JSON inválido');
          state=obj; save(); show('resumen'); alert('Importación JSON completada');
        } else {
          const arr=parseCSV(e.target.result);
          const map=(row)=>({
            id:uid(),
            date: normalizeDate(row['Fecha']||row['fecha']||row['date']||row['Date']),
            type: (row['Tipo']||row['type']||row['Type']||'Gasto').toString().toLowerCase().includes('ing')?'Ingreso':'Gasto',
            description: row['Descripción']||row['descripcion']||row['Description']||row['desc']||'',
            category: row['Categoría']||row['categoria']||row['Category']||'Otros',
            method: row['Método de pago']||row['Metodo']||row['method']||'Efectivo',
            amount: Number(String(row['Monto']||row['amount']||'0').replace(/[^0-9.]/g,''))||0,
            note: row['Nota']||row['note']||''
          });
          const tx = arr.map(map).filter(x=>x.amount>0);
          state.transactions = tx.concat(state.transactions);
          save(); show('registrar'); alert(`Importadas ${tx.length} filas de CSV`);
        }
      }catch(err){ alert('No se pudo importar: '+err.message); }
    };
    reader.readAsText(f);
  });
  $('#resetAll') && $('#resetAll').addEventListener('click', ()=>{
    if(confirm('Esto borrará todos tus datos de este navegador. ¿Continuar?')){
      localStorage.removeItem('finapp_data'); state=load(); save(); show('resumen'); drawCharts();
    }
  });

  // ==== PWA & updates ====
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('sw.js').then(reg=>{
        function listenForWaiting(){
          if(!reg) return;
          if(reg.waiting){ showUpdateBanner(reg); return; }
          reg.addEventListener('updatefound', ()=>{
            const sw=reg.installing; if(!sw) return;
            sw.addEventListener('statechange', ()=>{ if(sw.state==='installed' && reg.waiting){ showUpdateBanner(reg); } });
          });
        }
        listenForWaiting();
        setInterval(()=>reg.update(), 60000);
      }).catch(()=>{});
    });
  }
  function showUpdateBanner(reg){
    const b = $('#updateBanner'); if(!b) return;
    b.style.display='flex';
    $('#updateReload').onclick = ()=>{
      reg.waiting?.postMessage({type:'SKIP_WAITING'});
      reg.waiting?.addEventListener('statechange', (e)=>{ if(e.target.state==='activated'){ location.reload(); } });
    };
    $('#updateClose').onclick = ()=> b.style.display='none';
  }
})();