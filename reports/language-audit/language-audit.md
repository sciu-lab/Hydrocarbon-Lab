# Auditoría EN/ES de Hydrocarbon Lab

Fecha: 2026-09-27. Fase de diagnóstico; no se cambiaron textos ni lógica de la aplicación. Los hallazgos detallados, con archivo, contexto y recomendación, están en [language-audit.json](language-audit.json).

## Resumen ejecutivo

Se identificaron **19 causas raíz**: **1 HIGH, 12 MEDIUM y 6 LOW**. La más importante es pedagógica: `CC=CC` conserva correctamente E/Z sin especificar en el nombre, pero la explicación de nomenclatura afirma que es **2E** tanto en ES como en EN (LANG-001). El cambio de idioma actualiza la mayor parte de la interfaz y las explicaciones calculadas, pero deja algunos errores y avisos ya visibles en el idioma previo. La función SMILES directo tiene labels, placeholder y botones traducidos; su feedback persistente y un error de estructura no soportada presentan fallos.

La baseline previa al diagnóstico coincidió con la esperada: suite **602/602**, regresiones externas **16/16**, comparador externo **15/15**, lint **0 errores y 11 advertencias preexistentes**, build correcto. La validación final se registra al cierre de este informe.

## Método y fuente de verdad

Se revisaron `app/i18n.ts`, `app/page.tsx`, el adaptador SMILES, constructor de anillos, UI de importación/exportación, nomenclatura y explicaciones. Un script diagnóstico basado en el AST de TypeScript recorrió **50 archivos** de `app/`; otro ejecutó el análisis y el razonamiento para **12 estructuras**. Se comprobó la interfaz local en EN y ES, el panel SMILES, errores representativos, atributos accesibles y una vista estrecha. Una prueba directa del lector de `.smi` confirmó el mensaje EN/ES para archivo vacío; otra mostró que los errores de fusión y de elemento no soportado quedan en ES cuando se pide EN. Se intentó cargar un `.smi` inválido mediante el selector del navegador, pero la automatización del selector agotó el tiempo de espera; **no** se declara como prueba interactiva completada. No se alteraron fixtures ni auditorías químicas.

La fuente de verdad vigente es el texto fuente en español. `ENGLISH_UI` contiene traducciones EN de claves ES; `dynamicExact` cubre mensajes exactos; `uiText` y `dynamicUiText` hacen fallback al texto fuente. `app/page.tsx` también construye mensajes mediante ramas `language === "en"`. El idioma se guarda localmente, se cambia con EN/ES y un efecto actualiza `document.documentElement.lang`, título, descripción y ruta. Las explicaciones se vuelven a calcular al cambiar `language`; varios estados de feedback conservan texto ya localizado. No existen dos diccionarios independientes EN y ES.

## Métricas y paridad

| Medida | Resultado |
|---|---:|
| Claves i18n únicas EN / ES | 578 / 578 |
| Entradas de traducción totales, contando 4 duplicados entre mapas | 582 |
| Pares de `ENGLISH_UI` / `dynamicExact` | 485 / 97 |
| Entradas EN / fuentes ES | 582 / 582 |
| Contextos auditados | 715 |
| Llamadas de traducción / textos JSX / atributos accesibles o tooltip / CSS `content` / setters dinámicos | 428 / 28 / 148 / 3 / 108 |
| Claves literales usadas sin entrada EN | 20, en 22 sitios |
| Claves fuente ES faltantes / entradas vacías / duplicados dentro de cada mapa | 0 / 0 / 0 |
| Duplicados entre mapas | 4 |
| Desajustes sintácticos de placeholders | 0 |
| Claves aparentemente muertas, pendientes de comprobar | 61 |
| Pares EN/ES idénticos revisados | 6; cognados técnicos válidos |
| Problemas HIGH / MEDIUM / LOW | 1 / 12 / 6 |

El total de **715** cuenta lugares de uso, no frases únicas: 428 llamadas de traducción, 28 nodos de texto JSX, 148 atributos, 3 reglas CSS y 108 setters. Los tres `content` CSS contienen cadenas vacías, sin texto traducible. El análisis de placeholders comparó `${…}`, `{…}`, `%s` y `%d`; no detectó pérdidas sintácticas. Sí existe pérdida **semántica** de posiciones C1/C2 en una explicación inglesa (LANG-011).

Las 20 claves faltantes comprenden la ayuda del constructor por nombre, controles de zoom ampliado, opciones e instrucciones de fusión de anillos, texto de estereoquímica y etiquetas del análisis como `Nombre IUPAC`. La lista exacta está en el JSON. `SMILES`, PNG, SVG, E/Z, fórmulas, símbolos y extensiones permanecen iguales legítimamente. Los seis valores idénticos `Color`, `triple`, `Alcohol`, `Nitro`, `Fluoro` y `Bromo` se revisaron como cognados técnicos, sin marcarlos como defectos. Las 61 claves sin referencia literal son **candidatas**, pues `t(variable)` puede utilizarlas.

## HIGH

