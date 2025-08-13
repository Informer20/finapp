(function(){
  // ===== Utilities =====
  var $=function(q){return document.querySelector(q)};
  var $$=function(q){return Array.prototype.slice.call(document.querySelectorAll(q))};
  function todayStr(){var d=new Date();var tz=new Date(d.getTime()-d.getTimezoneOffset()*60000);return tz.toISOString().slice(0,10)}
  function startOfMonth(d){return new Date(d.getFullYear(),d.getMonth(),1)}
  function endOfMonth(d){return new Date(d.getFullYear(),d.getMonth()+1,0)}
  function startOfWeek(d){var x=new Date(d);var day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);x.setHours(0,0,0,0);return x}
  function endOfWeek(d){var s=startOfWeek(d);var e=new Date(s);e.setDate(s.getDate()+6);e.setHours(23,59,59,999);return e}
  function uid(){return Math.random().toString(36).slice(2)+Date.now().toString(36)}
  function escapeHtml(s){if(s==null)return"";return String(s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[c])})}
  function parseCSV(text){
    var sep=text.indexOf(';')>-1?';':',';
    var lines=text.split(/\r?\n/).filter(function(x){return x.trim().length>0});
    if(!lines.length) return [];
    var headers=lines.shift().split(sep).map(function(h){return h.trim().replace(/^\"|\"$/g,'')});
    var out=[];
    for(var li=0; li<lines.length; li++){
      var line=lines[li], cells=[], cur='', q=false;
      for(var i=0;i<line.length;i++){
        var ch=line[i];
        if(ch==='\"'){ q=!q; continue; }
        if(ch===sep && !q){ cells.push(cur); cur=''; continue; }
        cur+=ch;
      }
      cells.push(cur);
      var obj={};
      for(var j=0;j<headers.length;j++){ obj[headers[j]] = (cells[j]||'').trim(); }
      out.push(obj);
    }
    return out;
  }
  function dprCanvas(canvas,h){
    var dpr=window.devicePixelRatio||1;
    var w=canvas.clientWidth||canvas.parentElement.clientWidth||320;
    canvas.width=Math.round(w*dpr);
    canvas.height=Math.round(h*dpr);
    var ctx=canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return ctx;
  }

  // ===== State =====
  var DEFAULTS={
    categories:["Fijos","Necesarios","Transporte","Alimentación","Salud","Educación","Ocio","Servicios","Otros","Sueldo","Honorarios"],
    methods:["Efectivo","Nequi","Bancolombia","Daviplata","Tarjeta Crédito","Tarjeta Débito"],
    savePercent:20,transactions:[],debts:[],curr:"COP $",theme:"auto"
  };
  function load(){try{return JSON.parse(localStorage.getItem('finapp_data_pwa'))||DEFAULTS}catch(e){return DEFAULTS}}
  function save(){localStorage.setItem('finapp_data_pwa',JSON.stringify(state))}
  var state=load();

  function fmtMoney(n){var sign=n<0?"-":"";var v=Math.abs(n||0);return sign+(state.curr||"")+v.toLocaleString('es-CO',{maximumFractionDigits:0})}

  // ===== Theme =====
  function applyTheme(v){
    if(v==='light') document.body.setAttribute('data-theme','light');
    else document.body.removeAttribute('data-theme');
    $('#themeBtn').textContent = v==='auto'?'🌓 Auto':(v==='dark'?'🌙 Oscuro':'🌞 Claro');
  }
  if(!state.theme) state.theme='auto';
  applyTheme(state.theme);
  $('#themeBtn').addEventListener('click',function(){
    state.theme = state.theme==='dark' ? 'light' : (state.theme==='light' ? 'auto' : 'dark');
    applyTheme(state.theme); save();
  });

  // ===== Navigation =====
  var PANELS=[{key:'resumen',label:'Resumen'},{key:'registrar',label:'Registrar'},{key:'deudas',label:'Deudas'},{key:'categorias',label:'Categorías'},{key:'respaldo',label:'Respaldo'}];
  var tabs=$('#tabs');
  PANELS.forEach(function(p){
    var b=document.createElement('button'); b.className='tab'; b.textContent=p.label; b.setAttribute('data-key',p.key); tabs.appendChild(b);
  });
  function show(key){
    $$('#tabs .tab').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-key')===key) });
    PANELS.forEach(function(p){ var el=$('#panel-'+p.key); if(el) el.hidden=(p.key!==key); });
    if(key==='resumen') renderResumen();
    if(key==='registrar'){ renderTxTable(); fillSelectors(); }
    if(key==='deudas') renderDebts();
    if(key==='categorias') renderLists();
  }
  tabs.addEventListener('click', function(e){
    var btn=e.target.closest?e.target.closest('button.tab'):null; if(!btn) return; show(btn.getAttribute('data-key'));
  });
  show('resumen');

  // Online badge
  function updateOnline(){var b=$('#onlineBadge'); if(!b) return; if(navigator.onLine){b.textContent='🟢 Online'; b.classList.remove('offline'); b.classList.add('online');} else {b.textContent='🔴 Offline'; b.classList.remove('online'); b.classList.add('offline');}}
  window.addEventListener('online',updateOnline); window.addEventListener('offline',updateOnline); updateOnline();

  // ===== Registrar =====
  var currentType='Gasto';
  $('#type-expense').addEventListener('click',function(){currentType='Gasto'; $('#chosenType').textContent='Tipo: Gasto'});
  $('#type-income').addEventListener('click',function(){currentType='Ingreso'; $('#chosenType').textContent='Tipo: Ingreso'});
  $('#txDate').value=todayStr();
  function fillSelectors(){
    var cat=$('#txCategory'), method=$('#txMethod'); cat.innerHTML=''; method.innerHTML='';
    state.categories.forEach(function(c){ var o=document.createElement('option'); o.textContent=c; cat.appendChild(o); });
    state.methods.forEach(function(m){ var o=document.createElement('option'); o.textContent=m; method.appendChild(o); });
  }
  fillSelectors();
  function clearForm(){ $('#txAmount').value=''; $('#txDesc').value=''; $('#txNote').value=''; $('#txDate').value=todayStr(); }
  $('#clearTx').addEventListener('click', clearForm);

  function addTx(){
    var t={
      id:uid(),
      date: $('#txDate').value || todayStr(),
      type: currentType,
      description: ($('#txDesc').value||'').trim() || (currentType==='Gasto'?'Gasto':'Ingreso'),
      category: $('#txCategory').value,
      method: $('#txMethod').value,
      amount: Number($('#txAmount').value||0),
      note: ($('#txNote').value||'').trim()
    };
    if(!(t.amount>0)){ alert('Ingresa un monto > 0'); return; }
    state.transactions.unshift(t); save(); renderTxTable(); clearForm(); renderResumen();
  }
  $('#saveTx').addEventListener('click', addTx);
  document.addEventListener('keydown', function(e){
    if((e.key==='k'&&(e.ctrlKey||e.metaKey))||e.key==='/'){ e.preventDefault(); var s=$('#search'); if(s){ s.focus(); s.select(); } return; }
    if(e.key==='Enter'&&!e.shiftKey){
      var tag=(document.activeElement&&document.activeElement.tagName||'').toLowerCase();
      if(tag==='input'||tag==='select'||tag==='textarea'||tag==='button'){ e.preventDefault(); addTx(); }
    }
  });

  // ===== Tabla + Edición inline =====
  var editingId=null;
  function renderTxTable(){
    var q=($('#search').value||'').toLowerCase(), ty=$('#filterType').value||'all', m=$('#filterMonth').value;
    var rows=state.transactions.slice();
    if(q){ rows=rows.filter(function(r){ return (r.description+' '+r.category+' '+r.method).toLowerCase().indexOf(q)>-1 }); }
    if(ty!=='all'){ rows=rows.filter(function(r){ return r.type===ty }); }
    if(m){ rows=rows.filter(function(r){ return r.date && r.date.indexOf(m)===0 }); }

    var inc=0, exp=0;
    rows.forEach(function(r){ if(r.type==='Ingreso') inc+=r.amount||0; else exp+=r.amount||0; });
    $('#txTotals').innerHTML = "<span class='pill'>Ingresos: <b>"+fmtMoney(inc)+"</b></span>"+
                               "<span class='pill'>Gastos: <b>"+fmtMoney(exp)+"</b></span>"+
                               "<span class='pill'>Balance: <b>"+fmtMoney(inc-exp)+"</b></span>";

    var html = "<tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Método</th><th class='right'>Monto</th><th></th></tr>";
    rows.forEach(function(r){
      if(editingId===r.id){
        html += "<tr data-id='"+r.id+"'>"+
          "<td><input type='date' value='"+r.date+"'/></td>"+
          "<td><select><option"+(r.type==='Gasto'?' selected':'')+">Gasto</option><option"+(r.type==='Ingreso'?' selected':'')+">Ingreso</option></select></td>"+
          "<td><input value='"+escapeHtml(r.description)+"'/></td>"+
          "<td><input value='"+escapeHtml(r.category)+"'/></td>"+
          "<td><input value='"+escapeHtml(r.method)+"'/></td>"+
          "<td class='right'><input type='number' step='100' min='0' value='"+(r.amount||0)+"' style='width:120px'/></td>"+
          "<td class='right'><button class='primary saveRow' data-id='"+r.id+"'>Guardar</button> <button class='ghost cancelRow'>Cancelar</button></td>"+
        "</tr>";
      } else {
        var sign = r.type==='Gasto'?-1:1;
        html += "<tr data-id='"+r.id+"'>"+
          "<td>"+r.date+"</td>"+
          "<td><span class='pill'>"+r.type+"</span></td>"+
          "<td>"+escapeHtml(r.description)+"</td>"+
          "<td>"+escapeHtml(r.category)+"</td>"+
          "<td>"+escapeHtml(r.method)+"</td>"+
          "<td class='right mono "+(sign<0?'bad':'ok')+"'>"+fmtMoney(sign*r.amount)+"</td>"+
          "<td class='right'><button data-id='"+r.id+"' class='ghost editRow'>Editar</button> <button data-id='"+r.id+"' class='ghost delRow'>Eliminar</button></td>"+
        "</tr>";
      }
    });
    $('#txTable').innerHTML = html;
  }
  $('#search').addEventListener('input', renderTxTable);
  $('#filterType').addEventListener('change', renderTxTable);
  $('#filterMonth').addEventListener('change', renderTxTable);
  $('#resetFilters').addEventListener('click', function(){ $('#search').value=''; $('#filterType').value='all'; $('#filterMonth').value=''; renderTxTable(); });

  document.addEventListener('click', function(e){
    var del = e.target.closest?e.target.closest('button.delRow'):null;
    if(del){ var id=del.getAttribute('data-id'); if(!confirm('¿Eliminar este movimiento?')) return; state.transactions=state.transactions.filter(function(t){return t.id!==id}); save(); renderTxTable(); renderResumen(); return; }
    var edit = e.target.closest?e.target.closest('button.editRow'):null;
    if(edit){ editingId = edit.getAttribute('data-id'); renderTxTable(); return; }
    var saveB = e.target.closest?e.target.closest('button.saveRow'):null;
    if(saveB){ var tr=saveB.closest('tr'); var id=saveB.getAttribute('data-id'); var inputs=tr.querySelectorAll('input,select'); var vals=[]; inputs.forEach(function(i){ vals.push(i.value); }); var idx=state.transactions.findIndex(function(x){return x.id===id}); if(idx>-1){ var t=state.transactions[idx]; t.date=vals[0]; t.type=vals[1]; t.description=vals[2]; t.category=vals[3]; t.method=vals[4]; t.amount=Number(vals[5]||0); save(); editingId=null; renderTxTable(); renderResumen(); } return; }
    var cancel = e.target.closest?e.target.closest('button.cancelRow'):null;
    if(cancel){ editingId=null; renderTxTable(); return; }
  });

  // ===== Summary + Charts =====
  function sumPeriod(start,end){
    var tx=state.transactions.filter(function(t){ var d=new Date(t.date); return d>=start && d<=end; });
    var income = tx.filter(function(t){return t.type==='Ingreso'}).reduce(function(a,b){return a+(b.amount||0)},0);
    var expense = tx.filter(function(t){return t.type==='Gasto'}).reduce(function(a,b){return a+(b.amount||0)},0);
    return {income:income, expense:expense, balance:income-expense, list:tx};
  }

  function drawBars(canvas, labels, values, colors){
    var H=220; var ctx=dprCanvas(canvas,H); var W=canvas.width/(window.devicePixelRatio||1); ctx.clearRect(0,0,W,H);
    var pad=28, base=H-28; var max=1; for(var i=0;i<values.length;i++){ if(values[i]>max) max=values[i]; }
    var n=values.length; var slot=(W-pad*2)/Math.max(n,1); var bw=Math.max(16, slot*0.65); var gap=slot-bw;
    ctx.font='12px system-ui'; ctx.fillStyle=getComputedStyle(document.body).color;
    for(var i=0;i<n;i++){
      var x=pad+i*(bw+gap); var v=values[i]; var h=Math.round((base-10)*v/max);
      ctx.fillStyle=colors[i%colors.length]||'#3b82f6';
      ctx.fillRect(x, base-h, bw, h);
      ctx.fillStyle=getComputedStyle(document.body).color;
      ctx.fillText(String(labels[i]).slice(0,10), x, H-10);
      var valTxt = (state.curr||'')+Math.round(v).toLocaleString('es-CO');
      ctx.fillText(valTxt, x, base-h-6);
    }
  }

  function renderResumen(){
    var now=new Date();
    var m=sumPeriod(startOfMonth(now), endOfMonth(now));
    var w=sumPeriod(startOfWeek(now), endOfWeek(now));
    var t=sumPeriod(new Date(now.toDateString()), new Date(now.toDateString()));
    $('#mIncome').textContent=fmtMoney(m.income);
    $('#mExpense').textContent=fmtMoney(m.expense);
    $('#mBalance').textContent=fmtMoney(m.balance);
    $('#wIncome').textContent=fmtMoney(w.income);
    $('#wExpense').textContent=fmtMoney(w.expense);
    $('#wBalance').textContent=fmtMoney(w.balance);
    $('#tIncome').textContent=fmtMoney(t.income);
    $('#tExpense').textContent=fmtMoney(t.expense);
    $('#tBalance').textContent=fmtMoney(t.balance);

    var min=state.debts.reduce(function(a,b){return a+(Number(b.min)||0)},0);
    $('#minDebt').textContent=fmtMoney(min);

    var goal=(state.savePercent/100)*(m.income||0);
    var current=Math.max(0, m.income - m.expense);
    $('#mSaveGoal').textContent=fmtMoney(goal);
    $('#mSaveNow').textContent=fmtMoney(current);
    $('#mSaveBar').style.width = (goal? Math.min(100, Math.round(100*current/goal)) : 0)+'%';

    // Charts
    drawBars($('#chartIG'), ['Ingresos','Gastos'], [m.income,m.expense], ['#22c55e','#ef4444']);

    var byCatM={}; m.list.filter(function(x){return x.type==='Gasto'}).forEach(function(x){ byCatM[x.category]=(byCatM[x.category]||0)+x.amount; });
    var entries=Object.keys(byCatM).map(function(k){return [k,byCatM[k]]}).sort(function(a,b){return b[1]-a[1]}).slice(0,8);
    if(entries.length){
      drawBars($('#chartCats'), entries.map(function(x){return x[0]}), entries.map(function(x){return x[1]}), ['#3b82f6','#60a5fa','#93c5fd','#1d4ed8','#2563eb','#38bdf8','#22d3ee','#06b6d4']);
    } else {
      var ctx=dprCanvas($('#chartCats'),220); var W=ctx.canvas.width/(window.devicePixelRatio||1);
      ctx.clearRect(0,0,W,220); ctx.fillStyle=getComputedStyle(document.body).color; ctx.font='14px system-ui'; ctx.fillText('Sin datos', 12, 24);
    }

    // top categorías semana listado
    var byCat={}; w.list.filter(function(x){return x.type==='Gasto'}).forEach(function(x){ byCat[x.category]=(byCat[x.category]||0)+x.amount; });
    var items=Object.keys(byCat).map(function(k){return [k,byCat[k]]}).sort(function(a,b){return b[1]-a[1]}).slice(0,5);
    $('#wCats').innerHTML = items.length? items.map(function(p){return "<div class='row'><span class='pill'>"+escapeHtml(p[0])+"</span><strong class='mono bad'>"+fmtMoney(p[1])+"</strong></div>";}).join('') : '<span class="muted">Sin datos</span>';
  }
  window.addEventListener('resize', function(){ if(!$('#panel-resumen').hidden) renderResumen(); });

  $('#applyBudget').addEventListener('click', function(){ var v=Number($('#budgetInput').value||0); $('#budgetInput').setAttribute('data-applied', String(v)); renderResumen(); });

  // ===== Debts =====
  function clearDebt(){ $('#dbCreditor').value=''; $('#dbType').value='TC'; $('#dbAmount').value=''; $('#dbAnnual').value=''; $('#dbMin').value=''; $('#dbCut').value=''; }
  $('#clearDebt').addEventListener('click', clearDebt);
  function addDebt(){
    var d={id:uid(), creditor:($('#dbCreditor').value||'').trim(), type:$('#dbType').value, amount:Number($('#dbAmount').value||0), annual:Number($('#dbAnnual').value||0), min:Number($('#dbMin').value||0), cut:$('#dbCut').value, note:''};
    if(!d.creditor){ alert('Ingresa el acreedor'); return; }
    state.debts.unshift(d); save(); renderDebts(); clearDebt(); renderResumen();
  }
  $('#saveDebt').addEventListener('click', addDebt);
  document.addEventListener('click', function(e){
    var btn=e.target.closest?e.target.closest('button.delDebt'):null; if(!btn) return;
    var id=btn.getAttribute('data-id');
    if(!confirm('¿Eliminar esta deuda?')) return;
    state.debts = state.debts.filter(function(x){ return x.id!==id; });
    save(); renderDebts(); renderResumen();
  });
  function renderDebts(){
    var html = "<tr><th>Acreedor</th><th>Tipo</th><th class='right'>Adeudado</th><th class='right'>Tasa anual</th><th class='right'>Mínimo/mes</th><th>Corte</th><th></th></tr>";
    state.debts.forEach(function(d){
      html += "<tr>"+
        "<td>"+escapeHtml(d.creditor)+"</td>"+
        "<td>"+escapeHtml(d.type)+"</td>"+
        "<td class='right mono'>"+fmtMoney(d.amount||0)+"</td>"+
        "<td class='right mono'>"+((d.annual||0).toLocaleString('es-CO',{maximumFractionDigits:2}))+"%</td>"+
        "<td class='right mono'>"+fmtMoney(d.min||0)+"</td>"+
        "<td>"+(d.cut||'')+"</td>"+
        "<td class='right'><button class='ghost delDebt' data-id='"+d.id+"'>Eliminar</button></td>"+
      "</tr>";
    });
    $('#dbTable').innerHTML = html;
  }

  // ===== Categorías & Métodos =====
  function renderLists(){
    var c = state.categories.map(function(x,i){return "<span class='pill' style='margin:2px' data-i='"+i+"'>"+escapeHtml(x)+" <button data-i='"+i+"' class='ghost' style='padding:2px 6px;margin-left:6px'>x</button></span>";}).join('');
    $('#catList').innerHTML = c || '<span class=\"muted\">Sin categorías</span>';
    var m = state.methods.map(function(x,i){return "<span class='pill' style='margin:2px' data-i='"+i+"'>"+escapeHtml(x)+" <button data-i='"+i+"' class='ghost' style='padding:2px 6px;margin-left:6px'>x</button></span>";}).join('');
    $('#methodList').innerHTML = m || '<span class=\"muted\">Sin métodos</span>';
    $('#savePct').value = Number(state.savePercent||0);
    $('#currencySym').value = state.curr || 'COP $';
  }
  $('#addCat').addEventListener('click', function(){ var v=($('#newCat').value||'').trim(); if(!v) return; if(state.categories.indexOf(v)===-1) state.categories.push(v); $('#newCat').value=''; save(); renderLists(); fillSelectors(); });
  $('#addMethod').addEventListener('click', function(){ var v=($('#newMethod').value||'').trim(); if(!v) return; if(state.methods.indexOf(v)===-1) state.methods.push(v); $('#newMethod').value=''; save(); renderLists(); fillSelectors(); });
  $('#catList').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; var i=Number(b.getAttribute('data-i')); state.categories.splice(i,1); save(); renderLists(); fillSelectors(); });
  $('#methodList').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; var i=Number(b.getAttribute('data-i')); state.methods.splice(i,1); save(); renderLists(); fillSelectors(); });
  $('#saveSettings').addEventListener('click', function(){ var p=Number($('#savePct').value||0); state.savePercent=Math.max(0,Math.min(100,p)); state.curr=$('#currencySym').value||'COP $'; save(); renderResumen(); alert('Ajustes guardados'); });

  // ===== Respaldo / Import =====
  function download(fn,txt){ var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([txt],{type:'application/octet-stream'})); a.download=fn; a.click(); URL.revokeObjectURL(a.href); }
  $('#exportJSON').addEventListener('click', function(){ download('finapp_'+new Date().toISOString().slice(0,10)+'.json', JSON.stringify(state,null,2)); });
  $('#exportCSV').addEventListener('click', function(){ var hdr=['date','type','description','category','method','amount','note']; var lines=[hdr.join(',')]; state.transactions.forEach(function(t){ var row=hdr.map(function(k){ return '\"'+String(t[k]==null?'':t[k]).replace(/\"/g,'\\\"')+'\"'; }); lines.push(row.join(',')); }); download('movimientos_'+new Date().toISOString().slice(0,10)+'.csv', lines.join('\\n')); });
  $('#importBtn').addEventListener('click', function(){
    var f=$('#importFile').files[0]; if(!f){ alert('Elige un archivo .json o .csv'); return; }
    var reader=new FileReader(); reader.onload=function(e){
      try{
        if((f.name||'').toLowerCase().indexOf('.json')>-1){
          var obj=JSON.parse(e.target.result); if(!obj.transactions) throw new Error('JSON inválido');
          state=obj; if(!state.curr) state.curr='COP $'; if(!state.theme) state.theme='auto'; applyTheme(state.theme); save(); show('resumen'); alert('Importación JSON completada');
        } else {
          var arr=parseCSV(e.target.result);
          var tx=arr.map(function(row){ return {
            id:uid(),
            date: row['Fecha']||row['fecha']||row['date']||row['Date']|| todayStr(),
            type: String(row['Tipo']||row['type']||'Gasto').toLowerCase().indexOf('ing')>-1?'Ingreso':'Gasto',
            description: row['Descripción']||row['descripcion']||row['Description']||row['desc']||'',
            category: row['Categoría']||row['categoria']||row['Category']||'Otros',
            method: row['Método de pago']||row['Metodo']||row['method']||'Efectivo',
            amount: Number(String(row['Monto']||row['amount']||'0').replace(/[^0-9.]/g,''))||0,
            note: row['Nota']||row['note']||''
          };}).filter(function(x){return x.amount>0});
          state.transactions = tx.concat(state.transactions); save(); show('registrar'); alert('Importadas '+tx.length+' filas de CSV');
        }
      }catch(err){ alert('No se pudo importar: '+err.message); }
    }; reader.readAsText(f);
  });
  $('#resetAll').addEventListener('click', function(){ if(confirm('Esto borrará todos tus datos de este navegador. ¿Continuar?')){ localStorage.removeItem('finapp_data_pwa'); state=load(); save(); show('resumen'); } });

  // ===== PWA Install & Updates =====
  var deferredPrompt=null, installBtn=$('#installBtn');
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); deferredPrompt=e; installBtn.hidden=false; });
  installBtn.addEventListener('click', function(){ if(!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt.userChoice.finally(function(){ deferredPrompt=null; installBtn.hidden=true; }); });

  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('./sw.js').then(function(reg){
        reg.onupdatefound=function(){ var nw=reg.installing; nw.onstatechange=function(){ if(nw.state==='installed' && navigator.serviceWorker.controller){ var bn=$('#updateBanner'); if(bn) bn.classList.add('show'); } }; };
      }).catch(function(err){ console.warn('SW fail', err); });
    });
    $('#reloadApp').addEventListener('click', function(){ if(navigator.serviceWorker.waiting){ navigator.serviceWorker.waiting.postMessage({type:'SKIP_WAITING'}); } else { window.location.reload(); } });
    $('#dismissUpd').addEventListener('click', function(){ var bn=$('#updateBanner'); if(bn) bn.classList.remove('show'); });
    navigator.serviceWorker.addEventListener('controllerchange', function(){ window.location.reload(); });
  }
})();