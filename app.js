(function(){
  // ===== Utilidades base =====
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  function escapeHtml(s){
    if(s==null) return "";
    return String(s).replace(/[&<>"']/g, function(c){
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" })[c];
    });
  }
  const fmtMoney=(n,cur)=>{
    const sign = n<0?"-":"";
    const v=Math.abs(n||0);
    return `${sign}${cur} ${v.toLocaleString('es-CO',{maximumFractionDigits:0})}`;
  };
  const todayStr=()=>{
    const d=new Date(); const tz = new Date(d.getTime()-d.getTimezoneOffset()*60000);
    return tz.toISOString().slice(0,10);
  };
  const startOfMonth=d=>new Date(d.getFullYear(),d.getMonth(),1);
  const endOfMonth=d=>new Date(d.getFullYear(),d.getMonth()+1,0);
  const startOfWeek=d=>{const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x;};
  const endOfWeek=d=>{const s=startOfWeek(d); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return e;};
  const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);

  function parseCSV(text){
    const sep = text.indexOf(';')>-1?';':',';
    const lines = text.split(/\r?\n/).filter(Boolean);
    const headers = lines.shift().split(sep).map(h=>h.trim().replace(/^\"|\"$/g,''));
    return lines.map(line=>{
      const cells=[]; let cur=''; let q=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(ch==='"'){ q=!q; continue; }
        if(ch===sep && !q){ cells.push(cur); cur=''; continue; }
        cur+=ch;
      }
      cells.push(cur);
      const obj={}; headers.forEach((h,i)=>obj[h]=(cells[i]||'').trim());
      return obj;
    });
  }

  // ===== Estado =====
  const DEFAULTS={
    categories:["Fijos","Necesarios","Transporte","Alimentación","Salud","Educación","Ocio","Servicios","Otros","Sueldo","Honorarios","Comida","Banco de occidente"],
    methods:["Efectivo","Nequi","Bancolombia","Daviplata","Tarjeta Crédito","Tarjeta Débito","Banco de occidente"],
    savePercent:20, currency:"COP $", transactions:[], debts:[]
  };
  function load(){ try{return JSON.parse(localStorage.getItem('finapp_data'))||DEFAULTS}catch(e){return DEFAULTS}}
  function save(){ localStorage.setItem('finapp_data', JSON.stringify(state)); }
  let state=load();

  // ===== Tema (Auto/Dark/Light) =====
  const THEME_KEY='finapp_theme';
  function applyTheme(mode){
    const root=document.documentElement;
    if(mode==='auto'){ root.removeAttribute('data-theme'); }
    else{ root.setAttribute('data-theme', mode==='light'?'light':''); if(mode==='dark') root.removeAttribute('data-theme'); }
    localStorage.setItem(THEME_KEY, mode);
    $$('#themeSwitch button').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  }
  const pref=localStorage.getItem(THEME_KEY)||'auto'; applyTheme(pref);
  $('#themeSwitch').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b)return; applyTheme(b.dataset.mode)});

  // Online badge
  function setNet(){ $('#dot').style.background = navigator.onLine?'#10b981':'#ef4444'; $('#netState').textContent = navigator.onLine?'Online':'Offline'; }
  window.addEventListener('online',setNet); window.addEventListener('offline',setNet); setNet();

  // ===== Navegación =====
  const PANELS=[{key:'resumen',label:'Resumen'},{key:'registrar',label:'Registrar'},{key:'deudas',label:'Deudas'},{key:'categorias',label:'Categorías'},{key:'respaldo',label:'Respaldo'}];
  const tabs=$('#tabs'); PANELS.forEach(p=>{const b=document.createElement('button'); b.className='tab'; b.textContent=p.label; b.dataset.key=p.key; tabs.appendChild(b)});
  function show(key){ $$('#tabs .tab').forEach(b=>b.classList.toggle('active', b.dataset.key===key)); PANELS.forEach(p=>{const el=$('#panel-'+p.key); if(el) el.hidden=(p.key!==key);}); if(key==='resumen') renderResumen(); if(key==='registrar'){renderTxTable(); fillSelectors();} if(key==='deudas') renderDebts(); if(key==='categorias') renderLists(); }
  tabs.addEventListener('click', e=>{const btn=e.target.closest('button.tab'); if(!btn)return; show(btn.dataset.key)});
  show('resumen');

  // ===== Registrar Movimiento =====
  let currentType='Gasto';
  $('#type-expense').addEventListener('click',()=>{currentType='Gasto'; $('#chosenType').textContent='Tipo: Gasto'});
  $('#type-income').addEventListener('click',()=>{currentType='Ingreso'; $('#chosenType').textContent='Tipo: Ingreso'});
  $('#txDate').value = todayStr();

  function fillSelectors(){ const cat=$('#txCategory'); const method=$('#txMethod'); cat.innerHTML=''; method.innerHTML=''; state.categories.forEach(c=>{const o=document.createElement('option'); o.textContent=c; cat.appendChild(o)}); state.methods.forEach(m=>{const o=document.createElement('option'); o.textContent=m; method.appendChild(o)}); }
  fillSelectors();
  function clearForm(){ $('#txAmount').value=''; $('#txDesc').value=''; $('#txNote').value=''; $('#txDate').value=todayStr(); }
  $('#clearTx').addEventListener('click', clearForm);

  function addTx(){
    const t={id:uid(), date:$('#txDate').value||todayStr(), type:currentType, description:$('#txDesc').value.trim()||(currentType==='Gasto'?'Gasto':'Ingreso'), category:$('#txCategory').value, method:$('#txMethod').value, amount:Number($('#txAmount').value||0), note:$('#txNote').value.trim()};
    if(!(t.amount>0)){ alert('Ingresa un monto mayor a 0'); return; }
    state.transactions.unshift(t); save(); renderTxTable(); clearForm(); renderResumen();
  }
  $('#saveTx').addEventListener('click', addTx);
  document.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !e.shiftKey){ const a=document.activeElement.tagName.toLowerCase(); if(['input','select','textarea','button'].includes(a)){ e.preventDefault(); addTx(); } } });

  // ===== Tabla Movimientos + edición en línea =====
  function renderTxTable(){
    const q = $('#search').value?.toLowerCase()||''; const ty=$('#filterType').value||'all'; const m=$('#filterMonth').value;
    let rows=[...state.transactions];
    if(q){ rows=rows.filter(r=>`${r.description} ${r.category} ${r.method}`.toLowerCase().includes(q)); }
    if(ty!=='all'){ rows=rows.filter(r=>r.type===ty); }
    if(m){ rows=rows.filter(r=>r.date.startsWith(m)); }
    const cur = state.currency || 'COP $';
    let html = `<tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Método</th><th class='right'>Monto</th><th></th></tr>`;
    rows.forEach(r=>{
      const sign=r.type==='Gasto'?-1:1;
      html += `<tr data-id="${r.id}">
        <td>${r.date}</td>
        <td><span class="pill">${r.type}</span></td>
        <td>${escapeHtml(r.description)}</td>
        <td>${escapeHtml(r.category)}</td>
        <td>${escapeHtml(r.method)}</td>
        <td class="right mono ${sign<0?'bad':'ok'}">${fmtMoney(sign*r.amount, cur)}</td>
        <td class="right"><button data-id="${r.id}" class="ghost editTx">Editar</button> <button data-id="${r.id}" class="ghost delTx">Eliminar</button></td>
      </tr>`;
    });
    $('#txTable').innerHTML=html;
  }
  $('#search').addEventListener('input', renderTxTable);
  $('#filterType').addEventListener('change', renderTxTable);
  $('#filterMonth').addEventListener('change', renderTxTable);
  $('#resetFilters').addEventListener('click', ()=>{$('#search').value=''; $('#filterType').value='all'; $('#filterMonth').value=''; renderTxTable();});

  document.addEventListener('click', (e)=>{
    const del=e.target.closest('button.delTx'); if(del){ const id=del.dataset.id; state.transactions=state.transactions.filter(t=>t.id!==id); save(); renderTxTable(); renderResumen(); return;}
    const ed=e.target.closest('button.editTx'); if(ed){ const id=ed.dataset.id; startEdit(id); }
    const sav=e.target.closest('button.saveEdit'); if(sav){ const id=sav.dataset.id; finishEdit(id,true); }
    const can=e.target.closest('button.cancelEdit'); if(can){ const id=can.dataset.id; finishEdit(id,false); }
  });

  function startEdit(id){
    const tr=$(`#txTable tr[data-id="${id}"]`); if(!tr) return;
    const t=state.transactions.find(x=>x.id===id); if(!t) return;
    tr.innerHTML = `<td><input type="date" value="${t.date}"></td>
      <td><select><option ${t.type==='Gasto'?'selected':''}>Gasto</option><option ${t.type==='Ingreso'?'selected':''}>Ingreso</option></select></td>
      <td><input value="${escapeHtml(t.description)}"></td>
      <td><input value="${escapeHtml(t.category)}"></td>
      <td><input value="${escapeHtml(t.method)}"></td>
      <td class="right"><input type="number" value="${t.amount}" style="width:120px"></td>
      <td class="right"><button class="primary saveEdit" data-id="${id}">Guardar</button> <button class="ghost cancelEdit" data-id="${id}">Cancelar</button></td>`;
  }
  function finishEdit(id,commit){
    const idx=state.transactions.findIndex(x=>x.id===id); if(idx<0) return renderTxTable();
    if(commit){
      const tr=$(`#txTable tr[data-id="${id}"]`);
      const [d,ty,desc,cat,met,amt] = Array.from(tr.querySelectorAll('input,select')).map(x=>x.value);
      state.transactions[idx]={...state.transactions[idx], date:d, type:ty, description:desc, category:cat, method:met, amount:Number(amt||0)};
      save();
    }
    renderTxTable(); renderResumen();
  }

  // ===== Resumen + Gráficas =====
  function sumPeriod(start,end){
    const tx = state.transactions.filter(t=>{const d=new Date(t.date); return d>=start && d<=end;});
    const income = tx.filter(t=>t.type==='Ingreso').reduce((a,b)=>a+b.amount,0);
    const expense = tx.filter(t=>t.type==='Gasto').reduce((a,b)=>a+b.amount,0);
    return {income, expense, balance: income-expense, list: tx};
  }

  function drawBars(canvas, series, opts){
    const options = Object.assign({
      currency: state.currency || "COP $",
      padding: 16, gap: 18,
      labelFont: "12px system-ui, -apple-system, Segoe UI, Roboto, Arial",
      valueFont: "12px system-ui, -apple-system, Segoe UI, Roboto, Arial",
      axisColor: "rgba(148,163,184,.7)"
    }, opts||{});

    const dpr=window.devicePixelRatio||1;
    const rect=canvas.getBoundingClientRect();
    canvas.width=Math.max(1,Math.round(rect.width*dpr));
    canvas.height=Math.max(1,Math.round(rect.height*dpr));
    const ctx=canvas.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=rect.width, h=rect.height;
    ctx.clearRect(0,0,w,h);

    const css=getComputedStyle(document.documentElement);
    const green=css.getPropertyValue("--accent")||"#22c55e";
    const red=css.getPropertyValue("--warn")||"#ef4444";
    const muted=css.getPropertyValue("--muted")||"#94a3b8";

    const left=options.padding+4, right=w-options.padding, bottom=h-28, top=options.padding+6;
    const maxVal=Math.max(1,...series.map(s=>s.value||0));
    const count=series.length, full=right-left, bw=(full - options.gap*(count-1))/count;

    ctx.strokeStyle=options.axisColor; ctx.beginPath(); ctx.moveTo(left,bottom+0.5); ctx.lineTo(right,bottom+0.5); ctx.stroke();
    ctx.textAlign="center";

    series.forEach((s,i)=>{
      const x=left + i*(bw + options.gap);
      const val=Math.max(0,s.value||0);
      const barH=Math.round((bottom-top)*(val/maxVal));
      ctx.fillStyle=s.color || (s.label.toLowerCase().includes("ingre")?green:red);
      ctx.fillRect(x, bottom-barH, bw, barH);

      const label=`${options.currency} ${Number(val).toLocaleString('es-CO')}`;
      ctx.font=options.valueFont;
      const lx=x+bw/2; let ly=bottom-barH-6;
      ctx.fillStyle="rgba(0,0,0,.35)";
      const m=ctx.measureText(label); const pad=4, hh=16, bgx=lx-m.width/2-pad, bgy=ly-hh+3;
      ctx.fillRect(bgx,bgy,m.width+pad*2,hh);
      ctx.fillStyle="#fff"; ctx.textBaseline="bottom"; ctx.fillText(label,lx,ly);

      ctx.font=options.labelFont; ctx.fillStyle=muted; ctx.textBaseline="alphabetic"; ctx.fillText(s.label,lx,h-8);
    });
  }

  function renderResumen(){
    const cur = state.currency || 'COP $';
    const now=new Date();
    const m=sumPeriod(startOfMonth(now), endOfMonth(now));
    const w=sumPeriod(startOfWeek(now), endOfWeek(now));
    const t=sumPeriod(new Date(now.toDateString()), new Date(now.toDateString()));

    $('#mIncome').textContent=fmtMoney(m.income,cur);
    $('#mExpense').textContent=fmtMoney(m.expense,cur);
    $('#mBalance').textContent=fmtMoney(m.balance,cur);
    $('#wIncome').textContent=fmtMoney(w.income,cur);
    $('#wExpense').textContent=fmtMoney(w.expense,cur);
    $('#wBalance').textContent=fmtMoney(w.balance,cur);
    $('#tIncome').textContent=fmtMoney(t.income,cur);
    $('#tExpense').textContent=fmtMoney(t.expense,cur);
    $('#tBalance').textContent=fmtMoney(t.balance,cur);

    const min=state.debts.reduce((a,b)=>a+(Number(b.min)||0),0);
    $('#minDebt').textContent=fmtMoney(min,cur);

    const goal=(state.savePercent/100)*(m.income||0);
    const current=Math.max(0,m.income-m.expense);
    $('#mSaveGoal').textContent=fmtMoney(goal,cur);
    $('#mSaveNow').textContent=fmtMoney(current,cur);
    const pct=goal?Math.min(100,Math.round(100*current/goal)):0;
    $('#mSaveBar').style.width=pct+'%';

    const byCatW={}; w.list.filter(x=>x.type==='Gasto').forEach(x=>{byCatW[x.category]=(byCatW[x.category]||0)+x.amount});
    const items=Object.entries(byCatW).sort((a,b)=>b[1]-a[1]).slice(0,5);
    $('#wCats').innerHTML = items.length? items.map(([c,v])=>`<div class='row'><span class='pill'>${escapeHtml(c)}</span><strong class='mono bad'>${fmtMoney(v,cur)}</strong></div>`).join('') : '<span class="muted">Sin datos</span>';

    const byCatM={}; m.list.filter(x=>x.type==='Gasto').forEach(x=>{byCatM[x.category]=(byCatM[x.category]||0)+x.amount});

    const igCanvas=$('#chartIG'); if(igCanvas){ drawBars(igCanvas,[{label:'Ingresos',value:m.income,color:'#22c55e'},{label:'Gastos',value:m.expense,color:'#ef4444'}],{currency:cur}); }
    const catsCanvas=$('#chartCats'); if(catsCanvas){ const s=Object.entries(byCatM).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([l,v])=>({label:l,value:v,color:'#3b82f6'})); drawBars(catsCanvas,s,{currency:cur}); }
  }
  $('#applyBudget').addEventListener('click',()=>{ renderResumen(); });

  // ===== Deudas =====
  function clearDebt(){ $('#dbCreditor').value=''; $('#dbType').value='TC'; $('#dbAmount').value=''; $('#dbAnnual').value=''; $('#dbMin').value=''; $('#dbCut').value=''; }
  $('#clearDebt').addEventListener('click', clearDebt);
  function addDebt(){
    const d={id:uid(), creditor:$('#dbCreditor').value.trim(), type:$('#dbType').value, amount:Number($('#dbAmount').value||0), annual:Number($('#dbAnnual').value||0), min:Number($('#dbMin').value||0), cut:$('#dbCut').value||'', note:''};
    if(!d.creditor){ alert('Ingresa el acreedor'); return; }
    state.debts.unshift(d); save(); renderDebts(); clearDebt(); renderResumen();
  }
  $('#saveDebt').addEventListener('click', addDebt);
  function renderDebts(){
    let html=`<tr><th>Acreedor</th><th>Tipo</th><th class='right'>Adeudado</th><th class='right'>Tasa anual</th><th class='right'>Mínimo/mes</th><th>Corte</th><th></th></tr>`;
    const cur = state.currency || 'COP $';
    state.debts.forEach(d=>{
      html+=`<tr><td>${escapeHtml(d.creditor)}</td><td>${escapeHtml(d.type)}</td><td class='right mono'>${fmtMoney(d.amount||0,cur)}</td><td class='right mono'>${(d.annual||0).toLocaleString('es-CO',{maximumFractionDigits:2})}%</td><td class='right mono'>${fmtMoney(d.min||0,cur)}</td><td>${d.cut||''}</td><td class='right'><button class='ghost delDebt' data-id='${d.id}'>Eliminar</button></td></tr>`
    });
    $('#dbTable').innerHTML=html;
  }
  document.addEventListener('click',e=>{ const b=e.target.closest('button.delDebt'); if(!b) return; const id=b.dataset.id; state.debts=state.debts.filter(d=>d.id!==id); save(); renderDebts(); renderResumen(); });

  // ===== Categorías & Métodos =====
  function renderLists(){
    const c=state.categories.map((x,i)=>`<span class='tag pill' data-i='${i}'>${escapeHtml(x)} <button title='Eliminar' data-i='${i}' class='ghost' style='padding:2px 6px;margin-left:6px'>×</button></span>`).join('');
    $('#catList').innerHTML=c||'<span class="muted">Sin categorías</span>';
    const m=state.methods.map((x,i)=>`<span class='tag pill' data-i='${i}'>${escapeHtml(x)} <button title='Eliminar' data-i='${i}' class='ghost' style='padding:2px 6px;margin-left:6px'>×</button></span>`).join('');
    $('#methodList').innerHTML=m||'<span class="muted">Sin métodos</span>';
    $('#savePct').value=Number(state.savePercent||0);
    $('#currency').value=state.currency||'COP $';
  }
  $('#addCat').addEventListener('click',()=>{const v=$('#newCat').value.trim(); if(!v) return; if(!state.categories.includes(v)) state.categories.push(v); $('#newCat').value=''; save(); renderLists(); fillSelectors();});
  $('#addMethod').addEventListener('click',()=>{const v=$('#newMethod').value.trim(); if(!v) return; if(!state.methods.includes(v)) state.methods.push(v); $('#newMethod').value=''; save(); renderLists(); fillSelectors();});
  $('#catList').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return; const i=Number(b.dataset.i); state.categories.splice(i,1); save(); renderLists(); fillSelectors();});
  $('#methodList').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return; const i=Number(b.dataset.i); state.methods.splice(i,1); save(); renderLists(); fillSelectors();});
  $('#saveSettings').addEventListener('click',()=>{const p=Number($('#savePct').value||0); state.savePercent=Math.max(0,Math.min(100,p)); state.currency=$('#currency').value||'COP $'; save(); renderResumen(); alert('Ajustes guardados');});

  // ===== Respaldo =====
  function download(filename,text){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'application/octet-stream'})); a.download=filename; a.click(); URL.revokeObjectURL(a.href); }
  $('#exportJSON').addEventListener('click',()=>{ download(`finapp_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(state,null,2)); });
  $('#exportCSV').addEventListener('click',()=>{
    const hdr=['date','type','description','category','method','amount','note'];
    const rows=[hdr.join(',')].concat(state.transactions.map(t=> hdr.map(k=>`"${String(t[k]??'').replace(/"/g,'""')}"`).join(',')));
    download(`movimientos_${new Date().toISOString().slice(0,10)}.csv`, rows.join('\\n'));
  });
  $('#importBtn').addEventListener('click',()=>{
    const f=$('#importFile').files[0]; if(!f){alert('Elige un archivo .json o .csv'); return;}
    const reader=new FileReader(); reader.onload=(e)=>{
      try{
        if(f.name.toLowerCase().endsWith('.json')){
          const obj=JSON.parse(e.target.result); if(!obj.transactions) throw new Error('JSON inválido'); state=obj; save(); show('resumen'); alert('Importación JSON completada');
        } else {
          const arr=parseCSV(e.target.result);
          const map=row=>({
            id:uid(),
            date: row['Fecha']||row['fecha']||row['date']||row['Date']|| todayStr(),
            type: (row['Tipo']||row['type']||row['Type']||'Gasto').toString().toLowerCase().includes('ing')?'Ingreso':'Gasto',
            description: row['Descripción']||row['descripcion']||row['Description']||row['desc']||'',
            category: row['Categoría']||row['categoria']||row['Category']||'Otros',
            method: row['Método de pago']||row['Metodo']||row['method']||'Efectivo',
            amount: Number(String(row['Monto']||row['amount']||'0').replace(/[^0-9.]/g,''))||0,
            note: row['Nota']||row['note']||''
          });
          const tx=arr.map(map).filter(x=>x.amount>0); state.transactions = tx.concat(state.transactions); save(); show('registrar'); alert(`Importadas ${tx.length} filas de CSV`);
        }
      }catch(err){ alert('No se pudo importar: '+err.message); }
    };
    reader.readAsText(f);
  });
  $('#resetAll').addEventListener('click',()=>{ if(confirm('Esto borrará todos tus datos de este navegador. ¿Continuar?')){ localStorage.removeItem('finapp_data'); state=load(); save(); show('resumen'); } });

})();