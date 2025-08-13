(function(){
  'use strict';

  // === Utils ===
  const $=sel=>document.querySelector(sel);
  const $$=sel=>Array.from(document.querySelectorAll(sel));
  const fmtMoney=(n)=>{
    const sign = n<0?"-":"";
    const v = Math.abs(n||0);
    return `${sign}COP $${v.toLocaleString('es-CO',{maximumFractionDigits:0})}`;
  };
  const todayStr=()=>{
    const d=new Date();
    const tz = new Date(d.getTime()-d.getTimezoneOffset()*60000);
    return tz.toISOString().slice(0,10);
  };
  const startOfMonth=(d)=> new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
  const endOfMonth=(d)=> new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
  const startOfWeek=(d)=>{ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; };
  const endOfWeek=(d)=>{const s=startOfWeek(d); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return e;};
  const dayStart=(d)=> new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
  const dayEnd=(d)=> new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999);
  const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
  const escapeHtml=(s)=> (s==null?'':String(s)).replace(/[&<>\"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];});

  // Convierte "YYYY-MM-DD" a Date en zona local
  function parseLocalDate(s) {
    if (!s) return new Date();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return new Date(+m[1], +m[2]-1, +m[3], 12, 0, 0, 0);
    return new Date(s);
  }

  // Normaliza fechas de CSV a YYYY-MM-DD (acepta dd/mm/yyyy, mm/dd/yyyy, y serial Excel)
  function normalizeDateStr(s){
    if(!s) return todayStr();
    s = String(s).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/.exec(s);
    if(m){
      let a = parseInt(m[1],10), b=parseInt(m[2],10), y=parseInt(m[3],10);
      let mm = (a>12)? b : a;
      let dd = (a>12)? a : b;
      return `${y}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
    }
    const n = Number(s);
    if(!isNaN(n) && n>25569 && n<60000){ // Excel serial
      const d0 = new Date(Date.UTC(1899,11,30)); // Excel bug base
      d0.setUTCDate(d0.getUTCDate()+n);
      const yyyy=d0.getUTCFullYear(), mm=String(d0.getUTCMonth()+1).padStart(2,'0'), dd=String(d0.getUTCDate()).padStart(2,'0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return todayStr();
  }

  // === State ===
  const DEFAULTS={
    categories:["Fijos","Necesarios","Transporte","Alimentación","Salud","Educación","Ocio","Servicios","Otros","Sueldo","Honorarios","Comida","Banco de occidente"],
    methods:["Efectivo","Nequi","Bancolombia","Daviplata","Tarjeta Crédito","Tarjeta Débito","Banco de occidente"],
    savePercent:20,
    transactions:[],
    debts:[]
  };
  function load(){ try{ return JSON.parse(localStorage.getItem('finapp_data')) || DEFAULTS }catch(e){ return DEFAULTS } }
  function save(){ localStorage.setItem('finapp_data', JSON.stringify(state)); }
  let state = load();

  // === Theme ===
  const themeBtns = $$('button.tab[data-theme]');
  const applyTheme = (mode)=>{
    if(mode==='auto'){ document.documentElement.removeAttribute('data-theme'); }
    else if(mode==='dark'){ document.documentElement.setAttribute('data-theme','dark'); }
    else{ document.documentElement.setAttribute('data-theme','light'); }
    localStorage.setItem('finapp_theme', mode);
    themeBtns.forEach(b=>b.classList.toggle('active', b.dataset.theme===mode));
  };
  themeBtns.forEach(b=>b.addEventListener('click', ()=>applyTheme(b.dataset.theme)));
  applyTheme(localStorage.getItem('finapp_theme')||'auto');

  // Online pill
  const onlinePill = $('#onlinePill');
  const setOnline=()=> onlinePill.textContent = (navigator.onLine?'• Online':'○ Offline');
  window.addEventListener('online', setOnline); window.addEventListener('offline', setOnline); setOnline();

  // === Navigation ===
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
    PANELS.forEach(p=>{ const el=$(`#panel-${p.key}`); if(el) el.hidden = (p.key!==key); });
    if(key==='resumen'){ renderResumen(); drawCharts(); }
    if(key==='registrar'){ renderTxTable(); fillSelectors(); }
    if(key==='deudas'){ renderDebts(); }
    if(key==='categorias'){ renderLists(); }
  }
  tabs.addEventListener('click', e=>{ const b=e.target.closest('button.tab'); if(!b) return; show(b.dataset.key); });
  show('resumen');

  // === Registrar Movimiento ===
  let currentType='Gasto';
  $('#type-expense').addEventListener('click',()=>{currentType='Gasto'; $('#chosenType').textContent='Tipo: Gasto'});
  $('#type-income').addEventListener('click',()=>{currentType='Ingreso'; $('#chosenType').textContent='Tipo: Ingreso'});
  $('#txDate').value = todayStr();

  function fillSelectors(){
    const cat=$('#txCategory'); const method=$('#txMethod');
    cat.innerHTML=''; method.innerHTML='';
    state.categories.forEach(c=>{ const o=document.createElement('option'); o.textContent=c; cat.appendChild(o); });
    state.methods.forEach(m=>{ const o=document.createElement('option'); o.textContent=m; method.appendChild(o); });
  }
  fillSelectors();

  function clearForm(){ $('#txAmount').value=''; $('#txDesc').value=''; $('#txNote').value=''; $('#txDate').value=todayStr(); }
  $('#clearTx').addEventListener('click', clearForm);

  function addTx(){
    const t={
      id: uid(),
      date: $('#txDate').value || todayStr(),
      type: currentType,
      description: $('#txDesc').value.trim()|| (currentType==='Gasto'?'Gasto':'Ingreso'),
      category: $('#txCategory').value,
      method: $('#txMethod').value,
      amount: Number($('#txAmount').value||0),
      note: $('#txNote').value.trim()
    };
    if(!(t.amount>0)){ alert('Ingresa un monto mayor a 0'); return; }
    state.transactions.unshift(t); save(); renderTxTable(); clearForm(); renderResumen(); drawCharts();
  }
  $('#saveTx').addEventListener('click', addTx);
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' && !e.shiftKey){
      const tag = (document.activeElement?.tagName||'').toLowerCase();
      if(['input','select','textarea','button'].includes(tag)) { e.preventDefault(); addTx(); }
    }
  });

  // === Tabla Movimientos con edición en línea ===
  function renderTxTable(){
    const q = $('#search').value?.toLowerCase()||'';
    const ty = $('#filterType').value||'all';
    const m  = $('#filterMonth').value;
    let rows = [...state.transactions];
    if(q){ rows = rows.filter(r=> `${r.description} ${r.category} ${r.method}`.toLowerCase().includes(q)); }
    if(ty!=='all'){ rows=rows.filter(r=>r.type===ty); }
    if(m){ rows=rows.filter(r=> r.date.startsWith(m)); }

    let html = `<tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Método</th><th class='right'>Monto</th><th></th></tr>`;
    rows.forEach(r=>{
      const sign = r.type==='Gasto'?-1:1;
      html += `<tr data-id="${r.id}">
        <td data-k="date">${escapeHtml(r.date)}</td>
        <td data-k="type"><span class="pill">${escapeHtml(r.type)}</span></td>
        <td data-k="description">${escapeHtml(r.description)}</td>
        <td data-k="category">${escapeHtml(r.category)}</td>
        <td data-k="method">${escapeHtml(r.method)}</td>
        <td data-k="amount" class='right mono' style="color:${sign<0?'var(--warn)':'var(--ok)'}">${fmtMoney(sign*r.amount)}</td>
        <td class='right'>
          <button class='ghost editTx'>Editar</button>
          <button class='ghost delTx'>Eliminar</button>
        </td>
      </tr>`
    })
    $('#txTable').innerHTML=html;
  }
  $('#search').addEventListener('input', renderTxTable);
  $('#filterType').addEventListener('change', renderTxTable);
  $('#filterMonth').addEventListener('change', renderTxTable);
  $('#resetFilters').addEventListener('click', ()=>{$('#search').value=''; $('#filterType').value='all'; $('#filterMonth').value=''; renderTxTable();});

  document.addEventListener('click', (e)=>{
    const del=e.target.closest('button.delTx');
    const edit=e.target.closest('button.editTx');
    const saveBtn=e.target.closest('button.saveTx');
    const cancelBtn=e.target.closest('button.cancelTx');

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
      obj.date = cells('date') || obj.date;
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

  // === Resumen ===
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
    const now=new Date();
    const m = sumPeriod(startOfMonth(now), endOfMonth(now));
    const w = sumPeriod(startOfWeek(now), endOfWeek(now));
    const t = sumPeriod(dayStart(now), dayEnd(now)); // <-- fix: fin del día
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
    if($('#minDebt')) $('#minDebt').textContent=fmtMoney(min);

    const goal = (state.savePercent/100)*(m.income||0);
    const current = Math.max(0, m.income - m.expense);
    $('#mSaveGoal').textContent=fmtMoney(goal);
    $('#mSaveNow').textContent=fmtMoney(current);
    const pct = goal? Math.min(100, Math.round(100*current/goal)) : 0;
    $('#mSaveBar').style.width = pct+'%';
  }

  // === Charts ===
  function makeCanvas(id){
    const canvas=$(id); const parent=canvas.parentElement;
    const dpr = window.devicePixelRatio||1;
    const w = parent.clientWidth; const h = parent.clientHeight;
    canvas.width = Math.floor(w*dpr);
    canvas.height = Math.floor(h*dpr);
    canvas.style.width = w+'px'; canvas.style.height = h+'px';
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    return {ctx,w,h};
  }
  function drawBars(ctx, w, h, values, labels, colors){
    const pad = 24;
    const avail = w - pad*2;
    const bw = Math.min(80, avail / values.length * 0.6);
    const gap = (avail - bw*values.length) / (values.length+1);
    const max = Math.max(1, Math.max(...values));
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textBaseline='bottom';
    values.forEach((v,i)=>{
      const x = pad + gap*(i+1) + bw*i;
      const bh = Math.round((h-60) * (v/max));
      const y = h-30 - bh;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x,y,bw,bh);
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign='center';
      ctx.fillText(`COP $${v.toLocaleString('es-CO')}`, x+bw/2, y-4);
      ctx.textAlign='left';
      ctx.fillText(labels[i], x, h-10);
    });
  }
  function drawCharts(){
    const now=new Date();
    const m = sumPeriod(startOfMonth(now), endOfMonth(now));
    // Ingreso vs Gasto (mes) — verde y rojo
    (function(){
      const {ctx,w,h}=makeCanvas('#chartInOut');
      drawBars(ctx,w,h,[m.income,m.expense],['Ingresos','Gastos'],['#22c55e','#ef4444']);
    })();
    // Por categoría (mes) — paleta variada
    (function(){
      const {ctx,w,h}=makeCanvas('#chartByCat');
      const byCat={}; const mlist = sumPeriod(startOfMonth(now), endOfMonth(now)).list;
      mlist.filter(x=>x.type==='Gasto').forEach(x=>{ byCat[x.category]=(byCat[x.category]||0)+x.amount; });
      const entries = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,6);
      const vals = entries.map(x=>x[1]); const labs = entries.map(x=>x[0]||'—');
      const palette=['#60a5fa','#a78bfa','#f59e0b','#10b981','#f43f5e','#f97316','#22d3ee'];
      drawBars(ctx,w,h, vals.length?vals:[0], vals.length?labs:['—'], palette);
    })();
  }

  // === Categorías & Métodos ===
  function renderLists(){
    const c = state.categories.map((x,i)=>`<span class='pill' data-i='${i}'>${escapeHtml(x)} <button title='Eliminar' data-i='${i}' class='ghost' style='padding:2px 6px;margin-left:6px'>×</button></span>`).join('');
    $('#catList').innerHTML = c || '<span class="muted">Sin categorías</span>';
    const m = state.methods.map((x,i)=>`<span class='pill' data-i='${i}'>${escapeHtml(x)} <button title='Eliminar' data-i='${i}' class='ghost' style='padding:2px 6px;margin-left:6px'>×</button></span>`).join('');
    $('#methodList').innerHTML = m || '<span class="muted">Sin métodos</span>';
    $('#savePct').value = Number(state.savePercent||0);
  }
  $('#addCat').addEventListener('click', ()=>{ const v=$('#newCat').value.trim(); if(!v) return; if(!state.categories.includes(v)) state.categories.push(v); $('#newCat').value=''; save(); renderLists(); fillSelectors(); });
  $('#addMethod').addEventListener('click', ()=>{ const v=$('#newMethod').value.trim(); if(!v) return; if(!state.methods.includes(v)) state.methods.push(v); $('#newMethod').value=''; save(); renderLists(); fillSelectors(); });
  $('#catList').addEventListener('click', (e)=>{ const b=e.target.closest('button'); if(!b) return; const i=Number(b.dataset.i); state.categories.splice(i,1); save(); renderLists(); fillSelectors(); });
  $('#methodList').addEventListener('click', (e)=>{ const b=e.target.closest('button'); if(!b) return; const i=Number(b.dataset.i); state.methods.splice(i,1); save(); renderLists(); fillSelectors(); });
  $('#saveSettings').addEventListener('click', ()=>{ const p = Number($('#savePct').value||0); state.savePercent = Math.max(0, Math.min(100,p)); save(); renderResumen(); alert('Ajustes guardados'); });

  // === Respaldo / Importar ===
  function download(filename, text){
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text], {type:'application/octet-stream'})); a.download=filename; a.click(); URL.revokeObjectURL(a.href);
  }
  $('#exportJSON').addEventListener('click', ()=>{
    download(`finapp_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(state, null, 2));
  });
  $('#exportCSV').addEventListener('click', ()=>{
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
  $('#importBtn').addEventListener('click', ()=>{
    const f=$('#importFile').files[0]; if(!f) { alert('Elige un archivo .json o .csv'); return; }
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
            date: normalizeDateStr(row['Fecha']||row['fecha']||row['date']||row['Date']|| todayStr()),
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
  $('#resetAll').addEventListener('click', ()=>{
    if(confirm('Esto borrará todos tus datos de este navegador. ¿Continuar?')){
      localStorage.removeItem('finapp_data'); state=load(); save(); show('resumen'); drawCharts();
    }
  });

  // === Deudas ===
  function clearDebt(){ $('#dbCreditor').value=''; $('#dbType').value='TC'; $('#dbAmount').value=''; $('#dbAnnual').value=''; $('#dbMin').value=''; $('#dbCut').value=''; }
  $('#clearDebt').addEventListener('click', clearDebt);
  function addDebt(){
    const d={ id:uid(), creditor:$('#dbCreditor').value.trim(), type:$('#dbType').value, amount:Number($('#dbAmount').value||0), annual:Number($('#dbAnnual').value||0), min:Number($('#dbMin').value||0), cut:$('#dbCut').value, note:'' };
    if(!d.creditor){ alert('Ingresa el acreedor'); return; }
    state.debts.unshift(d); save(); renderDebts(); clearDebt(); renderResumen();
  }
  $('#saveDebt').addEventListener('click', addDebt);
  document.addEventListener('click', (e)=>{
    const del=e.target.closest('button.delDebt'); if(!del) return;
    const id=del.dataset.id; state.debts=state.debts.filter(x=>x.id!==id); save(); renderDebts(); renderResumen();
  });
  function renderDebts(){
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
      </tr>`;
    });
    $('#dbTable').innerHTML=html;
  }

  // === PWA Registration + Update banner ===
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('sw.js').then(reg=>{
        function listenForWaiting(){
          if(!reg) return;
          if(reg.waiting){ showUpdateBanner(reg); return; }
          reg.addEventListener('updatefound', ()=>{
            const sw = reg.installing;
            if(!sw) return;
            sw.addEventListener('statechange', ()=>{ if(sw.state==='installed' && reg.waiting){ showUpdateBanner(reg); } });
          });
        }
        listenForWaiting();
        setInterval(()=>reg.update(), 60000);
      }).catch(()=>{});
    });
  }
  function showUpdateBanner(reg){
    const b = $('#updateBanner');
    b.style.display='flex';
    $('#updateReload').onclick = ()=>{
      reg.waiting?.postMessage({type:'SKIP_WAITING'});
      reg.waiting?.addEventListener('statechange', (e)=>{ if(e.target.state==='activated'){ location.reload(); } });
    };
    $('#updateClose').onclick = ()=> b.style.display='none';
  }

})();