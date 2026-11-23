# Planificador Visual y Banco de Material Docente — Colegio Marina de Chile

Aplicación web interactiva pensada para **docentes y UTP** del Colegio Marina de Chile (1° Básico a 4° Medio + Electivos Plan Diferenciado HC), desplegada gratuitamente en **GitHub Pages** y sincronizada con la base de datos curricular **`BD_App_Banco_Material_UTP`**.

## ¿Qué pueden hacer los profesores aquí?
1. **Planificador Visual por Curso y Unidad**: elige `Ciclo → Curso → Asignatura → Unidad 1..4` y revisa en tarjetas visuales todas las guías, evaluaciones, diagnósticos, rúbricas, lecturas y presentaciones disponibles junto a los **Objetivos de Aprendizaje MINEDUC oficiales** (con botón de 1 clic para copiar la redacción oficial del OA al encabezado de un documento nuevo).
2. **Vista Previa Integrada de Google Drive**: haz clic en **Vista previa** en cualquier tarjeta para inspeccionar el Word, PDF o PowerPoint directamente dentro de la app sin perder tu lugar, o ábrelo en Google Drive.
3. **Mi Planificación de Clase**: arma tu secuencia didáctica seleccionando recursos en **Inicio / Desarrollo / Evaluación**, reúne automáticamente todos los OA MINEDUC cubiertos, agrega notas metodológicas e **imprime/guarda en PDF** o **copia el resumen listo para Google Classroom**.
4. **Buscador Global Instantáneo**: busca en menos de 5 ms entre los **5.479 recursos pedagógicos** (vista de tarjetas o tabla).
5. **Cobertura OA y Preparación de Nuevo Material**: detecta brechas curriculares (OA sin material), abre la carpeta destino exacta en Google Drive y verifica tus archivos con la **Barrera Preventiva PII/NEE** antes de subirlos.
6. **Estándares de Aprendizaje SIMCE × OA por Unidad**: asocia los 10 documentos oficiales de Estándares de Aprendizaje (155 indicadores en 3 niveles: Elemental, Adecuado y Expectativa Curricular) con los 561 OA por unidad de 1° Básico a 2° Medio, permitiendo copiar en 1 clic pautas escalonadas para diseñar guías y evaluaciones.

## Privacidad y Gobernanza
- Este repositorio **no almacena documentos ni datos personales de estudiantes (PII/NEE)**.
- El archivo `public/data/banco-docente.json` contiene exclusivamente metadatos curriculares sanitizados y enlaces a Google Drive, donde los permisos institucionales de tu cuenta controlan el acceso a cada documento.
- El catálogo maestro `OA por Unidad – Programas de Estudio MINEDUC` permanece 100% intacto y en solo lectura.

## Desarrollo local
```bash
npm install
npm run dev
npm run build
```
