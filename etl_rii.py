"""Prepara los datos del tablero del RII (período 2026-2S).

Uso: python3 etl_rii.py carpeta_con_tablas datos
Tablas de entrada (pickle) en la carpeta:
  pobx2.pkl     habilitados para responder el RII, con la marca de respuesta (resp)
  st.pkl        estudiantes citados, con grupo y subgrupo de cita (g, sg)
  rii_idx5.pkl  respuestas con obligatorias declaradas (dec), inscritas al cierre
                del calendario regular (sat) y al cierre de adiciones y cancelaciones (sat_fin)
  repb2.pkl     perfil de los habilitados matriculados (sexo, estrato, colegio, matrículas, avance)
Genera datos/rii_datos.js. No se exporta documento, usuario, nombre ni correo.
"""
import sys, os, json, re
import pandas as pd, numpy as np

ent, sal = sys.argv[1], sys.argv[2]
os.makedirs(sal, exist_ok=True)
rd = lambda n: pd.read_pickle(os.path.join(ent, n))
x, st, V, b = rd('pobx2.pkl'), rd('st.pkl'), rd('rii_idx5.pkl'), rd('repb2.pkl')

x['doc'] = x.doc.astype(str).str.strip()
st['documento'] = st.documento.astype(str).str.strip()
st['cod_plan'] = st.cod_plan.astype(str).str.strip()
x = x.merge(st[['documento', 'cod_plan', 'g', 'sg', 'av', 'nm', 'via']].rename(
    columns={'g': 'g_st', 'sg': 'sg_st', 'av': 'av_st', 'nm': 'nm_st', 'via': 'via_st'}),
    left_on=['doc', 'cod_pla'], right_on=['documento', 'cod_plan'], how='left')
x = x.merge(V[['login', 'plan', 'UAB', 'dec', 'sat', 'sat_fin']].rename(columns={'UAB': 'uab_v'}),
            left_on=['login', 'cod_pla'], right_on=['login', 'plan'], how='left')
x = x.merge(b[['login', 'cod_pla', 'sexo', 'estr', 'tcol', 'matb']].rename(
    columns={'sexo': 'sexo_b', 'estr': 'estr_b', 'tcol': 'tcol_b', 'matb': 'matb_b'}),
    on=['login', 'cod_pla'], how='left')
assert len(x) == 53989 and not x.duplicated(['login', 'cod_pla']).any()

def fac(s):
    s = re.sub(r'\s*\(Admisión Paet\)', '', str(s))
    s = re.sub(r'\s+', ' ', s).strip()
    return 'Facultad de Ciencias de la Vida' if s == 'Facultad de Enfermería' else s
x['facultad'] = x.fac_n.map(fac)

def uab(s):
    if not isinstance(s, str): return 'Sin dato'
    s = re.sub(r'\s*-\s*FAC CIENCIAS|\s*CIENCIAS BOGOTA', '', s.strip().upper())
    s = re.sub(r'^DEPARTAMENTO DE ', '', s)
    s = re.sub(r'^ESCUELA DE ', 'Escuela de ', s) if s.startswith('ESCUELA') else s
    t = s.capitalize()
    for a, b_ in [('construccion', 'construcción'), ('enfermeria', 'enfermería')]:
        t = t.replace(a, b_)
    return t
x['uab'] = x.uab_v.where(x.uab_v.notna(), x.UAB).map(uab)
x['programa'] = x.pla_n.map(lambda s: re.sub(r'\s+', ' ', str(s)).strip().capitalize())

sa = x.SUBACCESO.fillna('').str.upper()
via_r = np.select([sa.str.startswith('PEAMA'), sa.str.startswith('PAES') | sa.str.startswith('VÍCTIMAS'),
                   sa.str.startswith('PAET'), sa.str.startswith('REGULAR')],
                  ['PEAMA', 'PAES', 'PAET', 'Regular'], 'Otra')
x['via'] = x.via_st.where(x.via_st.notna(), pd.Series(via_r, index=x.index))
x['via'] = x.via.replace({'Regular': 'Admisión regular', 'Otra': 'Otra admisión especial'})

SG = {'G2': 'Grupo 2', 'G3a': 'Grupo 3, avance de 90% o más', 'G3b': 'Grupo 3, avance de 80% a 90%',
      'G4_1': 'Grupo 4, avance menor de 10%'}
