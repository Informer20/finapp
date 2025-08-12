
(function(){
  // ==== Utilidades ====
  const $=sel=>document.querySelector(sel);
  const $$=sel=>Array.from(document.querySelectorAll(sel));
  const fmtMoney=(n)=>{
    const sign = n<0?"-":"";
    const v = Math.abs(n||0);
    return `${sign}$${v.toLocaleString('es-CO',{maximumFractionDigits:0})}`;
  };
  const todayStr=()=>{
    const d=new Date();
    const tz = new Date(d.getTime()-d.getTimezoneOffset()*60000); // local ISO date
    return tz.toISOString().slice(0,10);
  };
  const startOfMonth=(d)=> new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth=(d)=> new Date(d.getFullYear(), d.getMonth()+1, 0);
  const startOfWeek=(d)=>{
    const x=new Date(d); const day=(x.getDay()+6)%7; // Lunes=0
    x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x;
  }
  const endOfWeek=(d)=>{const s=startOfWeek(d); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return e;}

  function uid(){return Math.random().toString(36).slice(2)+Date.now().toString(36)}
  function parseCSV(text){
    // Simple CSV parser (comma/semicolon, quotes)
    const sep = text.indexOf(';')>-1?';':',';
    const lines = text.split(/\r?\n/).filter(Boolean);
    const headers = lines.shift().split(sep).map(h=>h.trim().replace(/^\"|\"$/g,''));
    return lines.map(line=>{
      const cells=[]; let cur=''; let q=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(ch=='"'){ q=!q; continue; }
        if(ch===sep && !q){ cells.push(cur); cur=''; continue; }
        cur+=ch;
      }
      cells.push(cur);
      const obj={}; headers.forEach((h,i)=>obj[h]= (cells[i]||'').trim());
      return obj;
    });
  }

  // ==== Estado ====
  const DEFAULTS={
    categories:["Fijos","Necesarios","Transporte","Alimentación","Salud","Educación","Ocio","Servicios","Otros","Sueldo","Honorarios"],
    methods:["Efectivo","Nequi","Bancolombia","Daviplata","Tarjeta Crédito","Tarjeta Débito"],
    savePercent:20,
    transactions:[],
    debts:[]
  };

  function load(){
    try{ return JSON.parse(localStorage.getItem('finapp_data')) || DEFAULTS }catch(e){ return DEFAULTS }
  }
  function save(){ localStorage.setItem('finapp_data', JSON.stringify(state)); }

  let state = load();

  // ==== Navegación ====
  const PANELS=[
    {key:'resumen', label:'Resumen'},
    {key:'registrar', label:'Registrar'},
    {key:'deudas', label:'Deudas'},
    {key:'categorias', label:'Categorías'},
    {key:'respaldo', label:'Respaldo'}
  ];
  const tabs = $('#tabs');
  PANELS.forEach(p=>{
    const b=document.createElement('button'); b.className='tab'; b.textContent=p.label; b.dataset.key=p.key; tabs.appendChild(b);
  });
  function show(key){
    $$('#tabs .tab').forEach(b=>b.classList.toggle('active', b.dataset.key===key));
    PANELS.forEach(p=>{
      const el=$(`#panel-${p.key}`); if(!el) return; el.hidden = (p.key!==key);
    })
    if(key==='resumen') renderResumen();
    if(key==='registrar') { renderTxTable(); fillSelectors(); }
    if(key==='deudas') renderDebts();
    if(key==='categorias') renderLists();
  }
  tabs.addEventListener('click', (e)=>{
    const btn=e.target.closest('button.tab'); if(!btn) return; show(btn.dataset.key);
  });

  // Arranque
  show('resumen');

  // ==== Registrar Movimiento ====
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
    state.transactions.unshift(t); save(); renderTxTable(); clearForm(); renderResumen();
  }
  $('#saveTx').addEventListener('click', addTx);
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' && !e.shiftKey){
      const active = document.activeElement.tagName.toLowerCase();
      if(['input','select','textarea','button'].includes(active)) { e.preventDefault(); addTx(); }
    }
  });

  // ==== Tabla Movimientos ====
  function renderTxTable(){
    const q = $('#search').value?.toLowerCase()||'';
    const ty = $('#filterType').value||'all';
    const m  = $('#filterMonth').value; // yyyy-mm
    let rows = [...state.transactions];
    if(q){ rows = rows.filter(r=> `${r.description} ${r.category} ${r.method}`.toLowerCase().includes(q)); }
    if(ty!=='all'){ rows=rows.filter(r=>r.type===ty); }
    if(m){ rows=rows.filter(r=> r.date.startsWith(m)); }

    let html = `<tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Método</th><th class='right'>Monto</th><th></th></tr>`;
    rows.forEach(r=>{
      const sign = r.type==='Gasto'?-1:1;
      html += `<tr>
        <td>${r.date}</td>
        <td><span class="pill">${r.type}</span></td>
        <td>${escapeHtml(r.description)}</td>
        <td>${escapeHtml(r.category)}</td>
        <td>${escapeHtml(r.method)}</td>
        <td class='right mono ${sign<0?'bad':'ok'}'>${fmtMoney(sign*r.amount)}</td>
        <td class='right'><button data-id='${r.id}' class='ghost delTx'>Eliminar</button></td>
      </tr>`
    })
    $('#txTable').innerHTML=html;
  }
  $('#search').addEventListener('input', renderTxTable);
  $('#filterType').addEventListener('change', renderTxTable);
  $('#filterMonth').addEventListener('change', renderTxTable);
  $('#resetFilters').addEventListener('click', ()=>{$('#search').value=''; $('#filterType').value='all'; $('#filterMonth').value=''; renderTxTable();});
  document.addEventListener('click', (e)=>{
    const btn=e.target.closest('button.delTx'); if(!btn) return;
    const id=btn.dataset.id; state.transactions = state.transactions.filter(t=>t.id!==id); save(); renderTxTable(); renderResumen();
  })

  function escapeHtml(s){return s?.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))||''}

  // ==== Resumen ====
  function sumPeriod(start,end){
    const tx = state.transactions.filter(t=>{ const d=new Date(t.date); return d>=start && d<=end; });
    const income = tx.filter(t=>t.type==='Ingreso').reduce((a,b)=>a+b.amount,0);
    const expense = tx.filter(t=>t.type==='Gasto').reduce((a,b)=>a+b.amount,0);
    return {income, expense, balance: income-expense, list: tx};
  }
  function renderResumen(){
    const now=new Date();
    const m = sumPeriod(startOfMonth(now), endOfMonth(now));
    const w = sumPeriod(startOfWeek(now), endOfWeek(now));
    const t = sumPeriod(new Date(now.toDateString()), new Date(now.toDateString()));
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

    // ahorro sugerido mensual
    const goal = (state.savePercent/100)*(m.income||0);
    const current = Math.max(0, m.income - m.expense);
    $('#mSaveGoal').textContent=fmtMoney(goal);
    $('#mSaveNow').textContent=fmtMoney(current);
    const pct = goal? Math.min(100, Math.round(100*current/goal)) : 0;
    $('#mSaveBar').style.width = pct+'%';

    // top categorías semana
    const byCat = {};
    w.list.filter(x=>x.type==='Gasto').forEach(x=>{ byCat[x.category]=(byCat[x.category]||0)+x.amount });
    const items = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,5);
    $('#wCats').innerHTML = items.length? items.map(([c,v])=>`<div class='row'><span class='pill'>${escapeHtml(c)}</span><strong class='mono bad'>${fmtMoney(v)}</strong></div>`).join('') : '<span class="muted">Sin datos</span>';

    // gastos por categoría (mes)
    const byCatM={};
    m.list.filter(x=>x.type==='Gasto').forEach(x=>{ byCatM[x.category]=(byCatM[x.category]||0)+x.amount });
    const totalG = m.expense||1;
    const budget = Number($('#budgetInput').dataset.applied||0) || 0; // presupuesto global opcional
    const html = Object.entries(byCatM).sort((a,b)=>b[1]-a[1]).map(([c,v])=>{
      const p = Math.round(100*v/totalG);
      const b = budget? Math.min(100, Math.round(100*v/budget)) : p;
      return `<div class='row' style='justify-content:space-between;margin:6px 0'>
        <div class='row' style='gap:8px'><span class='pill'>${escapeHtml(c)}</span> <span class='muted'>${p}% del gasto</span></div>
        <strong class='mono bad'>${fmtMoney(v)}</strong>
      </div>
      <div class='bar' title='Participación mensual'>
        <em style='width:${p}%'></em>
      </div>`
    }).join('') || '<span class="muted">Sin datos</span>';
    $('#catsBreak').innerHTML=html;
  }
  $('#applyBudget').addEventListener('click',()=>{
    const v=Number($('#budgetInput').value||0); $('#budgetInput').dataset.applied=v; renderResumen();
  })

  // ==== Deudas ====
  function clearDebt(){ $('#dbCreditor').value=''; $('#dbType').value='TC'; $('#dbAmount').value=''; $('#dbAnnual').value=''; $('#dbMin').value=''; $('#dbCut').value=''; }
  $('#clearDebt').addEventListener('click', clearDebt);
  function addDebt(){
    const d={id:uid(), creditor:$('#dbCreditor').value.trim(), type:$('#dbType').value, amount:Number($('#dbAmount').value||0), annual:Number($('#dbAnnual').value||0), min:Number($('#dbMin').value||0), cut:$('#dbCut').value, note:''};
    if(!d.creditor){ alert('Ingresa el acreedor'); return; }
    state.debts.unshift(d); save(); renderDebts(); clearDebt(); renderResumen();
  }
  $('#saveDebt').addEventListener('click', addDebt);
  document.addEventListener('click', (e)=>{
    const btn=e.target.closest('button.delDebt'); if(!btn) return; const id=btn.dataset.id; state.debts=state.debts.filter(d=>d.id!==id); save(); renderDebts(); renderResumen();
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
        <td>${d.cut||''}</td>
        <td class='right'><button class='ghost delDebt' data-id='${d.id}'>Eliminar</button></td>
      </tr>`
    })
    $('#dbTable').innerHTML=html;
  }

  // ==== Categorías & Métodos ====
  function renderLists(){
    // categorías
    const c = state.categories.map((x,i)=>`<span class='tag pill' data-i='${i}'>${escapeHtml(x)} <button title='Eliminar' data-i='${i}' class='ghost' style='padding:2px 6px;margin-left:6px'>×</button></span>`).join('');
    $('#catList').innerHTML = c || '<span class="muted">Sin categorías</span>';
    // métodos
    const m = state.methods.map((x,i)=>`<span class='tag pill' data-i='${i}'>${escapeHtml(x)} <button title='Eliminar' data-i='${i}' class='ghost' style='padding:2px 6px;margin-left:6px'>×</button></span>`).join('');
    $('#methodList').innerHTML = m || '<span class="muted">Sin métodos</span>';
    // ahorro sugerido
    $('#savePct').value = Number(state.savePercent||0);
  }
  $('#addCat').addEventListener('click', ()=>{ const v=$('#newCat').value.trim(); if(!v) return; if(!state.categories.includes(v)) state.categories.push(v); $('#newCat').value=''; save(); renderLists(); fillSelectors(); });
  $('#addMethod').addEventListener('click', ()=>{ const v=$('#newMethod').value.trim(); if(!v) return; if(!state.methods.includes(v)) state.methods.push(v); $('#newMethod').value=''; save(); renderLists(); fillSelectors(); });
  $('#catList').addEventListener('click', (e)=>{ const b=e.target.closest('button'); if(!b) return; const i=Number(b.dataset.i); state.categories.splice(i,1); save(); renderLists(); fillSelectors(); });
  $('#methodList').addEventListener('click', (e)=>{ const b=e.target.closest('button'); if(!b) return; const i=Number(b.dataset.i); state.methods.splice(i,1); save(); renderLists(); fillSelectors(); });
  $('#saveSettings').addEventListener('click', ()=>{ const p = Number($('#savePct').value||0); state.savePercent = Math.max(0, Math.min(100,p)); save(); renderResumen(); alert('Ajustes guardados'); });

  // ==== Respaldo / Importar ====
  function download(filename, text){
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text], {type:'application/octet-stream'})); a.download=filename; a.click(); URL.revokeObjectURL(a.href);
  }
  $('#exportJSON').addEventListener('click', ()=>{
    download(`finapp_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(state, null, 2));
  });
  $('#exportCSV').addEventListener('click', ()=>{
    const hdr=['date','type','description','category','method','amount','note'];
    const rows = [hdr.join(',')].concat(state.transactions.map(t=> hdr.map(k=>`"${String(t[k]??'').replace(/"/g,'\"')}"`).join(',')));
    download(`movimientos_${new Date().toISOString().slice(0,10)}.csv`, rows.join('
'));
  });
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
          // intentamos mapear columnas típicas
          const map=(row, keys)=>({
            id:uid(),
            date: row['Fecha']||row['fecha']||row['date']||row['Date']|| todayStr(),
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
      localStorage.removeItem('finapp_data'); state=load(); save(); show('resumen');
    }
  });

})();
