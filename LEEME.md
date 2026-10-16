# Registro de Intención de Inscripción (RII), 2026-2S

Misma arquitectura y diseño de los tableros anteriores (React, ECharts, Kit UNAL, ETL en Python). Solo incluye la Sede Medellín.

## Secciones (hasta 4 tarjetas cada una, más 5 indicadores)
1. **Diligenciamiento del RII:** tasa de respuesta por vía de admisión, por facultad y por subgrupo de cita, y perfil de quienes respondieron frente a los habilitados matriculados.
2. **Obligatorias declaradas e inscritas:** declaradas e inscritas por subgrupo de cita, cumplimiento al cierre del calendario regular, índice según el número de declaradas y detalle por programa.
3. **Índice de satisfacción con la inscripción:** índice por unidad académica básica, estudiantes con índice menor de 50% por subgrupo, índice según matrículas cursadas y detalle por unidad.
4. **Balance de la inscripción:** estudiantes citados inscritos a cada corte (subgrupo de cita y facultad), asignaturas por estudiante inscrito según el grupo y detalle por programa. Un selector de corte permite ver ambos cortes, solo el cierre del calendario regular o solo el cierre de adiciones y cancelaciones. Usa la tabla de citados, por lo que los filtros se recalculan sobre ese universo.

## Definiciones
- Índice de satisfacción: obligatorias declaradas en el RII que el estudiante tenía inscritas, en porcentaje, promediado entre los estudiantes con al menos una obligatoria declarada e inscripción en el período. Se mide al cierre del calendario regular y al cierre de adiciones y cancelaciones.
- Obligatoria: asignatura de tipología B o C declarada en el RII.

## Control con la presentación de Medellín
11.837 habilitados, 6.379 respuestas (53,9%), 5.741 con obligatorias declaradas, índice de 79,0% y 50,8% con todas inscritas.

## Actualizar
`python3 etl_rii.py carpeta_con_tablas datos` con las tablas intermedias pobx2, st, rii_idx5 y repb2 (ver el encabezado del script). No se exportan documento, usuario, nombre ni correo.
Servir con `python3 -m http.server 8000` y abrir http://localhost:8000.
