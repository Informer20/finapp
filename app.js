(function(){
  // ===== Utilidades y estado =====
  function $(q){ return document.querySelector(q); }
  function qsa(q){ return Array.prototype.slice.call(document.querySelectorAll(q)); }
  function todayStr(){ var d=new Date(); var tz=new Date(d.getTime()-d.getTimezoneOffset()*60000); return tz.toISOString().slice(0,10); }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
  function startOfWeek(d){ var x=new Date(d); var day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
  function endOfWeek(d){ var s=startOfWeek(d); var e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return e; }
  function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function escapeHtml(s){ if(s==null) return ""; return String(s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];}); }
  function parseCSV(text){
    var sep = text.indexOf(';')>-1? ';' : ',';
    var lines = text.split(/\r?\n/).filter(function(x){return x.trim().length>0;});
    if(!lines.length) return [];
    var headers = lines.shift().split(sep).map(function(h){ return h.trim().replace(/^\"|\"$/g,''); });
    var out = [];
    for(var li=0; li<lines.length; li++){
      var line = lines[li], cells=[], cur='', q=false;
      for(var i=0;i<line.length;i++){ var ch=line[i]; if(ch==='\"'){ q=!q; continue; } if(ch===sep && !q){ cells.push(cur); cur=''; continue; } cur+=ch; }
      cells.push(cur);
      var obj={}; for(var ci=0;ci<headers.length;ci++){ obj[headers[ci]]=(cells[ci]||'').trim(); }
      out.push(obj);
    }
    return out;
  }

  var DEFAULTS={
    categories:["Fijos","Necesarios","Transporte","Alimentación","Salud","Educación","Ocio","Servicios","Otros","Sueldo","Honorarios"],
    methods:["Efectivo","Nequi","Bancolombia","Daviplata","Tarjeta Crédito","Tarjeta Débito"],
    savePercent:20, transactions:[], debts:[], curr:"COP $"
  };
  function load(){ try{ return JSON.parse(localStorage.getItem('finapp_data_pwa')) || DEFAULTS; }catch(e){ return DEFAULTS; } }
  function save(){ localStorage.setItem('finapp_data_pwa', JSON.stringify(state)); }
  var state = load();

  function fmtMoney(n){
    var sign = n<0 ? "-" : "";
    var v = Math.abs(n||0);
    return sign + (state.curr||"") + v.toLocaleString('es-CO',{maximumFractionDigits:0});
  }

  // ===== Navegación =====
  var PANELS=[{key:'resumen',label:'Resumen'},{key:'registrar',label:'Registrar'},{key:'deudas',label:'Deudas'},{key:'categorias',label:'Categorías'},{key:'respaldo',label:'Respaldo'}];
  var tabs=$('#tabs'); PANELS.forEach(function(p){ var b=document.createElement('button'); b.className='tab'; b.textContent=p.label; b.setAttribute('data-key',p.key); tabs.appendChild(b); });
  function show(key){ qsa('#tabs .tab').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-key')===key);}); PANELS.forEach(function(p){ var el=document.getElementById('panel-'+p.key); if(el) el.hidden=(p.key!==key);}); if(key==='resumen')renderResumen(); if(key==='registrar'){renderTxTable(); fillSelectors();} if(key==='deudas')renderDebts(); if(key==='categorias')renderLists(); }
  tabs.addEventListener('click', function(e){ var btn=e.target.closest?e.target.closest('button.tab'):null; if(!btn)return; show(btn.getAttribute('data-key')); });
  show('resumen');

  // Online/Offline badge
  function updateOnline(){ var b=$('#onlineBadge'); if(!b) return; if(navigator.onLine){ b.textContent='🟢 Online'; b.classList.remove('offline'); b.classList.add('online'); } else { b.textContent='🔴 Offline'; b.classList.remove('online'); b.classList.add('offline'); } }
  window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline); updateOnline();

  // ===== Registrar Movimiento =====
  var currentType='Gasto';
  $('#type-expense').addEventListener('click',function(){currentType='Gasto'; $('#chosenType').textContent='Tipo: Gasto';});
  $('#type-income').addEventListener('click',function(){currentType='Ingreso'; $('#chosenType').textContent='Tipo: Ingreso';});
  $('#txDate').value=todayStr();
  function fillSelectors(){ var cat=$('#txCategory'), method=$('#txMethod'); cat.innerHTML=''; method.innerHTML=''; state.categories.forEach(function(c){ var o=document.createElement('option'); o.textContent=c; cat.appendChild(o); }); state.methods.forEach(function(m){ var o=document.createElement('option'); o.textContent=m; method.appendChild(o); }); }
  fillSelectors();
  function clearForm(){ $('#txAmount').value=''; $('#txDesc').value=''; $('#txNote').value=''; $('#txDate').value=todayStr(); }
  $('#clearTx').addEventListener('click', clearForm);
  function addTx(){ var t={ id:uid(), date:$('#txDate').value||todayStr(), type:currentType, description:($('#txDesc').value||'').trim()||(currentType==='Gasto'?'Gasto':'Ingreso'), category:$('#txCategory').value, method:$('#txMethod').value, amount:Number($('#txAmount').value||0), note:($('#txNote').value||'').trim() }; if(!(t.amount>0)){ alert('Ingresa un monto > 0'); return; } state.transactions.unshift(t); save(); renderTxTable(); clearForm(); renderResumen(); }
  $('#saveTx').addEventListener('click', addTx);
  document.addEventListener('keydown', function(e){ if((e.key==='k' && (e.ctrlKey||e.metaKey)) || e.key==='/'){ e.preventDefault(); $('#search').focus(); return; } if(e.key==='Enter' && !e.shiftKey){ var tag=(document.activeElement&&document.activeElement.tagName||'').toLowerCase(); if(tag==='input'||tag==='select'||tag==='textarea'||tag==='button'){ e.preventDefault(); addTx(); }}});

  // ===== Tabla Movimientos =====
  function renderTxTable(){ 
    var q=($('#search').value||'').toLowerCase(), ty=$('#filterType').value||'all', m=$('#filterMonth').value;
    var rows=state.transactions.slice();
    if(q){ rows=rows.filter(function(r){ return (r.description+' '+r.category+' '+r.method).toLowerCase().indexOf(q)>-1; }); }
    if(ty!=='all'){ rows=rows.filter(function(r){ return r.type===ty; }); }
    if(m){ rows=rows.filter(function(r){ return r.date && r.date.indexOf(m)===0; }); }
    // Totales filtrados
    var inc=0, exp=0;
    rows.forEach(function(r){ if(r.type==='Ingreso') inc+=r.amount||0; else exp+=r.amount||0; });
    $('#txTotals').innerHTML = "<span class='pill'>Filtrados: <b>"+rows.length+"</b></span>"
      + "<span class='pill'>Ingresos: <b class='ok'>"+fmtMoney(inc)+"</b></span>"
      + "<span class='pill'>Gastos: <b class='bad'>"+fmtMoney(exp)+"</b></span>"
      + "<span class='pill'>Balance: <b>"+fmtMoney(inc-exp)+"</b></span>";
    var html="<tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Método</th><th class='right'>Monto</th><th></th></tr>";
    rows.forEach(function(r){
      var sign=r.type==='Gasto'?-1:1;
      html+="<tr>"
        +"<td>"+(r.date||'')+"</td>"
        +"<td><span class='pill'>"+r.type+"</span></td>"
        +"<td>"+escapeHtml(r.description)+"</td>"
        +"<td>"+escapeHtml(r.category)+"</td>"
        +"<td>"+escapeHtml(r.method)+"</td>"
        +"<td class='right mono "+(sign<0?'bad':'ok')+"'>"+fmtMoney(sign*r.amount)+"</td>"
        +"<td class='right'><button data-id='"+r.id+"' class='ghost delTx'>Eliminar</button></td>"
        +"</tr>";
    });
    $('#txTable').innerHTML=html;
  }
  $('#search').addEventListener('input', renderTxTable);
  $('#filterType').addEventListener('change', renderTxTable);
  $('#filterMonth').addEventListener('change', renderTxTable);
  $('#resetFilters').addEventListener('click', function(){ $('#search').value=''; $('#filterType').value='all'; $('#filterMonth').value=''; renderTxTable(); });
  document.addEventListener('click', function(e){ var btn=e.target.closest?e.target.closest('button.delTx'):null; if(!btn)return; var id=btn.getAttribute('data-id'); if(!confirm('¿Eliminar este movimiento?')) return; state.transactions=state.transactions.filter(function(t){ return t.id!==id; }); save(); renderTxTable(); renderResumen(); });

  // ===== Resumen =====
  function sumPeriod(start,end){ var tx=state.transactions.filter(function(t){ var d=new Date(t.date); return d>=start && d<=end; }); var income=tx.filter(function(t){return t.type==='Ingreso';}).reduce(function(a,b){return a+(b.amount||0);},0); var expense=tx.filter(function(t){return t.type==='Gasto';}).reduce(function(a,b){return a+(b.amount||0);},0); return {income:income, expense:expense, balance:income-expense, list:tx}; }
  function renderResumen(){ var now=new Date(); var m=sumPeriod(startOfMonth(now), endOfMonth(now)), w=sumPeriod(startOfWeek(now), endOfWeek(now)), t=sumPeriod(new Date(now.toDateString()), new Date(now.toDateString())); $('#mIncome').textContent=fmtMoney(m.income); $('#mExpense').textContent=fmtMoney(m.expense); $('#mBalance').textContent=fmtMoney(m.balance); $('#wIncome').textContent=fmtMoney(w.income); $('#wExpense').textContent=fmtMoney(w.expense); $('#wBalance').textContent=fmtMoney(w.balance); $('#tIncome').textContent=fmtMoney(t.income); $('#tExpense').textContent=fmtMoney(t.expense); $('#tBalance').textContent=fmtMoney(t.balance); var min=state.debts.reduce(function(a,b){return a+(Number(b.min)||0);},0); $('#minDebt').textContent=fmtMoney(min); var goal=(state.savePercent/100)*(m.income||0); var current=Math.max(0,m.income-m.expense); $('#mSaveGoal').textContent=fmtMoney(goal); $('#mSaveNow').textContent=fmtMoney(current); var pct=goal? Math.min(100, Math.round(100*current/goal)) : 0; $('#mSaveBar').style.width=pct+'%'; var byCat={}; w.list.filter(function(x){return x.type==='Gasto';}).forEach(function(x){ byCat[x.category]=(byCat[x.category]||0)+x.amount; }); var items=Object.keys(byCat).map(function(k){return [k,byCat[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,5); $('#wCats').innerHTML= items.length? items.map(function(it){ return "<div class='row'><span class='pill'>"+escapeHtml(it[0])+"</span><strong class='mono bad'>"+fmtMoney(it[1])+"</strong></div>"; }).join('') : '<span class=\"muted\">Sin datos</span>'; var byCatM={}; m.list.filter(function(x){return x.type==='Gasto';}).forEach(function(x){ byCatM[x.category]=(byCatM[x.category]||0)+x.amount; }); var totalG=m.expense||1; var html=Object.keys(byCatM).map(function(k){ return [k,byCatM[k]]; }).sort(function(a,b){return b[1]-a[1];}).map(function(pair){ var c=pair[0], v=pair[1]; var p=Math.round(100*v/totalG); return "<div class='row' style='justify-content:space-between;margin:6px 0'><div class='row' style='gap:8px'><span class='pill'>"+escapeHtml(c)+"</span> <span class='muted'>"+p+"% del gasto</span></div><strong class='mono bad'>"+fmtMoney(v)+"</strong></div><div class='bar' title='Participación mensual'><em style='width:"+p+"%'></em></div>"; }).join('') || '<span class=\"muted\">Sin datos</span>'; $('#catsBreak').innerHTML=html; }
  $('#applyBudget').addEventListener('click',function(){ var v=Number($('#budgetInput').value||0); $('#budgetInput').setAttribute('data-applied', String(v)); renderResumen(); });

  // ===== Deudas =====
  function clearDebt(){ $('#dbCreditor').value=''; $('#dbType').value='TC'; $('#dbAmount').value=''; $('#dbAnnual').value=''; $('#dbMin').value=''; $('#dbCut').value=''; }
  $('#clearDebt').addEventListener('click', clearDebt);
  function addDebt(){ var d={id:uid(), creditor:($('#dbCreditor').value||'').trim(), type:$('#dbType').value, amount:Number($('#dbAmount').value||0), annual:Number($('#dbAnnual').value||0), min:Number($('#dbMin').value||0), cut:$('#dbCut').value, note:''}; if(!d.creditor){ alert('Ingresa el acreedor'); return; } state.debts.unshift(d); save(); renderDebts(); clearDebt(); renderResumen(); }
  $('#saveDebt').addEventListener('click', addDebt);
  document.addEventListener('click', function(e){ var btn=e.target.closest?e.target.closest('button.delDebt'):null; if(!btn)return; var id=btn.getAttribute('data-id'); if(!confirm('¿Eliminar esta deuda?')) return; state.debts=state.debts.filter(function(x){return x.id!==id;}); save(); renderDebts(); renderResumen(); });
  function renderDebts(){ var html="<tr><th>Acreedor</th><th>Tipo</th><th class='right'>Adeudado</th><th class='right'>Tasa anual</th><th class='right'>Mínimo/mes</th><th>Corte</th><th></th></tr>"; state.debts.forEach(function(d){ html+="<tr><td>"+escapeHtml(d.creditor)+"</td><td>"+escapeHtml(d.type)+"</td><td class='right mono'>"+fmtMoney(d.amount||0)+"</td><td class='right mono'>"+((d.annual||0).toLocaleString('es-CO',{maximumFractionDigits:2}))+"%</td><td class='right mono'>"+fmtMoney(d.min||0)+"</td><td>"+(d.cut||"")+"</td><td class='right'><button class='ghost delDebt' data-id='"+d.id+"'>Eliminar</button></td></tr>"; }); $('#dbTable').innerHTML=html; }

  // ===== Categorías & Métodos / Ajustes =====
  function renderLists(){ var c=state.categories.map(function(x,i){return "<span class='pill' style='margin:2px' data-i='"+i+"'>"+escapeHtml(x)+" <button data-i='"+i+"' class='ghost' style='padding:2px 6px;margin-left:6px'>x</button></span>";}).join(''); $('#catList').innerHTML=c||'<span class=\"muted\">Sin categorías</span>'; var m=state.methods.map(function(x,i){return "<span class='pill' style='margin:2px' data-i='"+i+"'>"+escapeHtml(x)+" <button data-i='"+i+"' class='ghost' style='padding:2px 6px;margin-left:6px'>x</button></span>";}).join(''); $('#methodList').innerHTML=m||'<span class=\"muted\">Sin métodos</span>'; $('#savePct').value=Number(state.savePercent||0); $('#currencySym').value=state.curr||'COP $'; }
  $('#addCat').addEventListener('click',function(){ var v=($('#newCat').value||'').trim(); if(!v) return; if(state.categories.indexOf(v)===-1) state.categories.push(v); $('#newCat').value=''; save(); renderLists(); fillSelectors(); });
  $('#addMethod').addEventListener('click',function(){ var v=($('#newMethod').value||'').trim(); if(!v) return; if(state.methods.indexOf(v)===-1) state.methods.push(v); $('#newMethod').value=''; save(); renderLists(); fillSelectors(); });
  $('#catList').addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b) return; var i=Number(b.getAttribute('data-i')); state.categories.splice(i,1); save(); renderLists(); fillSelectors(); });
  $('#methodList').addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b) return; var i=Number(b.getAttribute('data-i')); state.methods.splice(i,1); save(); renderLists(); fillSelectors(); });
  $('#saveSettings').addEventListener('click',function(){ var p=Number($('#savePct').value||0); state.savePercent=Math.max(0,Math.min(100,p)); state.curr=$('#currencySym').value||'COP $'; save(); renderResumen(); alert('Ajustes guardados'); });

  // ===== Respaldo / Importar =====
  function download(filename, text){ var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'application/octet-stream'})); a.download=filename; a.click(); URL.revokeObjectURL(a.href); }
  $('#exportJSON').addEventListener('click',function(){ download("finapp_"+new Date().toISOString().slice(0,10)+".json", JSON.stringify(state,null,2)); });
  $('#exportCSV').addEventListener('click',function(){ var hdr=['date','type','description','category','method','amount','note']; var lines=[hdr.join(',')]; state.transactions.forEach(function(t){ var row=hdr.map(function(k){ return '\"'+String(t[k]==null?'':t[k]).replace(/\"/g,'\\\"')+'\"'; }); lines.push(row.join(',')); }); download("movimientos_"+new Date().toISOString().slice(0,10)+".csv", lines.join('\\n')); });
  $('#importBtn').addEventListener('click',function(){ var f=$('#importFile').files[0]; if(!f){ alert('Elige un archivo .json o .csv'); return; } var reader=new FileReader(); reader.onload=function(e){ try{ if((f.name||'').toLowerCase().indexOf('.json')>-1){ var obj=JSON.parse(e.target.result); if(!obj.transactions) throw new Error('JSON inválido'); state=obj; if(!state.curr) state.curr='COP $'; save(); show('resumen'); alert('Importación JSON completada'); } else { var arr=parseCSV(e.target.result); var tx=[]; arr.forEach(function(row){ var o={ id:uid(), date: row['Fecha']||row['fecha']||row['date']||row['Date']|| todayStr(), type: String(row['Tipo']||row['type']||row['Type']||'Gasto').toLowerCase().indexOf('ing')>-1?'Ingreso':'Gasto', description: row['Descripción']||row['descripcion']||row['Description']||row['desc']||'', category: row['Categoría']||row['categoria']||row['Category']||'Otros', method: row['Método de pago']||row['Metodo']||row['method']||'Efectivo', amount: Number(String(row['Monto']||row['amount']||'0').replace(/[^0-9.]/g,''))||0, note: row['Nota']||row['note']||'' }; if(o.amount>0) tx.push(o); }); state.transactions=tx.concat(state.transactions); save(); show('registrar'); alert('Importadas '+tx.length+' filas de CSV'); } }catch(err){ alert('No se pudo importar: '+err.message); } }; reader.readAsText(f); });
  $('#resetAll').addEventListener('click',function(){ if(confirm('Esto borrará todos tus datos de este navegador. ¿Continuar?')){ localStorage.removeItem('finapp_data_pwa'); state=load(); save(); show('resumen'); } });

  // ===== PWA: Instalación y SW + Banner de actualización =====
  var deferredPrompt=null, installBtn=$('#installBtn');
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); deferredPrompt=e; installBtn.hidden=false; });
  installBtn.addEventListener('click', function(){ if(!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt.userChoice.finally(function(){ deferredPrompt=null; installBtn.hidden=true; }); });

  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('./sw.js').then(function(reg){
        reg.onupdatefound=function(){
          var newSW=reg.installing;
          newSW.onstatechange=function(){
            if(newSW.state==='installed' && navigator.serviceWorker.controller){
              // Mostrar banner
              var bn=$('#updateBanner'); if(bn) bn.classList.add('show');
            }
          };
        };
      }).catch(function(err){ console.warn('SW fail', err); });
    });

    // Acciones del banner
    $('#reloadApp').addEventListener('click', function(){
      // Pedimos al SW que active la nueva versión
      if(navigator.serviceWorker.waiting){
        navigator.serviceWorker.waiting.postMessage({type:'SKIP_WAITING'});
      }
    });
    $('#dismissUpd').addEventListener('click', function(){ var bn=$('#updateBanner'); if(bn) bn.classList.remove('show'); });

    // Al cambiar de controlador, recargamos
    navigator.serviceWorker.addEventListener('controllerchange', function(){ window.location.reload(); });
  }
})();