| ID | Problema | Evidencia |
|---|---|---|
| LANG-001 | E/Z inventado en la explicación | `CC=CC` muestra nombre `but-2-ene` / `but-2-eno` sin descriptor, mientras “How it is derived” afirma `2E`. Ambos razonadores llaman `getMainChainStereoDescriptors` sin el filtro de estereoquímica explícita. |

El problema enseña química incorrecta en la explicación. Las pruebas químicas de identidad y los nombres de E y Z explícitos siguen correctos en las 12 muestras.

## MEDIUM

| ID | Categoría | Hallazgo resumido |
|---|---|---|
| LANG-002 | MISSING-TRANSLATION | 20 claves `t()` usadas carecen de traducción inglesa y caen silenciosamente al español. |
| LANG-003 | DYNAMIC-LANGUAGE | Errores y éxito del SMILES directo, compartidos con archivo, quedan en el idioma en que se crearon. |
| LANG-004 | LANGUAGE-LEAK | `CP` en EN muestra el error español sobre el elemento P no soportado. |
| LANG-005 | DYNAMIC-LANGUAGE | El error vacío del constructor por fórmula queda en EN al pasar a ES. |
| LANG-006 | LANGUAGE-LEAK | Los errores del validador de fusión de anillos llegan en ES a avisos y tooltips EN. |
| LANG-007 | ACCESSIBILITY | Los títulos accesibles de Deselect y Rings conservan ayuda EN en ES. |
| LANG-008 | HARDCODED-UI | Tooltip del anillo mezcla inicio traducido con instrucción de arrastre en ES. |
| LANG-009 | HARDCODED-UI | Tooltips de grupos alquilo mantienen `Add` y `Shortcut` en ES. |
| LANG-010 | LANGUAGE-LEAK | Aviso EN de colocación inserta el nombre ES del grupo o anillo. |
| LANG-011 | PLACEHOLDER | La explicación inglesa de numeración omite la comparación dinámica C1 frente a C2. |
| LANG-012 | CHEMISTRY-TERMINOLOGY | La fórmula en EN usa `IDH` mientras el texto explicativo inglés usa `DoU`. |
| LANG-013 | ACCESSIBILITY | La respuesta inicial de `/en/` lleva `html lang="es"` y texto ES hasta la hidratación. |

## LOW

| ID | Categoría | Hallazgo resumido |
|---|---|---|
| LANG-014 | GRAMMAR | `una ruta de 1 carbonos` en la explicación ES de `CNCC`. |
| LANG-015 | GRAMMAR | `1 anillos` en el aviso ES al unir un anillo. |
| LANG-016 | DUPLICATE | Cuatro mensajes repetidos entre `ENGLISH_UI` y `dynamicExact`. |
| LANG-017 | DEAD-KEY | 61 claves sin referencia literal; requieren verificación antes de considerarse muertas. |
| LANG-018 | STYLE | Tooltip EN `Create bond single`, producto de concatenación literal. |
| LANG-019 | CHEMISTRY-TERMINOLOGY | La explicación EN llama `parent name` al nombre derivado completo y luego lo repite como nombre IUPAC final. |

## Desglose por categoría

| Categoría | Hallazgos |
|---|---:|
| MISSING-TRANSLATION | 1 causa raíz / 20 claves |
| LANGUAGE-LEAK | 3 |
| WRONG-TRANSLATION | 0 |
| CHEMISTRY-TERMINOLOGY | 2 |
| GRAMMAR | 2 |
| STYLE | 1 |
| PLACEHOLDER | 1 pérdida dinámica; 0 desajustes sintácticos |
| ACCESSIBILITY | 2 |
| DYNAMIC-LANGUAGE | 2 |
| DEAD-KEY | 1 grupo candidato |
| DUPLICATE | 1 grupo de 4 claves |
| HARDCODED-UI | 2 |
| OTHER | 1 |

## Desglose por área

| Área | Hallazgos | Nota |
|---|---:|---|
| UI | 2 | Claves faltantes y sigla de fórmula. |
| Nomenclatura | 0 independientes | Los problemas de razonamiento se agrupan en “explicaciones”; 12 nombres muestreados fueron coherentes. |
| SMILES/import/export | 2 | Feedback persistente y error de elemento no soportado. PNG/SVG y opciones de exportación revisados sin otro fallo confirmado. |
| Mensajes de error/aviso | 4 | Fórmula, fusión, inserción y singular de anillos. |
| Explicaciones | 4 | E/Z, numeración, gramática y concepto de progenitor. |
| Accesibilidad | 5 | Títulos, ayuda y `lang` inicial. |
| Mobile | 0 confirmados | El panel SMILES en ancho estrecho apiló campo y botón sin desbordamiento visible; no se halló copy exclusivo de móvil. |
| Otros | 2 | Duplicados y posibles claves muertas. |

El reparto por área asigna una sola área primaria por hallazgo para evitar conteos repetidos.

## Top 10 para la fase de corrección

