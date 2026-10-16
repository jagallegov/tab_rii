/* ====================================================================== */
/*  Registro de Intención de Inscripción (RII), período 2026-2S           */
/*  Universidad Nacional de Colombia                                      */
/*                                                                        */
/*  Tres secciones: diligenciamiento del RII, obligatorias declaradas e   */
/*  inscritas, e índice de satisfacción con la inscripción. Este archivo  */
/*  se transpila en el navegador con Babel standalone y consulta los      */
/*  datos del objeto global window.RII.                                   */
/* ====================================================================== */

const { useState, useMemo, useRef, useEffect, useCallback } = React;

const DEF = window.RII.definiciones;
const X = window.RII.datos;
const C = X.catalogos;

const F = {};
X.campos.forEach((c, i) => { F[c] = X.filas[i]; });
const NF = F.resp.length;
C.respondio = ['No', 'Sí'];
F.respondio = F.resp;

/* Dimensiones filtrables: catálogo y columna de índices. */
const NOMBRES_DIM = ['facultad', 'uab', 'programa', 'via', 'grupo', 'subgrupo', 'respondio'];

/* Segunda tabla: estudiantes citados, para el balance de la inscripción. */
const FC = {};
X.cit.campos.forEach((c, i) => { FC[c] = X.cit.filas[i]; });
const NC = FC.hi.length;

const TABLA_H = { n: NF, dims: NOMBRES_DIM.map(k => ({ k, cat: C[k], col: F[k] })) };
const TABLA_C = { n: NC, dims: NOMBRES_DIM.map(k => ({ k, cat: C[k], col: FC[k] })) };