for i in range(2, 9): SG[f'G4_{i}'] = f'Grupo 4, avance de {i-1}0% a {i}0%'
x['subgrupo'] = x.sg_st.map(SG).fillna('Sin cita')
x['grupo'] = x.g_st.map({'2': 'Grupo 2', '3': 'Grupo 3', '4': 'Grupo 4', 2: 'Grupo 2', 3: 'Grupo 3', 4: 'Grupo 4'}).fillna('Sin cita')

x['sexo'] = x.sexo_b.fillna('Sin dato')
x['estrato'] = x.estr_b.map({'1 y 2': 'Estratos 1 y 2', '3': 'Estrato 3', '4 a 6': 'Estratos 4 a 6'}).fillna('Sin dato')
x['colegio'] = x.tcol_b.map({'Oficial': 'Oficial', 'Privado': 'Privado'}).fillna('Otro o sin dato')
x['matriculas'] = x.matb_b.astype(object).where(x.matb_b.notna(), 'Sin dato')
x['avance'] = pd.cut(x.av_st, [-1, 30, 60, 70, 80, 90, 101], labels=['<30', '30-60', '60-70', '70-80', '80-90', '90+'],
                     right=False).astype(object).where(x.av_st.notna(), 'Sin dato')
x['resp'] = x.resp.astype(int)
x['dec'] = x.dec.fillna(-1).astype(int)
x['sat'] = x.sat.fillna(-1).astype(int)
x['sat_fin'] = x.sat_fin.fillna(-1).astype(int)


# ---- citados (balance de la inscripción)
SEDES = {'MEDELLIN': 'Medellín', 'BOGOTA': 'Bogotá', 'MANIZALES': 'Manizales', 'PALMIRA': 'Palmira', 'LA PAZ': 'La Paz'}
facn = dict(zip(x.cod_fac.astype(str), x.facultad))
plan_n = dict(zip(x.cod_pla.astype(str), x.programa))
pu = pd.concat([V[['plan', 'UAB']].rename(columns={'plan': 'cod'}),
                x[['cod_pla', 'uab_v']].rename(columns={'cod_pla': 'cod', 'uab_v': 'UAB'}),
                x[['cod_pla', 'UAB']].rename(columns={'cod_pla': 'cod'})]).dropna().drop_duplicates('cod')
plan_u = dict(zip(pu.cod.astype(str), pu.UAB.map(uab)))
st['cod_facultad'] = st.cod_facultad.astype(str).str.strip()
cit = pd.DataFrame({
    'sede': st.sede.map(SEDES),
    'facultad': st.cod_facultad.map(facn).fillna(st.facultad.map(fac)),
    'uab': st.cod_plan.map(plan_u).fillna('Sin dato'),
    'programa': st.cod_plan.map(plan_n).fillna(st.plan.map(lambda s: re.sub(r'\s+', ' ', str(s)).strip().capitalize())),
    'via': st.via.replace({'Regular': 'Admisión regular', 'Otra': 'Otra admisión especial'}),
    'grupo': st.g.astype(str).map({'2': 'Grupo 2', '3': 'Grupo 3', '4': 'Grupo 4'}),
    'subgrupo': st.sg.map(SG),
    'respondio': st.rii.astype(int),
    'hi': st.hi.astype(int), 'hf': st.hf.astype(int),
    'ai': st.ai.fillna(0).astype(int), 'af': st.af.fillna(0).astype(int),
    'ci': st.ci.fillna(0).astype(int), 'cf': st.cf.fillna(0).astype(int),
    'blq': st.blq.astype(int)})
assert len(cit) == 46781 and cit[['sede', 'facultad', 'grupo', 'subgrupo', 'via']].notna().all().all()

# Solo Sede Medellín
x = x[x.sede_n == 'Medellín'].reset_index(drop=True)
cit = cit[cit.sede == 'Medellín'].reset_index(drop=True)

