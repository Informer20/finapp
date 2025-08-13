(function(){
  // ===== Utilidades =====
  function $(q){ return document.querySelector(q); }
  function qsa(q){ return Array.prototype.slice.call(document.querySelectorAll(q)); }
  function fmtMoney(n){
    var sign = n<0 ? "-" : "";
    var v = Math.abs(n||0);
    return sign + "$" + v.toLocaleString('es-CO', {maximumFractionDigits:0});
  }
  function todayStr(){
    var d = new Date();
    var tz = new Date(d.getTime()-d.getTimezoneOffset()*60000);
    return tz.toISOString().slice(0,10);
  }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
  function startOfWeek(d){ var x=new Date(d); var day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
  function endOfWeek(d){ var s=startOfWeek(d); var e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return e; }
  function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function escapeHtml(s){
    if(s==null) return "";
    return String(s).replace(/[&<>\"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
  }
  function parseCSV(text){
    var sep = text.indexOf(';')>-1? ';' : ',';
    var lines = text.split(/\r?\n/).filter(function(x){return x.trim().length>0;});
    if(!lines.length) return [];
    var headers = lines.shift().split(sep).map(function(h){ return h.trim().replace(/^\"|\"$/g,''); });
    var out = [];
    for(var li=0; li<lines.length; li++){
      var line = lines[li];
      var cells=[]; var cur=''; var q=false;
      for(var i=0;i<line.length;i++){
        var ch=line[i];
        if(ch==='\"'){ q=!q; continue; }
        if(ch===sep && !q){ cells.push(cur); cur=''; continue; }
        cur+=ch;
      }
      cells.push(cur);
      var obj={};
      for(var ci=0;ci<headers.length;ci++){ obj[headers[ci]]= (cells[ci]||'').trim(); }
      out.push(obj);
    }
    return out;
  }

  // ===== Estado =====
  var DEFAULTS={
    categories:["Fijos","Necesarios","Transporte","Alimentación","Salud","Educación","Ocio","Servicios","Otros","Sueldo","Honorarios"],
    methods:["Efectivo","Nequi","Bancolombia","Daviplata","Tarjeta Crédito","Tarjeta Débito"],
    savePercent:20,
    transactions:[],
    debts:[]
  };
  function load(){ try{ return JSON.parse(localStorage.getItem('finapp_data_v2')) || DEFAULTS; }catch(e){ return DEFAULTS; } }
  function save(){ localStorage.setItem('finapp_data_v2', JSON.stringify(state)); }
  var state = load();

  // ===== Navegación =====
  var PANELS=[
    {key:'resumen', label:'Resumen'},
    {key:'registrar', label:'Registrar'},
    {key:'deudas', label:'Deudas'},
    {key:'categorias', label:'Categorías'},
    {key:'respaldo', label:'Respaldo'}
  ];
  var tabs = $('#tabs');
  PANELS.forEach(function(p){
    var b=document.createElement('button'); b.className='tab'; b.textContent=p.label; b.setAttribute('data-key', p.key); tabs.appendChild(b);
  });
  function show(key){
    qsa('#tabs .tab').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-key')===key); });
    PANELS.forEach(function(p){
      var el=document.getElementById('panel-'+p.key); if(!el) return; el.hidden = (p.key!==key);
    });
    if(key==='resumen') renderResumen();
    if(key==='registrar'){ renderTxTable(); fillSelectors(); }
    if(key==='deudas') renderDebts();
    if(key==='categorias') renderLists();
  }
  tabs.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('button.tab') : (e.target.matches && e.target.matches('button.tab') ? e.target : null);
    if(!btn) return; show(btn.getAttribute('data-key'));
  });
  show('resumen');

  // ===== Registrar Movimiento =====
  var currentType='Gasto';
  document.getElementById('type-expense').addEventListener('click', function(){ currentType='Gasto'; document.getElementById('chosenType').textContent='Tipo: Gasto'; });
  document.getElementById('type-income').addEventListener('click', function(){ currentType='Ingreso'; document.getElementById('chosenType').textContent='Tipo: Ingreso'; });
  document.getElementById('txDate').value = todayStr();

  function fillSelectors(){
    var cat=document.getElementById('txCategory'); var method=document.getElementById('txMethod');
    cat.innerHTML=''; method.innerHTML='';
    for(var i=0;i<state.categories.length;i++){ var o=document.createElement('option'); o.textContent=state.categories[i]; cat.appendChild(o); }
    for(var j=0;j<state.methods.length;j++){ var m=document.createElement('option'); m.textContent=state.methods[j]; method.appendChild(m); }
  }
  fillSelectors();

  function clearForm(){ document.getElementById('txAmount').value=''; document.getElementById('txDesc').value=''; document.getElementById('txNote').value=''; document.getElementById('txDate').value=todayStr(); }
  document.getElementById('clearTx').addEventListener('click', clearForm);

  function addTx(){
    var t={
      id: uid(),
      date: document.getElementById('txDate').value || todayStr(),
      type: currentType,
      description: (document.getElementById('txDesc').value||'').trim() || (currentType==='Gasto'?'Gasto':'Ingreso'),
      category: document.getElementById('txCategory').value,
      method: document.getElementById('txMethod').value,
      amount: Number(document.getElementById('txAmount').value||0),
      note: (document.getElementById('txNote').value||'').trim()
    };
    if(!(t.amount>0)){ alert('Ingresa un monto mayor a 0'); return; }
    state.transactions.unshift(t); save(); renderTxTable(); clearForm(); renderResumen();
  }
  document.getElementById('saveTx').addEventListener('click', addTx);
  document.addEventListener('keydown', function(e){
    if(e.key==='Enter' && !e.shiftKey){
      var tag = (document.activeElement && document.activeElement.tagName||'').toLowerCase();
      if(tag==='input' || tag==='select' || tag==='textarea' || tag==='button'){ e.preventDefault(); addTx(); }
    }
  });

  // ===== Tabla Movimientos =====
  function renderTxTable(){
    var q = (document.getElementById('search').value||'').toLowerCase();
    var ty = document.getElementById('filterType').value || 'all';
    var m  = document.getElementById('filterMonth').value; // yyyy-mm
    var rows = state.transactions.slice();
    if(q){ rows = rows.filter(function(r){ return (r.description+' '+r.category+' '+r.method).toLowerCase().indexOf(q)>-1; }); }
    if(ty!=='all'){ rows=rows.filter(function(r){ return r.type===ty; }); }
    if(m){ rows=rows.filter(function(r){ return r.date && r.date.indexOf(m)===0; }); }

    var html = "<tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Método</th><th class='right'>Monto</th><th></th></tr>";
    for(var i=0;i<rows.length;i++){
      var r=rows[i]; var sign = r.type==='Gasto'?-1:1;
      html += "<tr>"
        + "<td>"+(r.date||'')+"</td>"
        + "<td><span class='pill'>"+r.type+"</span></td>"
        + "<td>"+escapeHtml(r.description)+"</td>"
        + "<td>"+escapeHtml(r.category)+"</td>"
        + "<td>"+escapeHtml(r.method)+"</td>"
        + "<td class='right mono "+(sign<0?'bad':'ok')+"'>"+fmtMoney(sign*r.amount)+"</td>"
        + "<td class='right'><button data-id='"+r.id+"' class='ghost delTx'>Eliminar</button></td>"
        + "</tr>";
    }
    document.getElementById('txTable').innerHTML=html;
  }
  document.getElementById('search').addEventListener('input', renderTxTable);
  document.getElementById('filterType').addEventListener('change', renderTxTable);
  document.getElementById('filterMonth').addEventListener('change', renderTxTable);
  document.getElementById('resetFilters').addEventListener('click', function(){
    document.getElementById('search').value=''; document.getElementById('filterType').value='all'; document.getElementById('filterMonth').value=''; renderTxTable();
  });
  document.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('button.delTx') : null; if(!btn) return;
    var id=btn.getAttribute('data-id'); state.transactions = state.transactions.filter(function(t){ return t.id!==id; }); save(); renderTxTable(); renderResumen();
  });

  // ===== Resumen =====
  function sumPeriod(start,end){
    var tx = state.transactions.filter(function(t){ var d=new Date(t.date); return d>=start && d<=end; });
    var income = tx.filter(function(t){return t.type==='Ingreso';}).reduce(function(a,b){return a+(b.amount||0);},0);
    var expense = tx.filter(function(t){return t.type==='Gasto';}).reduce(function(a,b){return a+(b.amount||0);},0);
    return {income:income, expense:expense, balance: income-expense, list: tx};
  }
  function renderResumen(){
    var now=new Date();
    var m = sumPeriod(startOfMonth(now), endOfMonth(now));
    var w = sumPeriod(startOfWeek(now), endOfWeek(now));
    var t = sumPeriod(new Date(now.toDateString()), new Date(now.toDateString()));
    document.getElementById('mIncome').textContent=fmtMoney(m.income);
    document.getElementById('mExpense').textContent=fmtMoney(m.expense);
    document.getElementById('mBalance').textContent=fmtMoney(m.balance);
    document.getElementById('wIncome').textContent=fmtMoney(w.income);
    document.getElementById('wExpense').textContent=fmtMoney(w.expense);
    document.getElementById('wBalance').textContent=fmtMoney(w.balance);
    document.getElementById('tIncome').textContent=fmtMoney(t.income);
    document.getElementById('tExpense').textContent=fmtMoney(t.expense);
    document.getElementById('tBalance').textContent=fmtMoney(t.balance);

    var min = state.debts.reduce(function(a,b){return a+(Number(b.min)||0);},0);
    document.getElementById('minDebt').textContent=fmtMoney(min);

    var goal = (state.savePercent/100)*(m.income||0);
    var current = Math.max(0, m.income - m.expense);
    document.getElementById('mSaveGoal').textContent=fmtMoney(goal);
    document.getElementById('mSaveNow').textContent=fmtMoney(current);
    var pct = goal? Math.min(100, Math.round(100*current/goal)) : 0;
    document.getElementById('mSaveBar').style.width = pct+'%';

    // top categorías semana
    var byCat = {};
    w.list.filter(function(x){return x.type==='Gasto';}).forEach(function(x){ byCat[x.category]=(byCat[x.category]||0)+x.amount; });
    var items = Object.keys(byCat).map(function(k){return [k,byCat[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
    document.getElementById('wCats').innerHTML = items.length? items.map(function(it){
      return "<div class='row'><span class='pill'>"+escapeHtml(it[0])+"</span><strong class='mono bad'>"+fmtMoney(it[1])+"</strong></div>";
    }).join('') : '<span class="muted">Sin datos</span>';

    // gastos por categoría (mes)
    var byCatM={};
    m.list.filter(function(x){return x.type==='Gasto';}).forEach(function(x){ byCatM[x.category]=(byCatM[x.category]||0)+x.amount; });
    var totalG = m.expense||1;
    var html = Object.keys(byCatM).map(function(k){ return [k,byCatM[k]]; })
      .sort(function(a,b){return b[1]-a[1];})
      .map(function(pair){
        var c=pair[0], v=pair[1];
        var p = Math.round(100*v/totalG);
        return "<div class='row' style='justify-content:space-between;margin:6px 0'>"
          + "<div class='row' style='gap:8px'><span class='pill'>"+escapeHtml(c)+"</span> <span class='muted'>"+p+"% del gasto</span></div>"
          + "<strong class='mono bad'>"+fmtMoney(v)+"</strong>"
          + "</div>"
          + "<div class='bar' title='Participación mensual'><em style='width:"+p+"%'></em></div>";
      }).join('') || '<span class="muted">Sin datos</span>';
    document.getElementById('catsBreak').innerHTML=html;
  }
  document.getElementById('applyBudget').addEventListener('click', function(){
    var v=Number(document.getElementById('budgetInput').value||0);
    document.getElementById('budgetInput').setAttribute('data-applied', String(v));
    renderResumen();
  });

  // ===== Deudas =====
  function clearDebt(){ document.getElementById('dbCreditor').value=''; document.getElementById('dbType').value='TC'; document.getElementById('dbAmount').value=''; document.getElementById('dbAnnual').value=''; document.getElementById('dbMin').value=''; document.getElementById('dbCut').value=''; }
  document.getElementById('clearDebt').addEventListener('click', clearDebt);
  function addDebt(){
    var d={id:uid(), creditor:(document.getElementById('dbCreditor').value||'').trim(), type:document.getElementById('dbType').value, amount:Number(document.getElementById('dbAmount').value||0), annual:Number(document.getElementById('dbAnnual').value||0), min:Number(document.getElementById('dbMin').value||0), cut:document.getElementById('dbCut').value, note:''};
    if(!d.creditor){ alert('Ingresa el acreedor'); return; }
    state.debts.unshift(d); save(); renderDebts(); clearDebt(); renderResumen();
  }
  document.getElementById('saveDebt').addEventListener('click', addDebt);
  document.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('button.delDebt') : null; if(!btn) return;
    var id = btn.getAttribute('data-id'); state.debts = state.debts.filter(function(x){ return x.id!==id; }); save(); renderDebts(); renderResumen();
  });
  function renderDebts(){
    var html = "<tr><th>Acreedor</th><th>Tipo</th><th class='right'>Adeudado</th><th class='right'>Tasa anual</th><th class='right'>Mínimo/mes</th><th>Corte</th><th></th></tr>";
    for(var i=0;i<state.debts.length;i++){
      var d=state.debts[i];
      html += "<tr>"
        + "<td>"+escapeHtml(d.creditor)+"</td>"
        + "<td>"+escapeHtml(d.type)+"</td>"
        + "<td class='right mono'>"+fmtMoney(d.amount||0)+"</td>"
        + "<td class='right mono'>"+((d.annual||0).toLocaleString('es-CO',{maximumFractionDigits:2}))+"%</td>"
        + "<td class='right mono'>"+fmtMoney(d.min||0)+"</td>"
        + "<td>"+(d.cut||"")+"</td>"
        + "<td class='right'><button class='ghost delDebt' data-id='"+d.id+"'>Eliminar</button></td>"
        + "</tr>";
    }
    document.getElementById('dbTable').innerHTML=html;
  }

  // ===== Categorías & Métodos =====
  function renderLists(){
    var c = state.categories.map(function(x,i){ return "<span class='tag pill' data-i='"+i+"'>"+escapeHtml(x)+" <button title='Eliminar' data-i='"+i+"' class='ghost' style='padding:2px 6px;margin-left:6px'>x</button></span>"; }).join('');
    document.getElementById('catList').innerHTML = c || '<span class="muted">Sin categorías</span>';
    var m = state.methods.map(function(x,i){ return "<span class='tag pill' data-i='"+i+"'>"+escapeHtml(x)+" <button title='Eliminar' data-i='"+i+"' class='ghost' style='padding:2px 6px;margin-left:6px'>x</button></span>"; }).join('');
    document.getElementById('methodList').innerHTML = m || '<span class="muted">Sin métodos</span>';
    document.getElementById('savePct').value = Number(state.savePercent||0);
  }
  document.getElementById('addCat').addEventListener('click', function(){ var v=(document.getElementById('newCat').value||'').trim(); if(!v) return; if(state.categories.indexOf(v)===-1) state.categories.push(v); document.getElementById('newCat').value=''; save(); renderLists(); fillSelectors(); });
  document.getElementById('addMethod').addEventListener('click', function(){ var v=(document.getElementById('newMethod').value||'').trim(); if(!v) return; if(state.methods.indexOf(v)===-1) state.methods.push(v); document.getElementById('newMethod').value=''; save(); renderLists(); fillSelectors(); });
  document.getElementById('catList').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; var i=Number(b.getAttribute('data-i')); state.categories.splice(i,1); save(); renderLists(); fillSelectors(); });
  document.getElementById('methodList').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; var i=Number(b.getAttribute('data-i')); state.methods.splice(i,1); save(); renderLists(); fillSelectors(); });
  document.getElementById('saveSettings').addEventListener('click', function(){ var p = Number(document.getElementById('savePct').value||0); state.savePercent = Math.max(0, Math.min(100,p)); save(); renderResumen(); alert('Ajustes guardados'); });

  // ===== Respaldo / Importar =====
  function download(filename, text){
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text], {type:'application/octet-stream'})); a.download=filename; a.click(); URL.revokeObjectURL(a.href);
  }
  document.getElementById('exportJSON').addEventListener('click', function(){
    download("finapp_"+new Date().toISOString().slice(0,10)+".json", JSON.stringify(state, null, 2));
  });
  document.getElementById('exportCSV').addEventListener('click', function(){
    var hdr=['date','type','description','category','method','amount','note'];
    var lines=[hdr.join(',')];
    for(var i=0;i<state.transactions.length;i++){
      var t=state.transactions[i]; var row=[];
      for(var j=0;j<hdr.length;j++){
        var k=hdr[j]; var val = (t[k]==null?'':String(t[k])).replace(/"/g,'\"');
        row.push('"'+val+'"');
      }
      lines.push(row.join(','));
    }
    download("movimientos_"+new Date().toISOString().slice(0,10)+".csv", lines.join('\n'));
  });
  document.getElementById('importBtn').addEventListener('click', function(){
    var f=document.getElementById('importFile').files[0]; if(!f){ alert('Elige un archivo .json o .csv'); return; }
    var reader=new FileReader();
    reader.onload=function(e){
      try{
        if((f.name||'').toLowerCase().indexOf('.json')>-1){
          var obj=JSON.parse(e.target.result);
          if(!obj.transactions){ throw new Error('JSON inválido'); }
          state=obj; save(); show('resumen'); alert('Importación JSON completada');
        } else {
          var arr=parseCSV(e.target.result);
          var tx=[];
          for(var i=0;i<arr.length;i++){
            var row=arr[i];
            var o={
              id: uid(),
              date: row['Fecha']||row['fecha']||row['date']||row['Date']|| todayStr(),
              type: String(row['Tipo']||row['type']||row['Type']||'Gasto').toLowerCase().indexOf('ing')>-1?'Ingreso':'Gasto',
              description: row['Descripción']||row['descripcion']||row['Description']||row['desc']||'',
              category: row['Categoría']||row['categoria']||row['Category']||'Otros',
              method: row['Método de pago']||row['Metodo']||row['method']||'Efectivo',
              amount: Number(String(row['Monto']||row['amount']||'0').replace(/[^0-9.]/g,''))||0,
              note: row['Nota']||row['note']||''
            };
            if(o.amount>0) tx.push(o);
          }
          state.transactions = tx.concat(state.transactions);
          save(); show('registrar'); alert('Importadas '+tx.length+' filas de CSV');
        }
      }catch(err){ alert('No se pudo importar: '+err.message); }
    };
    reader.readAsText(f);
  });
  document.getElementById('resetAll').addEventListener('click', function(){
    if(confirm('Esto borrará todos tus datos de este navegador. ¿Continuar?')){
      localStorage.removeItem('finapp_data_v2'); state=load(); save(); show('resumen');
    }
  });

})();