/* ------------------------------------------------------------ formatos */
const fEnt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const f1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const vacio = v => v === null || v === undefined || (typeof v === 'number' && isNaN(v));
const num = v => (vacio(v) ? '—' : fEnt.format(Math.round(v)));
const dec = (v, n = 1) => (vacio(v) ? '—' : (n === 1 ? f1.format(v) : v.toFixed(n).replace('.', ',')));
const pct = (v, n = 1) => (vacio(v) ? '—' : dec(v, n) + '%');
const pts = v => (vacio(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + dec(Math.abs(v)));

const cortoDim = d => (DEF.dimensiones[d] || {}).corto || d;

const clave = t =>
  't-' + String(t).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const SECCIONES = [
  { id: 'respuesta', rotulo: 'Diligenciamiento del RII' },
  { id: 'obligatorias', rotulo: 'Obligatorias declaradas e inscritas' },
  { id: 'satisfaccion', rotulo: 'Índice de satisfacción con la inscripción' },
  { id: 'balance', rotulo: 'Balance de la inscripción' }
];

/* ==================================================================== */
/*  Motor de consulta                                                    */
/* ==================================================================== */

function crearConsulta(seleccion, tabla) {
  const DIMS = tabla.dims, NF = tabla.n, DIM = {};
  DIMS.forEach(d => { DIM[d.k] = d; });
  const sel = {};
  DIMS.forEach(d => {
    const lista = seleccion[d.k];
    if (lista && lista.length) {
      const m = {};
      lista.forEach(c => { const i = d.cat.indexOf(c); if (i >= 0) m[i] = true; });
      sel[d.k] = m;
    }
  });
  const pasa = (i, omitir) => {
    for (let k = 0; k < DIMS.length; k++) {
      const d = DIMS[k];
      if (d.k === omitir) continue;
      const s = sel[d.k];
      if (s && !s[d.col[i]]) return false;
    }
    return true;
  };
  const filtrar = omitir => {
    const f = [];
    for (let i = 0; i < NF; i++) if (pasa(i, omitir)) f.push(i);
    return f;
  };
  const filas = filtrar(null);
  const opciones = dim => {
    const d = DIM[dim];
    const hay = {};
    for (let i = 0; i < NF; i++) if (pasa(i, dim)) hay[d.col[i]] = true;
    return d.cat.filter((c, j) => hay[j]);
  };
  return { filas, filtrar, opciones };
}

/** Balance de la inscripción de los estudiantes citados, a los dos cortes. */
function resumenC(filas) {
  const r = { n: filas.length, resp: 0, hi: 0, hf: 0, ai: 0, af: 0, ci: 0, cf: 0, blq: 0 };
  filas.forEach(i => {
    r.resp += FC.respondio[i]; r.hi += FC.hi[i]; r.hf += FC.hf[i];
    r.ai += FC.ai[i]; r.af += FC.af[i]; r.ci += FC.ci[i]; r.cf += FC.cf[i]; r.blq += FC.blq[i];
  });
  const p = (a, b) => (b ? 100 * a / b : null);
  r.pI = p(r.hi, r.n); r.pF = p(r.hf, r.n);
  r.dif = r.n ? r.pF - r.pI : null;
  r.asI = r.hi ? r.ai / r.hi : null; r.asF = r.hf ? r.af / r.hf : null;
  r.crI = r.hi ? r.ci / r.hi : null; r.crF = r.hf ? r.cf / r.hf : null;
  r.pBlq = p(r.blq, r.n);
  return r;
}

function agrupar(filas, col) {
  const g = {};
  filas.forEach(i => { const k = col[i]; (g[k] = g[k] || []).push(i); });
  return g;
}

/** Medidas de un conjunto de filas. El índice se calcula sobre los estudiantes con
    obligatorias declaradas e inscripción (dec mayor que 0). */
function resumen(filas) {
  const r = { n: filas.length, resp: 0, nR: 0, dec: 0, sat: 0, satFin: 0,
    sumIdx: 0, sumFin: 0, todo: 0, cero: 0, baja: 0 };
  filas.forEach(i => {
    r.resp += F.resp[i];
    const d = F.dec[i];
    if (d > 0) {
      const s = F.sat[i], f = F.sat_fin[i];
      r.nR++; r.dec += d; r.sat += s; r.satFin += f;
      r.sumIdx += s / d; r.sumFin += f / d;
      if (s === d) r.todo++;
      if (s === 0) r.cero++;
      if (s / d < 0.5) r.baja++;
    }
  });
  r.tasa = r.n ? 100 * r.resp / r.n : null;
  r.idx = r.nR ? 100 * r.sumIdx / r.nR : null;
  r.idxFin = r.nR ? 100 * r.sumFin / r.nR : null;
  r.decProm = r.nR ? r.dec / r.nR : null;
  r.satProm = r.nR ? r.sat / r.nR : null;
  r.finProm = r.nR ? r.satFin / r.nR : null;
  r.pTodo = r.nR ? 100 * r.todo / r.nR : null;
  r.pCero = r.nR ? 100 * r.cero / r.nR : null;
  r.pBaja = r.nR ? 100 * r.baja / r.nR : null;
  return r;
}

function Tarjeta({ titulo, accion, children }) {
  return (
    <section className="dsh-card">
      <div className="dsh-card-h">
        <h2>{titulo}</h2>
        {accion || null}
      </div>
      <div className="dsh-cuerpo">{children}</div>
    </section>
  );
}

function descargarCsv(nombreArchivo, encabezados, filas) {
  const celda = v => {
    if (vacio(v)) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    const t = String(v);
    return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const texto = [encabezados].concat(filas).map(f => f.map(celda).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + texto], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const nombreArchivo = partes =>
  partes.filter(Boolean).map(clave).join('_').replace(/^t-/, '').replace(/_t-/g, '_');

const TIPO_LETRA = 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function descargarPng(ec, nombreSalida, titulo) {
  const pr = 3;
  const base = ec.getDataURL({ type: 'png', pixelRatio: pr, backgroundColor: '#fff' });
  const img = new Image();
  img.onload = function () {
    const cabecera = 74 * pr, pie = 34 * pr, margen = 20 * pr;
    const lienzo = document.createElement('canvas');
    lienzo.width = img.width;
    lienzo.height = img.height + cabecera + pie;
    const c = lienzo.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, lienzo.width, lienzo.height);
    c.textBaseline = 'middle';
    c.fillStyle = '#242627';
    c.font = '600 ' + 15 * pr + 'px ' + TIPO_LETRA;
    c.fillText(titulo, margen, 30 * pr);
    c.fillStyle = '#677d29';
    c.font = '600 ' + 10 * pr + 'px ' + TIPO_LETRA;
    c.fillText('Universidad Nacional de Colombia · Sede Medellín', margen, 54 * pr);
    c.strokeStyle = '#dcdcdc';
    c.lineWidth = 1 * pr;
    c.beginPath();
    c.moveTo(margen, cabecera - 6 * pr);
    c.lineTo(lienzo.width - margen, cabecera - 6 * pr);
    c.stroke();
    c.drawImage(img, 0, cabecera);
    c.fillStyle = '#a2a3a4';
    c.font = 10 * pr + 'px ' + TIPO_LETRA;
    c.fillText(DEF.fuenteCorta, margen, img.height + cabecera + pie / 2);
    const a = document.createElement('a');
    a.href = lienzo.toDataURL('image/png');
    a.download = nombreSalida + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  img.src = base;
}

function Descargas({ csv, instancia, nombre, titulo, extra }) {
  return (
    <span className="dsh-acc">
      {extra || null}
      {csv ? (
        <button type="button" className="dsh-ico" title="Descargar los datos agregados en CSV"
          aria-label="Descargar los datos agregados en CSV"
          onClick={() => { const d = csv(); if (d) descargarCsv(nombre, d.encabezados, d.filas); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v10.2l3.6-3.6L17 11l-5 5-5-5 1.4-1.4L12 13.2V3h0ZM5 18h14v2H5v-2Z" />
          </svg>
        </button>
      ) : null}
      {instancia ? (
        <button type="button" className="dsh-ico" title="Descargar el gráfico en PNG"
          aria-label="Descargar el gráfico en PNG"
          onClick={() => { const ec = instancia.current; if (ec) descargarPng(ec, nombre, titulo); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 12h14l-4.5-6-3.5 4.5-2.2-2.7L5 17Zm3.2-6.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" />
          </svg>
        </button>
      ) : null}
    </span>
  );
}

const MARGEN_EJE = 34;
const ALTO_LINEA_LEYENDA = 24;
const HOLGURA_LEYENDA = 10;

let medidor = null;
function anchoTexto(texto, fuente) {
  if (!medidor) {
    const lienzo = document.createElement('canvas');
    medidor = lienzo.getContext ? lienzo.getContext('2d') : null;
  }
  if (!medidor) return String(texto).length * 7;
  medidor.font = fuente;
  return medidor.measureText(String(texto)).width;
}

function ajustarLeyenda(inst, opcion) {
  if (!inst || !opcion || !opcion.rotulosLeyenda || !opcion.rotulosLeyenda.length) return;
  if (typeof inst.getWidth !== 'function') return;
  const disponible = Math.max(200, inst.getWidth() * 0.90 - 32);
  const fuente = '11px ' + TIPO_LETRA;
  const anchos = opcion.rotulosLeyenda.map(n => (11 + 5 + anchoTexto(n, fuente)) * 1.12);
  let lineas = 1;
  let usado = 0;
  anchos.forEach(a => {
    const necesita = usado ? usado + 18 + a : a;
    if (necesita > disponible && usado > 0) { lineas += 1; usado = a; }
    else { usado = necesita; }
  });
  inst.setOption({
    grid: { bottom: MARGEN_EJE + lineas * ALTO_LINEA_LEYENDA + HOLGURA_LEYENDA }
  });
}

function Grafico({ opcion, alto, instancia, alSeleccionar, altoLienzo }) {
  const caja = useRef(null);
  const inst = useRef(null);
  const cb = useRef(alSeleccionar);
  cb.current = alSeleccionar;
  const opcionRef = useRef(opcion);
  opcionRef.current = opcion;

  useEffect(() => {
    if (!window.echarts || !caja.current) return undefined;
    inst.current = window.echarts.init(caja.current, null, { renderer: 'canvas' });
    if (instancia) instancia.current = inst.current;
    inst.current.on('click', p => { if (cb.current) cb.current(p.name, p); });
    const redimensionar = () => {
      if (!inst.current) return;
      inst.current.resize();
      ajustarLeyenda(inst.current, opcionRef.current);
    };
    let obs = null;
    if (window.ResizeObserver) {
      obs = new window.ResizeObserver(redimensionar);
      obs.observe(caja.current);
    }
    window.addEventListener('resize', redimensionar);
    return () => {
      window.removeEventListener('resize', redimensionar);
      if (obs) obs.disconnect();
      if (inst.current) inst.current.dispose();
      inst.current = null;
      if (instancia) instancia.current = null;
    };
  }, []);

  useEffect(() => {
    if (inst.current && opcion) {
      inst.current.setOption(opcion, true);
      ajustarLeyenda(inst.current, opcion);
    }
  }, [opcion]);

  useEffect(() => { if (inst.current) inst.current.resize(); }, [altoLienzo]);

  if (!window.echarts) {
    return <p className="dsh-vacio">Los gráficos no están disponibles en esta sesión.</p>;
  }
  const estilo = { cursor: alSeleccionar ? 'pointer' : 'default' };
  if (altoLienzo) estilo.height = altoLienzo + 'px';
  return (
    <div className="dsh-scroll" style={{ maxHeight: altoLienzo ? 420 : undefined }}>
      <div ref={caja} className={'dsh-grafico ' + (alto || '')} style={estilo} />
    </div>
  );
}

function TarjetaGrafico({ titulo, alto, opcion, csv, archivo, alSeleccionar,
  altoLienzo, extra }) {
  const instancia = useRef(null);
  return (
    <Tarjeta titulo={titulo}
      accion={<Descargas csv={csv} instancia={instancia} nombre={archivo}
        titulo={titulo} extra={extra} />}>
      {opcion
        ? <Grafico opcion={opcion} alto={alto} instancia={instancia}
            alSeleccionar={alSeleccionar} altoLienzo={altoLienzo} />
        : <p className="dsh-vacio">Sin datos para la selección vigente.</p>}
    </Tarjeta>
  );
}

function Segmento({ etiqueta, opciones, valor, onCambio }) {
  return (
    <div className="dsh-segmento compacto" role="group" aria-label={etiqueta}>
      {opciones.map(o => (
        <button key={o.valor} type="button" aria-pressed={valor === o.valor}
          onClick={() => onCambio(o.valor)}>{o.texto}</button>
      ))}
    </div>
  );
}

function Tabla({ columnas, filas, ordenInicial, alSeleccionar, altura }) {
  const [orden, setOrden] = useState(ordenInicial || { col: 0, asc: true });
  const ordenadas = useMemo(() => {
    const c = columnas[orden.col];
    const copia = filas.slice();
    copia.sort((a, b) => {
      const va = c.val(a), vb = c.val(b);
      if (vacio(va)) return 1;
      if (vacio(vb)) return -1;
      const r = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
      return orden.asc ? r : -r;
    });
    return copia;
  }, [columnas, filas, orden]);

  const clic = i => setOrden(o =>
    (o.col === i ? { col: i, asc: !o.asc } : { col: i, asc: !columnas[i].num }));

  if (!filas.length) {
    return <p className="dsh-vacio">Sin registros para la selección vigente.</p>;
  }
  return (
    <div className="dsh-tabla-wrap" style={{ maxHeight: altura || 430 }}>
      <table className="dsh-tabla">
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th key={c.tit} className={(c.fija ? 'fija' : '') + (c.num ? ' num' : '')}
                onClick={() => clic(i)}>
                {c.tit}
                {orden.col === i ? <span className="ord"> {orden.asc ? '▲' : '▼'}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f, i) => (
            <tr key={i} style={alSeleccionar ? { cursor: 'pointer' } : null}
              onClick={() => alSeleccionar && alSeleccionar(f)}>
              {columnas.map(c => (
                <td key={c.tit} className={(c.fija ? 'fija' : '') + (c.num ? ' num' : '')}>
                  {c.txt(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ icono, fondo, etiqueta, valor, pie }) {
  return (
    <div className="dsh-kpi">
      <span className="dsh-kpi-ic" style={{ background: fondo }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icono} /></svg>
      </span>
      <span>
        <span className="dsh-kpi-lab">{etiqueta}</span>
        <span className="dsh-kpi-val">{valor}</span>
        {pie ? <span className="dsh-kpi-pie">{pie}</span> : null}
      </span>
    </div>
  );
}

const IC = {
  visto: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z',
  equis: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4Z',
  circulo: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-1-5h2v2h-2v-2Zm0-8h2v6h-2V7Z',
  tasa: 'M3.5 18.5 9 13l4 4 7.5-7.5-1.4-1.4L13 14.2l-4-4-6.9 6.9 1.4 1.4Z',
  doc: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v1.6H8V12Zm0 3.4h8V17H8v-1.6Z',
  malla: 'M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z',
  persona: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5Z'
};
/* ==================================================================== */
/*  Opciones de los gráficos                                             */
/* ==================================================================== */

const baseOpcion = () => ({
  textStyle: { fontFamily: TIPO_LETRA, fontSize: 11, color: '#4e5254' },
  animationDuration: 350,
  grid: { left: 66, right: 26, top: 42,
    bottom: MARGEN_EJE + ALTO_LINEA_LEYENDA + HOLGURA_LEYENDA },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#ffffff', borderColor: '#dcdcdc', borderWidth: 1,
    textStyle: { color: '#242627', fontSize: 11, fontFamily: TIPO_LETRA },
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(103,125,41,.06)' } }
  },
  legend: {
    top: null, bottom: 6, left: 'center', width: '94%',
    type: 'plain', orient: 'horizontal', icon: 'roundRect',
    itemWidth: 11, itemHeight: 11, itemGap: 18, padding: [2, 6],
    textStyle: { color: '#4e5254', fontSize: 11 }
  }
});

const ejeValor = (formato, nombre, extra) => Object.assign({
  type: 'value',
  name: nombre || '', nameLocation: 'middle',
  nameTextStyle: { color: '#4e5254', fontSize: 11 },
  axisLine: { show: false }, axisTick: { show: false },
  splitLine: { show: false },
  axisLabel: { color: '#4e5254', fontSize: 10, formatter: formato || (v => fEnt.format(v)) }
}, extra || {});

const ejeCategoria = (datos, extra) => Object.assign({
  type: 'category', data: datos,
  axisLine: { lineStyle: { color: '#dcdcdc' } },
  axisTick: { show: false },
  axisLabel: { color: '#4e5254', fontSize: 10, interval: 0 }
}, extra || {});

/** Descarta las series sin valores visibles (menos del 0,5% del total). */
function soloConValor(series) {
  const val = v => (v && typeof v === 'object' ? v.value : v);
  const sumaAbs = s => s.datos.reduce((a, v) => a + Math.abs(val(v) || 0), 0);
  const total = series.reduce((a, s) => a + sumaAbs(s), 0);
  return series.filter(s => sumaAbs(s) > 0 && sumaAbs(s) >= 0.005 * total);
}

/** Barras verticales por período, simples o apiladas. */
function opcionPeriodos(periodos, series, o) {
  o = o || {};
  const op = baseOpcion();
  op.grid = { left: 62, right: 26, top: 36, bottom: MARGEN_EJE + ALTO_LINEA_LEYENDA + HOLGURA_LEYENDA };
  op.xAxis = ejeCategoria(periodos);
  op.yAxis = ejeValor(o.formatoEje, o.nombreEje, Object.assign(
    { nameGap: 46 }, o.pct ? { max: 100 } : {}));
  if (o.formatoTooltip) op.tooltip.valueFormatter = o.formatoTooltip;
  if (o.tooltipPct) {
    op.tooltip.formatter = ps => {
      const t = ps[0].axisValueLabel;
      return '<b>' + t + '</b><br/>' + ps.map(p =>
        p.marker + p.seriesName + ': ' + pct(p.value) +
        ' (' + num(o.conteos[p.seriesName][p.dataIndex]) + ')').join('<br/>');
    };
  }
  series = soloConValor(series);
  op.series = series.map(s => Object.assign({
    name: s.nombre, type: s.tipo || 'bar', data: s.datos,
    stack: o.apilado ? 'a' : undefined, barMaxWidth: 34,
    itemStyle: { color: s.color }
  }, s.extra || {}));
  op.rotulosLeyenda = series.map(s => s.nombre);
  if (series.length < 2) op.legend = { show: false };
  return op;
}

/** Barras horizontales por categoría, simples o apiladas. */
function opcionCategorias(nombres, series, o) {
  o = o || {};
  const op = baseOpcion();
  const ancho = nombres.reduce((a, n) => Math.max(a, String(n).length), 0);
  op.grid = { left: Math.min(240, 24 + ancho * 5.6), right: 52, top: 14,
    bottom: series.length > 1 ? MARGEN_EJE + 10 : 38 };
  op.xAxis = ejeValor(o.formatoEje, '', Object.assign({ nameGap: 0 }, o.pct ? { max: 100 } : {}));
  op.yAxis = ejeCategoria(nombres, { inverse: true });
  if (o.formatoTooltip) op.tooltip.valueFormatter = o.formatoTooltip;
  if (o.tooltipPct) {
    op.tooltip.formatter = ps => {
      const t = ps[0].axisValueLabel;
      return '<b>' + t + '</b><br/>' + ps.map(p =>
        p.marker + p.seriesName + ': ' + pct(p.value) +
        ' (' + num(o.conteos[p.seriesName][p.dataIndex]) + ')').join('<br/>');
    };
  }
  series = soloConValor(series);
  op.series = series.map(s => ({
    name: s.nombre, type: 'bar', stack: o.apilado ? 'a' : undefined,
    data: s.datos, barMaxWidth: 22, itemStyle: { color: s.color },
    label: o.etiquetas ? { show: true, position: 'right', color: '#242627', fontSize: 10,
      formatter: p => (o.fmtEtiqueta ? o.fmtEtiqueta(p.value) : fEnt.format(p.value)) } : undefined
  }));
  op.rotulosLeyenda = series.map(s => s.nombre);
  if (series.length < 2) op.legend = { show: false };
  return op;
}


function Seleccion({ seleccion, quitar, limpiar }) {
  const fichas = [];
  Object.keys(seleccion).forEach(d => {
    (seleccion[d] || []).forEach(c => fichas.push({ dim: d, cat: c }));
  });
  if (!fichas.length) return null;
  return (
    <div className="dsh-seleccion">
      <b>Selección activa:</b>
      {fichas.map(f => (
        <button key={f.dim + '|' + f.cat} type="button" className="dsh-quitar"
          onClick={() => quitar(f.dim, f.cat)}>
          {cortoDim(f.dim)}: {f.cat}
          <span aria-hidden="true">×</span>
        </button>
      ))}
      <button type="button" className="dsh-limpiar-sel" onClick={limpiar}>Quitar todo</button>
    </div>
  );
}

/* ==================================================================== */
/*  Filtros                                                              */
/* ==================================================================== */

function Filtros({ seleccion, fijar, limpiar, Q }) {
  const unico = dim => {
    const vigentes = Q.opciones(dim);
    const elegida = (seleccion[dim] || [])[0];
    const lista = elegida && vigentes.indexOf(elegida) < 0
      ? [elegida].concat(vigentes) : vigentes;
    return (
      <select className="dsh-select" value={elegida || ''}
        onChange={e => fijar(dim, e.target.value ? [e.target.value] : [])}>
        <option value="">Todas ({lista.length})</option>
        {lista.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  };
  const campo = (etiqueta, control) => (
    <div className="dsh-campo">
      <span className="dsh-leyenda">{etiqueta}</span>
      {control}
    </div>
  );
  return (
    <section className="dsh-filtros" aria-label="Filtros">
      <div className="dsh-grid-f f-4">
        {campo('Facultad', unico('facultad'))}
        {campo('Unidad académica básica', unico('uab'))}
        {campo('Programa curricular', unico('programa'))}
        {campo('Vía de admisión', unico('via'))}
        {campo('Grupo de cita', unico('grupo'))}
        {campo('Subgrupo de cita', unico('subgrupo'))}
        {campo('Respondió el RII', unico('respondio'))}
      </div>
      <div className="dsh-acciones">
        <button className="dsh-btn" type="button" onClick={limpiar}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" />
          </svg>
          Borrar los filtros
        </button>
      </div>
    </section>
  );
}

/* ==================================================================== */
/*  Aplicación                                                           */
/* ==================================================================== */

const COLOR = { verde: '#677d29', ocre: '#EAAD13', gris: '#464646', lima: '#A9D12C', neutro: '#a2a3a4' };
const BINS_CUMPLE = ['Ninguna inscrita', 'Menos de la mitad', 'La mitad o más', 'Todas inscritas'];
const COLOR_CUMPLE = [COLOR.gris, COLOR.ocre, COLOR.lima, COLOR.verde];
const MIN_UAB = 10;

const ejePct = v => v + '%';

function App() {
  const [tab, setTab] = useState(0);
  const sec = SECCIONES[tab];
  const [seleccion, setSeleccion] = useState({});
  const refsTab = useRef([]);
  const firma = JSON.stringify(seleccion);
  const [corte, setCorte] = useState('ambos');
  const Qh = useMemo(() => crearConsulta(seleccion, TABLA_H), [firma]);
  const Qc = useMemo(() => crearConsulta(seleccion, TABLA_C), [firma]);
  const esBalance = sec.id === 'balance';
  const Q = esBalance ? Qc : Qh;

  const fijar = useCallback((dim, valores) => {
    setSeleccion(s => {
      const n = Object.assign({}, s);
      if (!valores || !valores.length) delete n[dim]; else n[dim] = valores;
      return n;
    });
  }, []);

  const alternar = useCallback((dim, categoria) => {
    setSeleccion(s => {
      const n = Object.assign({}, s);
      const actual = (n[dim] || []).slice();
      const i = actual.indexOf(categoria);
      if (i >= 0) actual.splice(i, 1); else actual.push(categoria);
      if (!actual.length) delete n[dim]; else n[dim] = actual;
      return n;
    });
  }, []);

  const teclas = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : SECCIONES.length - 1)) % SECCIONES.length;
    setTab(n);
    if (refsTab.current[n]) refsTab.current[n].focus();
  };

  useEffect(() => {
    const raiz = document.getElementById('root');
    if (raiz) raiz.dataset.montado = '1';
  }, []);

  const T = useMemo(() => resumen(Qh.filas), [Qh]);

  /* Grupos de filas por categoría de una dimensión, en el orden del catálogo. */
  const porDim = (filas, dim) => {
    const g = agrupar(filas, F[dim]);
    return C[dim].map((nombre, k) => ({ k, nombre, filas: g[k] || [] }))
      .filter(x => x.filas.length)
      .map(x => Object.assign(x, { r: resumen(x.filas) }));
  };

  /* Gráfico de una sola medida por categoría, con etiqueta al final. */
  const barras = (grupos, medida, nombre, color, dimClic, formato) => {
    const nombres = grupos.map(g => g.nombre);
    const op = opcionCategorias(nombres, [{ nombre, color,
      datos: grupos.map(g => g.r[medida] || 0) }],
      { etiquetas: true, pct: true, formatoEje: ejePct, fmtEtiqueta: v => pct(v) });
    op.tooltip.formatter = ps => '<b>' + ps[0].axisValueLabel + '</b><br/>' + nombre + ': ' + pct(ps[0].value) +
      '<br/>' + (formato ? formato(grupos[ps[0].dataIndex].r) : '');
    return { opcion: op,
      csv: () => ({ encabezados: [cortoDim(dimClic), nombre],
        filas: grupos.map(g => [g.nombre, g.r[medida]]) }),
      alSeleccionar: dimClic ? (n => alternar(dimClic, n)) : null };
  };

  /* ---------------------------------------------- sección 1 */
  const s1 = useMemo(() => {
    const fmtResp = null;
    const porFac = barras(porDim(Qh.filas, 'facultad'), 'tasa', 'Tasa de respuesta', COLOR.verde, 'facultad', fmtResp);
    const porVia = barras(porDim(Qh.filas, 'via'), 'tasa', 'Tasa de respuesta', COLOR.verde, 'via', fmtResp);
    const porSub = barras(porDim(Qh.filas, 'subgrupo'), 'tasa', 'Tasa de respuesta', COLOR.verde, 'subgrupo', fmtResp);

    /* Perfil: universo frente a respondientes. */
    const filas = [];
    const carac = [['via', 'Vía de admisión'], ['sexo', 'Sexo'], ['estrato', 'Estrato'],
      ['colegio', 'Tipo de colegio'], ['matriculas', 'Matrículas cursadas'], ['avance', 'Avance de carrera (%)']];
    const kSin = C.sexo.indexOf('Sin dato');
    const base = Qh.filas.filter(i => F.sexo[i] !== kSin);
    const nU = base.length, nR = resumen(base).resp;
    let o = 0;
    carac.forEach(([dim, rot]) => {
      const g = agrupar(base, F[dim]);
      C[dim].forEach((nombre, k) => {
        const f = g[k] || [];
        if (!f.length || nombre === 'Sin dato') return;
        const r = resumen(f);
        const pU = nU ? 100 * f.length / nU : null, pR = nR ? 100 * r.resp / nR : null;
        filas.push({ o: o++, car: rot, cat: nombre, n: f.length, resp: r.resp, pU, pR,
          dif: pU === null ? null : pR - pU, tasa: r.tasa });
      });
    });
    return { porVia, porFac, porSub, perfil: filas };
  }, [Qh, seleccion]);

  /* ---------------------------------------------- sección 2 */
  const s2 = useMemo(() => {
    const conDatos = Qh.filas.filter(i => F.dec[i] > 0);
    const subs = porDim(conDatos, 'subgrupo');
    const nombres = subs.map(g => g.nombre);

    const medias = (() => {
      const op = opcionCategorias(nombres, [
        { nombre: 'Declaradas en el RII', color: COLOR.gris, datos: subs.map(g => g.r.decProm) },
        { nombre: 'Inscritas al cierre del calendario regular', color: COLOR.verde, datos: subs.map(g => g.r.satProm) },
        { nombre: 'Inscritas al cierre de adiciones y cancelaciones', color: COLOR.ocre, datos: subs.map(g => g.r.finProm) }
      ], { formatoEje: v => dec(v), formatoTooltip: v => dec(v, 2), etiquetas: true, fmtEtiqueta: v => dec(v) });
      op.series.forEach(s => { s.barMaxWidth = 11; s.barGap = '10%'; });
      return { opcion: op, altoLienzo: nombres.length > 4 ? 90 + nombres.length * 46 : null,
        csv: () => ({ encabezados: ['Subgrupo de cita', 'Estudiantes', 'Declaradas por estudiante',
          'Inscritas al cierre del calendario regular', 'Inscritas al cierre de adiciones y cancelaciones'],
          filas: subs.map(g => [g.nombre, g.r.nR, g.r.decProm, g.r.satProm, g.r.finProm]) }),
        alSeleccionar: n => alternar('subgrupo', n) };
    })();

    const cumple = (() => {
      const cnt = BINS_CUMPLE.map(() => []);
      subs.forEach(g => {
        const c = [0, 0, 0, 0];
        g.filas.forEach(i => {
          const d = F.dec[i], s = F.sat[i];
          c[s === 0 ? 0 : s === d ? 3 : s / d < 0.5 ? 1 : 2]++;
        });
        c.forEach((v, k) => cnt[k].push(v));
      });
      const conteos = {};
      BINS_CUMPLE.forEach((b, k) => { conteos[b] = cnt[k]; });
      const op = opcionCategorias(nombres, BINS_CUMPLE.map((b, k) => ({
        nombre: b, color: COLOR_CUMPLE[k],
        datos: subs.map((g, j) => 100 * cnt[k][j] / g.r.nR)
      })), { apilado: true, pct: true, formatoEje: ejePct });
      op.tooltip.formatter = ps => '<b>' + ps[0].axisValueLabel + '</b><br/>' + ps.map(p =>
        p.marker + p.seriesName + ': ' + pct(p.value)).join('<br/>');
      return { opcion: op,
        csv: () => ({ encabezados: ['Subgrupo de cita'].concat(BINS_CUMPLE),
          filas: subs.map((g, j) => [g.nombre].concat(BINS_CUMPLE.map((b, k) => cnt[k][j]))) }),
        alSeleccionar: n => alternar('subgrupo', n) };
    })();

    const porDecl = (() => {
      const g = {};
      conDatos.forEach(i => { const d = Math.min(F.dec[i], 5); (g[d] = g[d] || []).push(i); });
      const ks = Object.keys(g).map(Number).sort((a, b) => a - b);
      const rs = ks.map(k => resumen(g[k]));
      const etq = ks.map(k => (k >= 5 ? '5 o más' : String(k)));
      const op = opcionPeriodos(etq, [
        { nombre: 'Al cierre del calendario regular', color: COLOR.verde, datos: rs.map(r => r.idx) },
        { nombre: 'Al cierre de adiciones y cancelaciones', color: COLOR.ocre, datos: rs.map(r => r.idxFin) }
      ], { nombreEje: 'Índice de satisfacción', formatoEje: ejePct, formatoTooltip: v => pct(v), pct: true });
      op.xAxis.name = 'Obligatorias declaradas'; op.xAxis.nameLocation = 'middle'; op.xAxis.nameGap = 28;
      op.grid.bottom = 78;
      return { opcion: op,
        csv: () => ({ encabezados: ['Obligatorias declaradas', 'Estudiantes', 'Índice al cierre del calendario regular',
          'Índice al cierre de adiciones y cancelaciones'], filas: ks.map((k, j) => [etq[j], rs[j].nR, rs[j].idx, rs[j].idxFin]) }) };
    })();

    const progs = porDim(conDatos, 'programa').map(g => ({ nombre: g.nombre,
      hab: Qh.filas.filter(i => F.programa[i] === g.k).length, r: g.r }));
    return { medias, cumple, porDecl, progs };
  }, [Qh]);

  /* ---------------------------------------------- sección 3 */
  const s3 = useMemo(() => {
    const conDatos = Qh.filas.filter(i => F.dec[i] > 0);
    const uabs = porDim(conDatos, 'uab').filter(g => g.r.nR >= MIN_UAB && g.nombre !== 'Sin dato')
      .sort((a, b) => b.r.idx - a.r.idx);
    const nombres = uabs.map(g => g.nombre);

    const porUab = (() => {
      const op = opcionCategorias(nombres, [
        { nombre: 'Al cierre del calendario regular', color: COLOR.verde, datos: uabs.map(g => g.r.idx) },
        { nombre: 'Al cierre de adiciones y cancelaciones', color: COLOR.ocre, datos: uabs.map(g => g.r.idxFin) }
      ], { pct: true, formatoEje: ejePct, formatoTooltip: v => pct(v), etiquetas: true, fmtEtiqueta: v => pct(v, 0) });
      op.series.forEach(s => { s.barMaxWidth = 11; });
      return { opcion: op, altoLienzo: nombres.length > 4 ? 90 + nombres.length * 40 : null,
        csv: () => ({ encabezados: ['Unidad académica básica', 'Estudiantes', 'Índice al cierre del calendario regular',
          'Índice al cierre de adiciones y cancelaciones'], filas: uabs.map(g => [g.nombre, g.r.nR, g.r.idx, g.r.idxFin]) }),
        alSeleccionar: n => alternar('uab', n) };
    })();

    const subs = porDim(conDatos, 'subgrupo');
    const baja = barras(subs, 'pBaja', 'Estudiantes con índice menor de 50%', COLOR.ocre, 'subgrupo');

    const mats = porDim(conDatos, 'matriculas').filter(g => g.nombre !== 'Sin dato');
    const porMat = (() => {
      const op = opcionPeriodos(mats.map(g => g.nombre), [
        { nombre: 'Al cierre del calendario regular', color: COLOR.verde, datos: mats.map(g => g.r.idx) },
        { nombre: 'Al cierre de adiciones y cancelaciones', color: COLOR.ocre, datos: mats.map(g => g.r.idxFin) }
      ], { nombreEje: 'Índice de satisfacción', formatoEje: ejePct, formatoTooltip: v => pct(v), pct: true });
      op.xAxis.name = 'Matrículas cursadas'; op.xAxis.nameLocation = 'middle'; op.xAxis.nameGap = 28;
      op.grid.bottom = 78;
      return { opcion: op,
        csv: () => ({ encabezados: ['Matrículas cursadas', 'Estudiantes', 'Índice al cierre del calendario regular',
          'Índice al cierre de adiciones y cancelaciones'], filas: mats.map(g => [g.nombre, g.r.nR, g.r.idx, g.r.idxFin]) }) };
    })();

    const filasUab = porDim(conDatos, 'uab').map(g => ({ nombre: g.nombre, r: g.r }));
    return { porUab, baja, porMat, filasUab };
  }, [Qh]);

  /* ---------------------------------------------- sección 4: balance */
  const T4 = useMemo(() => resumenC(Qc.filas), [Qc]);
  const verRegular = corte !== 'final', verFinal = corte !== 'regular';
  const s4 = useMemo(() => {
    const dimC = dim => {
      const g = agrupar(Qc.filas, FC[dim]);
      return C[dim].map((nombre, k) => ({ nombre, filas: g[k] || [] })).filter(x => x.filas.length)
        .map(x => Object.assign(x, { r: resumenC(x.filas) }));
    };
    const NR = 'Al cierre del calendario regular', NF2 = 'Al cierre de adiciones y cancelaciones';
    const series = (gr, mR, mF, ext) => {
      const s = [];
      if (verRegular) s.push(Object.assign({ nombre: NR, color: COLOR.verde, datos: gr.map(g => g.r[mR]) }, ext || {}));
      if (verFinal) s.push(Object.assign({ nombre: NF2, color: COLOR.ocre, datos: gr.map(g => g.r[mF]) }, ext || {}));
      return s;
    };
    const horizontal = (gr, dim, mR, mF, titulo, fmt, esPct) => {
      const nombres = gr.map(g => g.nombre);
      const op = opcionCategorias(nombres, series(gr, mR, mF), { pct: esPct, formatoEje: esPct ? ejePct : undefined,
        formatoTooltip: fmt, etiquetas: true, fmtEtiqueta: fmt });
      op.series.forEach(x => { x.barMaxWidth = 11; });
      return { opcion: op, altoLienzo: nombres.length > 4 && verRegular && verFinal ? 90 + nombres.length * 40 : null,
        csv: () => ({ encabezados: [cortoDim(dim), 'Citados', NR, NF2],
          filas: gr.map(g => [g.nombre, g.r.n, g.r[mR], g.r[mF]]) }),
        alSeleccionar: n => alternar(dim, n) };
    };
    const porSub = horizontal(dimC('subgrupo'), 'subgrupo', 'pI', 'pF', '', v => pct(v), true);
    const porFac = horizontal(dimC('facultad'), 'facultad', 'pI', 'pF', '', v => pct(v), true);

    const gru = dimC('grupo');
    const op = opcionPeriodos(gru.map(g => g.nombre), series(gru, 'asI', 'asF'),
      { nombreEje: 'Asignaturas por estudiante inscrito', formatoTooltip: v => dec(v, 2) });
    
    op.series.forEach(x => { x.label = { show: true, position: 'top', color: '#242627', fontSize: 10,
      formatter: p => dec(p.value, 2) }; });
    const porGrupo = { opcion: op, csv: () => ({ encabezados: ['Grupo de cita', 'Inscritos regular', 'Inscritos final',
      'Asignaturas por inscrito, cierre regular', 'Asignaturas por inscrito, cierre final'],
      filas: gru.map(g => [g.nombre, g.r.hi, g.r.hf, g.r.asI, g.r.asF]) }) };

    const progs = dimC('programa').map(g => ({ nombre: g.nombre, r: g.r }));
    return { porSub, porFac, porGrupo, progs };
  }, [Qc, corte]);

  /* ------------------------------------------------------------ tablas */
  const colsPerfil = [
    { tit: 'Característica', fija: true, val: f => f.o, txt: f => f.car },
    { tit: 'Categoría', val: f => f.cat, txt: f => f.cat },
    { tit: 'Habilitados (%)', num: 1, val: f => f.pU, txt: f => pct(f.pU) },
    { tit: 'Respondieron (%)', num: 1, val: f => f.pR, txt: f => pct(f.pR) },
    { tit: 'Diferencia (puntos)', num: 1, val: f => f.dif, txt: f => pts(f.dif) },
    { tit: 'Tasa de respuesta', num: 1, val: f => f.tasa, txt: f => pct(f.tasa) }
  ];
  const colsBal = [
    { tit: 'Programa curricular', fija: true, val: f => f.nombre, txt: f => f.nombre },
    { tit: 'Inscritos, cierre regular (%)', num: 1, val: f => f.r.pI, txt: f => pct(f.r.pI) },
    { tit: 'Inscritos, cierre final (%)', num: 1, val: f => f.r.pF, txt: f => pct(f.r.pF) },
    { tit: 'Diferencia (puntos)', num: 1, val: f => f.r.dif, txt: f => pts(f.r.dif) },
    { tit: 'Asignaturas, cierre regular', num: 1, val: f => f.r.asI, txt: f => dec(f.r.asI, 2) },
    { tit: 'Asignaturas, cierre final', num: 1, val: f => f.r.asF, txt: f => dec(f.r.asF, 2) },
    { tit: 'Bloqueados (%)', num: 1, val: f => f.r.pBlq, txt: f => pct(f.r.pBlq) }
  ];
  const colsProg = [
    { tit: 'Programa curricular', fija: true, val: f => f.nombre, txt: f => f.nombre },
    { tit: 'Declaradas por estudiante', num: 1, val: f => f.r.decProm, txt: f => dec(f.r.decProm) },
    { tit: 'Índice al cierre regular', num: 1, val: f => f.r.idx, txt: f => pct(f.r.idx) },
    { tit: 'Índice al cierre final', num: 1, val: f => f.r.idxFin, txt: f => pct(f.r.idxFin) },
    { tit: 'Todas inscritas', num: 1, val: f => f.r.pTodo, txt: f => pct(f.r.pTodo) },
    { tit: 'Ninguna inscrita', num: 1, val: f => f.r.pCero, txt: f => pct(f.r.pCero) }
  ];
  const colsUab = [
    { tit: 'Unidad académica básica', fija: true, val: f => f.nombre, txt: f => f.nombre },
    { tit: 'Declaradas por estudiante', num: 1, val: f => f.r.decProm, txt: f => dec(f.r.decProm) },
    { tit: 'Índice al cierre regular', num: 1, val: f => f.r.idx, txt: f => pct(f.r.idx) },
    { tit: 'Índice al cierre final', num: 1, val: f => f.r.idxFin, txt: f => pct(f.r.idxFin) },
    { tit: 'Índice menor de 50%', num: 1, val: f => f.r.pBaja, txt: f => pct(f.r.pBaja) },
    { tit: 'Todas inscritas', num: 1, val: f => f.r.pTodo, txt: f => pct(f.r.pTodo) }
  ];

  const sedeRot = 'Sede Medellín';
  const tarjetas = esBalance ? [
    [IC.tasa, 'var(--dsh-aprobada)', 'Inscritos al cierre del calendario regular', pct(T4.pI), sedeRot],
    [IC.tasa, 'var(--dsh-punto)', 'Inscritos al cierre de adiciones y cancelaciones', pct(T4.pF)],
    [IC.tasa, 'var(--dsh-azul)', 'Diferencia entre los dos cortes', pts(T4.dif) + ' puntos'],
    [IC.malla, 'var(--dsh-cancelada)', 'Asignaturas por estudiante inscrito', dec(T4.asI, 2) + ' / ' + dec(T4.asF, 2), 'Cierre regular / cierre final'],
    [IC.circulo, 'var(--dsh-punto)', 'Citados con bloqueo', pct(T4.pBlq)]
  ] : [
    [IC.tasa, 'var(--dsh-primary)', 'Tasa de respuesta del RII', pct(T.tasa), sedeRot],
    [IC.tasa, 'var(--dsh-aprobada)', 'Índice al cierre del calendario regular', pct(T.idx)],
    [IC.tasa, 'var(--dsh-punto)', 'Índice al cierre de adiciones y cancelaciones', pct(T.idxFin)],
    [IC.visto, 'var(--dsh-azul)', 'Inscribieron todas las obligatorias declaradas', pct(T.pTodo)],
    [IC.circulo, 'var(--dsh-cancelada)', 'Índice menor de 50%', pct(T.pBaja)]
  ];

  const arch = [sec.id];
  const sinDatos = !Q.filas.length;
  const op = o => (sinDatos ? null : o);
  const tarjeta = (titulo, g, nombre, extra) => (
    <TarjetaGrafico titulo={titulo} opcion={op(g.opcion)} csv={g.csv}
      alSeleccionar={g.alSeleccionar} altoLienzo={g.altoLienzo}
      archivo={nombreArchivo(arch.concat([nombre]))} {...(extra || {})} />
  );
  const tablaTarjeta = (titulo, cols, filas, nombre, orden, clic) => (
    <Tarjeta titulo={titulo}
      accion={<Descargas csv={() => ({ encabezados: cols.map(c => c.tit),
        filas: filas.map(f => cols.map(c => c.val(f))) })}
        nombre={nombreArchivo(arch.concat([nombre]))} />}>
      <Tabla columnas={cols} filas={filas} ordenInicial={orden} alSeleccionar={clic} altura={400} />
    </Tarjeta>
  );

  return (
    <React.Fragment>
      <div className="dsh-tabs" role="tablist" aria-label="Secciones del tablero">
        {SECCIONES.map((p, i) => (
          <button key={p.id} ref={el => (refsTab.current[i] = el)}
            className="dsh-tab" role="tab" id={'tab-' + p.id}
            aria-controls={'panel-' + p.id} aria-selected={i === tab}
            onClick={() => setTab(i)} onKeyDown={e => teclas(e, i)}>
            {p.rotulo}
          </button>
        ))}
      </div>

      <Filtros seleccion={seleccion} fijar={fijar} limpiar={() => setSeleccion({})} Q={Q} />
      <Seleccion seleccion={seleccion} quitar={alternar} limpiar={() => setSeleccion({})} />

      <section className="dsh-kpis" aria-label="Indicadores">
        {tarjetas.map((t, i) => (
          <Kpi key={i} icono={t[0]} fondo={t[1]} etiqueta={t[2]} valor={t[3]} pie={t[4]} />
        ))}
      </section>

      <div id={'panel-' + sec.id} role="tabpanel" aria-labelledby={'tab-' + sec.id}>
        {sec.id === 'respuesta' ? (
          <React.Fragment>
            <div className="dsh-mosaico dsh-mosaico-2">
              {tarjeta('Tasa de respuesta por vía de admisión', s1.porVia, 'via')}
              {tarjeta('Tasa de respuesta por facultad', s1.porFac, 'facultad')}
            </div>
            <div className="dsh-mosaico dsh-mosaico-1">
              {tarjeta('Tasa de respuesta según el subgrupo de cita', s1.porSub, 'subgrupo')}
            </div>
            <div className="dsh-mosaico dsh-mosaico-1">
              {tablaTarjeta('Perfil de quienes respondieron frente a los habilitados matriculados', colsPerfil, s1.perfil,
                'perfil', { col: 0, asc: true })}
            </div>
          </React.Fragment>
        ) : null}

        {sec.id === 'obligatorias' ? (
          <React.Fragment>
            <div className="dsh-mosaico dsh-mosaico-1">
              {tarjeta('Obligatorias declaradas e inscritas por estudiante, según el subgrupo de cita', s2.medias, 'medias')}
            </div>
            <div className="dsh-mosaico dsh-mosaico-2">
              {tarjeta('Cumplimiento de lo declarado al cierre del calendario regular', s2.cumple, 'cumplimiento')}
              {tarjeta('Índice según el número de obligatorias declaradas', s2.porDecl, 'declaradas')}
            </div>
            <div className="dsh-mosaico dsh-mosaico-1">
              {tablaTarjeta('Detalle por programa curricular', colsProg, s2.progs, 'programas',
                { col: 2, asc: false }, f => alternar('programa', f.nombre))}
            </div>
          </React.Fragment>
        ) : null}

        {sec.id === 'balance' ? (
          <React.Fragment>
            <div className="dsh-corte">
              <span className="dsh-leyenda">Corte</span>
              <Segmento etiqueta="Corte de la inscripción" valor={corte} onCambio={setCorte}
                opciones={[{ valor: 'ambos', texto: 'Ambos cortes' },
                  { valor: 'regular', texto: 'Cierre del calendario regular' },
                  { valor: 'final', texto: 'Cierre de adiciones y cancelaciones' }]} />
            </div>
            <div className="dsh-mosaico dsh-mosaico-2">
              {tarjeta('Estudiantes inscritos según el subgrupo de cita (% de los citados)', s4.porSub, 'subgrupo')}
              {tarjeta('Estudiantes inscritos por facultad (% de los citados)', s4.porFac, 'facultad')}
            </div>
            <div className="dsh-mosaico dsh-mosaico-1">
              {tarjeta('Asignaturas inscritas por estudiante inscrito, según el grupo de cita', s4.porGrupo, 'grupo')}
            </div>
            <div className="dsh-mosaico dsh-mosaico-1">
              {tablaTarjeta('Balance por programa curricular', colsBal, s4.progs, 'programas',
                { col: 1, asc: false }, f => alternar('programa', f.nombre))}
            </div>
          </React.Fragment>
        ) : null}

        {sec.id === 'satisfaccion' ? (
          <React.Fragment>
            <div className="dsh-mosaico dsh-mosaico-1">
              {tarjeta('Índice de satisfacción por unidad académica básica (con ' + MIN_UAB + ' o más estudiantes)', s3.porUab, 'uab')}
            </div>
            <div className="dsh-mosaico dsh-mosaico-2">
              {tarjeta('Estudiantes con índice menor de 50%, según el subgrupo de cita', s3.baja, 'baja')}
              {tarjeta('Índice según las matrículas cursadas por el estudiante', s3.porMat, 'matriculas')}
            </div>
            <div className="dsh-mosaico dsh-mosaico-1">
              {tablaTarjeta('Detalle por unidad académica básica', colsUab, s3.filasUab, 'detalle-uab',
                { col: 3, asc: true }, f => alternar('uab', f.nombre))}
            </div>
          </React.Fragment>
        ) : null}
      </div>

      <p className="dsh-nota">{DEF.nota}</p>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