ORD = {
 'sede': ['Medellín', 'Bogotá', 'Manizales', 'Palmira', 'La Paz'],
 'via': ['Admisión regular', 'PAES', 'PEAMA', 'PAET', 'Otra admisión especial'],
 'grupo': ['Grupo 2', 'Grupo 3', 'Grupo 4', 'Sin cita'],
 'subgrupo': ['Grupo 2', SG['G3a'], SG['G3b'], SG['G4_8'], SG['G4_7'], SG['G4_6'], SG['G4_5'], SG['G4_4'],
              SG['G4_3'], SG['G4_2'], SG['G4_1'], 'Sin cita'],
 'sexo': ['Femenino', 'Masculino', 'Sin dato'],
 'estrato': ['Estratos 1 y 2', 'Estrato 3', 'Estratos 4 a 6', 'Sin dato'],
 'colegio': ['Oficial', 'Privado', 'Otro o sin dato'],
 'matriculas': ['1-2', '3-4', '5-6', '7-8', '9-10', '11+', 'Sin dato'],
 'avance': ['<30', '30-60', '60-70', '70-80', '80-90', '90+', 'Sin dato'],
}
# subgrupos de cita: el orden natural es del primero al último en recibir cita
ORD['subgrupo'] = ['Grupo 2', SG['G3a'], SG['G3b'], SG['G4_8'], SG['G4_7'], SG['G4_6'], SG['G4_5'],
                   SG['G4_4'], SG['G4_3'], SG['G4_2'], SG['G4_1'], 'Sin cita']
def cat(col):
    vals = set(x[col]) | (set(cit[col]) if col in cit.columns else set())
    v = sorted(vals)
    if col in ORD:
        v = [c for c in ORD[col] if c in vals] + [c for c in v if c not in ORD[col]]
    return v
cols = ['sede_n', 'facultad', 'uab', 'programa', 'via', 'grupo', 'subgrupo', 'sexo', 'estrato', 'colegio', 'matriculas', 'avance']
x = x.rename(columns={'sede_n': 'sede'})
cols[0] = 'sede'
C = {c: cat(c) for c in cols}
fil = {c: x[c].map({v: i for i, v in enumerate(C[c])}).astype(int).tolist() for c in cols}

CC = ['sede', 'facultad', 'uab', 'programa', 'via', 'grupo', 'subgrupo']
filc = [cit[c].map({v: i for i, v in enumerate(C[c])}).astype(int).tolist() for c in CC]
datos = {'catalogos': C,
         'cit': {'campos': CC + ['respondio', 'hi', 'hf', 'ai', 'af', 'ci', 'cf', 'blq'],
                 'filas': filc + [cit[c].tolist() for c in ['respondio', 'hi', 'hf', 'ai', 'af', 'ci', 'cf', 'blq']]},
         'campos': cols + ['resp', 'dec', 'sat', 'sat_fin'],
         'filas': [fil[c] for c in cols] + [x.resp.tolist(), x.dec.tolist(), x.sat.tolist(), x.sat_fin.tolist()]}
with open(os.path.join(sal, 'rii_datos.js'), 'w', encoding='utf-8') as fh:
    fh.write('window.RII = window.RII || {};\nwindow.RII.datos = ')
    json.dump(datos, fh, ensure_ascii=False, separators=(',', ':'))
    fh.write(';\n')

# ---- control contra la presentación de Medellín
M = x[x.sede == 'Medellín']; R = M[M.dec > 0]
print('Medellín habilitados', len(M), 'respuestas', int(M.resp.sum()), f'{M.resp.mean()*100:.1f}%')
print('con obligatorias', len(R), 'índice cierre regular', round((R.sat / R.dec).mean() * 100, 1),
      'índice cierre final', round((R.sat_fin / R.dec).mean() * 100, 1))
print('todo inscrito', round((R.sat == R.dec).mean() * 100, 1), 'ninguna', round((R.sat == 0).mean() * 100, 1),
      'baja', int(((R.sat / R.dec) < .5).sum()))
Mc = cit[cit.sede == 'Medellín']
print('Citados Medellín', len(Mc), 'inscripción regular', round(Mc.hi.mean()*100, 1), 'final', round(Mc.hf.mean()*100, 1), 'bloqueados', int(Mc.blq.sum()), '| total', len(cit), round(cit.hi.mean()*100, 1), round(cit.hf.mean()*100, 1))
print(len(x), os.path.getsize(os.path.join(sal, 'rii_datos.js')) // 1024, 'KB')
print(M.groupby('uab').apply(lambda d: pd.Series({'n': (d.dec > 0).sum(), 'idx': ((d.sat / d.dec)[d.dec > 0]).mean() * 100})).sort_values('idx').round(1).head(5))