1. **LANG-001:** impedir E/Z inferido en una explicación de doble enlace no especificado.
2. **LANG-002:** cubrir las 20 claves EN faltantes, incluidas etiquetas visibles y accesibles.
3. **LANG-003:** hacer que errores y éxito de SMILES directo/archivo cambien de idioma con el panel abierto.
4. **LANG-004:** localizar el error de elemento no soportado sin cambiar la validación SMILES.
5. **LANG-011:** conservar C1/C2 y la razón de orientación en el razonamiento inglés.
6. **LANG-005:** traducir feedback de fórmula ya visible al cambiar EN↔ES.
7. **LANG-006:** localizar los errores existentes de fusión de anillos en EN.
8. **LANG-007:** traducir ayuda accesible de Deselect y Rings.
9. **LANG-013:** servir `lang` y texto iniciales acordes con `/en/`.
10. **LANG-012:** unificar `IDH`/`DoU` en la UI inglesa con término expandido.

## Glosario recomendado EN ↔ ES

Aplicar según el **concepto químico del contexto**, no mediante reemplazo textual de nombres. El uso actual favorece `parent chain` para la ruta carbonada elegida y `parent structure/skeleton` para el progenitor formal; `main chain` puede reservarse para explicaciones escolares si se define explícitamente.

| Concepto EN | ES recomendado | Nota contextual |
|---|---|---|
| parent chain | cadena principal | Ruta carbonada seleccionada. |
| parent structure / parent skeleton | estructura progenitora / esqueleto progenitor | Nomenclatura formal; no siempre una cadena. |
| main chain | cadena principal | Evitar alternarla sin motivo con “cadena progenitora”. |
| carbon chain | cadena carbonada | Descripción estructural general. |
| substituent | sustituyente | Grupo unido al progenitor. |
| branch / branching | rama / ramificación | Geometría o topología, no sinónimo automático de sustituyente. |
| locant | localizador | Posición nomenclatural. |
| numbering | numeración | Sentido y asignación de localizadores. |
| principal functional group | grupo funcional principal | Función que guía el sufijo y la prioridad. |
| functional-group priority | prioridad de grupos funcionales | Orden nomenclatural. |
| functional group | grupo funcional | Categoría funcional general. |
| double bond / triple bond | enlace doble / enlace triple | Mantener orden adjetival natural. |
| bond order | orden de enlace | No “tipo de enlace” cuando se alude al orden 1/2/3. |
| ring / fused ring | anillo / anillo fusionado | Fusión comparte dos átomos y un enlace. |
| aromatic ring | anillo aromático | No equiparar aromaticidad a un dibujo de Kekulé. |
| stereochemistry | estereoquímica | E/Z o R/S según contexto. |
| E/Z stereochemistry | estereoquímica E/Z | Conservar descriptor solo si está definido. |
| unspecified | sin especificar | Distinguir de E y Z explícitos. |
| implicit / explicit hydrogen | hidrógeno implícito / explícito | `H` como símbolo puede permanecer. |
| skeletal formula | fórmula esquelética | También “representación esquelética” en selector de vista. |
| condensed structural formula | fórmula semidesarrollada | En UI, “vista semidesarrollada” es coherente. |
| molecular formula | fórmula molecular | Composición, no conectividad. |
| molecular structure | estructura molecular | Conectividad y enlaces. |
| unsaturation | insaturación | Para índice, `degree of unsaturation (DoU)` / `índice de deficiencia de hidrógeno (IDH)`. |
| isomeric SMILES | SMILES isomérico | “SMILES” invariable. |

## Comprobaciones automatizables recomendadas

1. Inventario AST que falle si una llamada literal `t("…")` carece de par EN; incluir `aria-label`, `title`, placeholder y copy móvil.
2. Paridad de placeholders y variables para pares exactos, con reglas de plural EN/ES para 0, 1 y varios.
3. Lista de excepciones para términos idénticos válidos (`SMILES`, extensiones, símbolos y cognados químicos), sin tratar igualdad como error por sí sola.
4. Pruebas de idioma en vivo para errores y éxitos visibles de SMILES directo/archivo, fórmula, nombre e historial.
5. Pruebas de explicaciones con fixtures de `CC=CC`, `C/C=C/C` y `C/C=C\\C`: nombre y texto deben respetar E/Z explícito o sin especificar.
6. Pruebas de nombre y explicación EN/ES para una cadena, aromático, anillo fusionado, alcohol, ácido y amina; comprobar estructura y hechos dinámicos, no reemplazos literales.
7. Pruebas de mensajes de estructura no soportada, fusión y valencia en ambos idiomas, preservando variables como elemento, locante y número.
8. Comprobación de `html lang` y contenido inicial para `/en/` y `/es/`, y de etiquetas accesibles tras alternar idioma.

## Validación final y límites

Después de generar los informes, la suite volvió a pasar **602/602**, las regresiones externas **16/16**, el comparador externo E/Z **15/15**, lint terminó con **0 errores y las mismas 11 advertencias**, y el build finalizó correctamente. La carga de archivo mediante selector no pudo completarse con la automatización local; el código compartido de importación se examinó, pero esa interacción debe incluirse en una futura prueba de UI. Los nombres EN/ES de las 12 estructuras muestreadas fueron coherentes; esta muestra no demuestra ausencia universal de nombres híbridos. No se modificó producción, tests existentes, `reports/external-molecule-audit/`, `reports/external-molecule-audit-current/` ni fixtures químicos.
