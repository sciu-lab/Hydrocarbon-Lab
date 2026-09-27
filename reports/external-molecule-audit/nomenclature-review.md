# Arbitraje nomenclatural de los 100 PARTIAL

## Auditoría original

| Estado original | Casos | % de 122 |
| --- | ---: | ---: |
| PASS | 13 | 10.7 % |
| PARTIAL | 100 | 82.0 % |
| FAIL-NAME | 4 | 3.3 % |
| FAIL-STRUCTURE | 5 | 4.1 % |
| CRASH | 0 | 0.0 % |

## Tras el arbitraje

| Estado tras arbitraje | Casos | % de 122 |
| --- | ---: | ---: |
| PASS | 13 | 10.7 % |
| PASS-ALTERNATIVE | 17 | 13.9 % |
| PASS-STYLE | 81 | 66.4 % |
| PARTIAL-REVIEW | 0 | 0.0 % |
| FAIL-NAME-PARENT | 0 | 0.0 % |
| FAIL-NAME-NUMBERING | 2 | 1.6 % |
| FAIL-NAME-FUNCTIONAL | 0 | 0.0 % |
| FAIL-NAME-SUBSTITUENT | 0 | 0.0 % |
| FAIL-NAME-MULTIPLE-BOND | 0 | 0.0 % |
| FAIL-NAME-STEREO | 4 | 3.3 % |
| FAIL-NAME-SYNTAX | 0 | 0.0 % |
| FAIL-NAME-OTHER | 0 | 0.0 % |
| FAIL-STRUCTURE | 5 | 4.1 % |
| CRASH | 0 | 0.0 % |

Lote congelado: **122 fixtures, 122 CID únicos**. Se revisaron exactamente los **100 PARTIAL** de `results.json`. Los 13 PASS, 4 FAIL-NAME, 5 FAIL-STRUCTURE y 0 CRASH originales se conservan en sus archivos y solo se reflejan en el recuento global; los 4 FAIL-NAME originales se muestran bajo el subtipo estereoquímico ya confirmado.

## Criterio nomenclatural

El campo `IUPACName` de PubChem se utiliza como referencia, pero no se presume que cada valor sea un PIN. A = PIN verificado; B = nombre sistemático IUPAC válido no necesariamente preferido; C = nombre retenido aceptable; D = tradicional/común; E = sinónimo de base de datos sin validez sistemática inferida; F = incorrecto. Los sinónimos PubChem se registraron como información auxiliar y nunca como lista blanca. IUPAC admite nombres generales sistemáticos válidos distintos del PIN ([Blue Book P-1](https://iupac.qmul.ac.uk/BlueBook/P1.html)); el tratamiento de localizadores sigue P-14.3.3–4 ([Blue Book P-1](https://iupac.qmul.ac.uk/BlueBook/P1.html#P-14.3)).

La salida de la primera auditoría fue capturada en español, mientras PubChem publicó los nombres en inglés. Se tradujeron morfemas nomenclaturales conservando localizadores, sufijos y orden antes de arbitrar. Este informe evalúa el contenido químico de esas salidas; no afirma haber probado el texto de la interfaz en inglés.

## Resultados por familia

| Familia | Total | PASS + alternativas + estilo | PARTIAL-REVIEW | FAIL | Éxito entre resueltos |
| --- | ---: | ---: | ---: | ---: | ---: |
| alcanos lineales | 6 | 6 | 0 | 0 | 100 % |
| alcanos ramificados | 8 | 8 | 0 | 0 | 100 % |
| alquenos | 7 | 4 | 0 | 3 | 57.1 % |
| alquinos | 6 | 6 | 0 | 0 | 100 % |
| dienos/polienos | 6 | 4 | 0 | 2 | 66.7 % |
| cicloalcanos | 7 | 7 | 0 | 0 | 100 % |
| cicloalquenos | 5 | 3 | 0 | 2 | 60 % |
| benceno y derivados | 10 | 10 | 0 | 0 | 100 % |
| alcoholes | 8 | 8 | 0 | 0 | 100 % |
| aldehídos | 8 | 8 | 0 | 0 | 100 % |
| cetonas | 7 | 7 | 0 | 0 | 100 % |
| varios grupos funcionales | 1 | 1 | 0 | 0 | 100 % |
| ácidos carboxílicos | 7 | 7 | 0 | 0 | 100 % |
| éteres | 6 | 6 | 0 | 0 | 100 % |
| ésteres | 6 | 6 | 0 | 0 | 100 % |
| aminas | 7 | 7 | 0 | 0 | 100 % |
| amidas | 6 | 6 | 0 | 0 | 100 % |
| otros compatibles | 5 | 5 | 0 | 0 | 100 % |
| estereoquímica E/Z | 4 | 0 | 0 | 4 | 0 % |
| anillos fusionados | 2 | 2 | 0 | 0 | 100 % |

## Causas raíz probables y reproducciones mínimas

### Localizador de metilo omitido en cicloalquenos

- Casos afectados: 2 (HC-044, HC-045).
- Caso mínimo: HC-045.
- SMILES de entrada: `C1=CC(C)CCC1`.
- Nombre/representación esperada: `3-methylcyclohexene`.
- Salida observada: `metilciclohex-1-eno (methylcyclohex-1-ene)`.
- Diferencia: falta 3- para metilo.
- Regla violada: IUPAC P-14.3.4: el localizador no puede omitirse si permite otro isómero.
- Resultado esperado tras una futura corrección: `3-methylcyclohexene`.
- Hipótesis: la generación del nombre del cicloalqueno elimina también el localizador del sustituyente al simplificar el del doble enlace.

### Descriptor E/Z omitido en el nombre, ya confirmado en fase uno

- Casos afectados: 4 (HC-117, HC-118, HC-119, HC-120).
- Caso mínimo: HC-117.
- SMILES de entrada: `C/C=C/C`.
- Nombre/representación esperada: `(E)-but-2-ene`.
- Salida observada: `but-2-eno`.
- Diferencia: falta (E)-.
- Regla violada: IUPAC P-91: un doble enlace acíclico con configuración definida necesita descriptor E/Z.
- Resultado esperado tras una futura corrección: `(E)-but-2-ene`.
- Hipótesis: la ruta de nomenclatura no incorpora la configuración geométrica almacenada en el grafo.

### Configuración E/Z añadida al exportar, ya confirmada en fase uno

- Casos afectados: 5 (HC-018, HC-020, HC-021, HC-030, HC-031).
- Caso mínimo: HC-018.
- SMILES de entrada: `CC=CC`.
- Nombre/representación esperada: `but-2-ene; SMILES exportado sin E/Z especificado`.
- Salida observada: `but-2-eno; SMILES exportado C/C=C/C`.
- Diferencia: la salida selecciona un estereoisómero ausente en la entrada.
- Regla violada: La estructura exportada debe preservar la configuración especificada o no especificada del fixture.
- Resultado esperado tras una futura corrección: `but-2-ene; SMILES exportado sin E/Z especificado`.
- Hipótesis: el serializer infiere E/Z de las coordenadas de dibujo cuando la entrada no definía configuración.

## Dictámenes individuales de los 100 PARTIAL

| ID | Familia | Nombre PubChem | Nombre Hydrocarbon Lab | Dictamen | Confianza | Área |
| --- | --- | --- | --- | --- | --- | --- |
| HC-002 | alcanos lineales | `ethane` | `etano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-003 | alcanos lineales | `propane` | `propano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-004 | alcanos lineales | `butane` | `butano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-005 | alcanos lineales | `pentane` | `pentano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-006 | alcanos lineales | `hexane` | `hexano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-007 | alcanos ramificados | `2-methylpropane` | `2-metilpropano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-008 | alcanos ramificados | `2-methylbutane` | `2-metilbutano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-009 | alcanos ramificados | `2-methylpentane` | `2-metilpentano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-010 | alcanos ramificados | `3-methylpentane` | `3-metilpentano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-011 | alcanos ramificados | `2,2-dimethylbutane` | `2,2-dimetilbutano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-012 | alcanos ramificados | `2,3-dimethylbutane` | `2,3-dimetilbutano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-013 | alcanos ramificados | `2,2,3-trimethylbutane` | `2,2,3-trimetilbutano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-014 | alcanos ramificados | `3-ethyl-2-methylpentane` | `3-etil-2-metilpentano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-015 | alquenos | `ethene` | `eteno` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-016 | alquenos | `prop-1-ene` | `prop-1-eno` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-017 | alquenos | `but-1-ene` | `but-1-eno` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-019 | alquenos | `2-methylprop-1-ene` | `2-metilprop-1-eno` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-022 | alquinos | `acetylene` | `etino` | PASS-ALTERNATIVE | high | parent alquino |
| HC-023 | alquinos | `prop-1-yne` | `prop-1-ino` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-024 | alquinos | `but-1-yne` | `but-1-ino` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-025 | alquinos | `but-2-yne` | `but-2-ino` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-026 | alquinos | `3-methylpent-1-yne` | `3-metilpent-1-ino` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-027 | alquinos | `hexa-1,3-diyne` | `hexa-1,3-diino` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-028 | dienos/polienos | `hex-1-en-3-yne` | `hex-1-en-3-ino` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-029 | dienos/polienos | `hept-1-en-5-yne` | `hept-1-en-5-ino` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-032 | dienos/polienos | `hepta-1,3-diyne` | `hepta-1,3-diino` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-033 | dienos/polienos | `octa-1,3-diyne` | `octa-1,3-diino` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-035 | cicloalcanos | `cyclobutane` | `ciclobutano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-038 | cicloalcanos | `methylcyclohexane` | `metilciclohexano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-039 | cicloalcanos | `1,2-dimethylcyclohexane` | `1,2-dimetilciclohexano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-040 | cicloalcanos | `1-ethyl-3-methylcyclohexane` | `1-etil-3-metilciclohexano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-041 | cicloalquenos | `cyclopentene` | `ciclopent-1-eno` | PASS-STYLE | high | omisión o inclusión de localizador redundante |
| HC-042 | cicloalquenos | `cyclohexene` | `ciclohex-1-eno` | PASS-STYLE | high | omisión o inclusión de localizador redundante |
| HC-043 | cicloalquenos | `cyclohexa-1,3-diene` | `ciclohexa-1,3-dieno` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-044 | cicloalquenos | `1-methylcyclopentene` | `metilciclopent-1-eno` | FAIL-NAME-NUMBERING | high | localizador de sustituyente en cicloalqueno |
| HC-045 | cicloalquenos | `3-methylcyclohexene` | `metilciclohex-1-eno` | FAIL-NAME-NUMBERING | high | localizador de sustituyente en cicloalqueno |
| HC-046 | benceno y derivados | `benzene` | `benceno` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-047 | benceno y derivados | `toluene` | `metilbenceno` | PASS-ALTERNATIVE | high | parent aromático |
| HC-048 | benceno y derivados | `ethylbenzene` | `etilbenceno` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-049 | benceno y derivados | `1,2-xylene` | `1,2-dimetilbenceno` | PASS-ALTERNATIVE | high | parent aromático y localizadores |
| HC-050 | benceno y derivados | `1,3-xylene` | `1,3-dimetilbenceno` | PASS-ALTERNATIVE | high | parent aromático y localizadores |
| HC-051 | benceno y derivados | `1,4-xylene` | `1,4-dimetilbenceno` | PASS-ALTERNATIVE | high | parent aromático y localizadores |
| HC-052 | benceno y derivados | `1-ethyl-3-methylbenzene` | `1-etil-3-metilbenceno` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-053 | benceno y derivados | `1-ethyl-2,4-dimethylbenzene` | `1-etil-2,4-dimetilbenceno` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-054 | benceno y derivados | `propylbenzene` | `propilbenceno` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-055 | benceno y derivados | `cumene` | `(1-metiletil)benceno` | PASS-ALTERNATIVE | high | sustituyente ramificado |
| HC-057 | alcoholes | `ethanol` | `etan-1-ol` | PASS-STYLE | high | omisión o inclusión de localizador redundante |
| HC-061 | alcoholes | `2-methylpropan-2-ol` | `2-metilpropan-2-ol` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-062 | alcoholes | `pentane-1,3-diol` | `pentan-1,3-diol` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-063 | alcoholes | `propane-1,2,3-triol` | `propan-1,2,3-triol` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-064 | aldehídos | `formaldehyde` | `metanal` | PASS-ALTERNATIVE | high | sufijo aldehído |
| HC-065 | aldehídos | `acetaldehyde` | `etanal` | PASS-ALTERNATIVE | high | sufijo aldehído |
| HC-068 | aldehídos | `2-methylpropanal` | `2-metilpropanal` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-069 | aldehídos | `3-methylbutanal` | `3-metilbutanal` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-070 | aldehídos | `cyclopropanecarbaldehyde` | `ciclopropanocarbaldehído` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-071 | aldehídos | `cyclopentanecarbaldehyde` | `ciclopentanocarbaldehído` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-072 | cetonas | `propan-2-one` | `propan-2-ona` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-073 | cetonas | `butan-2-one` | `butan-2-ona` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-074 | cetonas | `pentan-2-one` | `pentan-2-ona` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-075 | cetonas | `pentan-3-one` | `pentan-3-ona` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-076 | cetonas | `3-methylbutan-2-one` | `3-metilbutan-2-ona` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-078 | cetonas | `hexan-2-one` | `hexan-2-ona` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-079 | cetonas | `hexan-3-one` | `hexan-3-ona` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-080 | ácidos carboxílicos | `formic acid` | `ácido metanoico` | PASS-ALTERNATIVE | high | ácido carboxílico |
| HC-081 | ácidos carboxílicos | `acetic acid` | `ácido etanoico` | PASS-ALTERNATIVE | high | ácido carboxílico |
| HC-082 | ácidos carboxílicos | `propanoic acid` | `ácido propanoico` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-083 | ácidos carboxílicos | `2-methylpropanoic acid` | `ácido 2-metilpropanoico` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-084 | ácidos carboxílicos | `cyclohexanecarboxylic acid` | `ácido ciclohexanocarboxílico` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-085 | ácidos carboxílicos | `butanoic acid` | `ácido butanoico` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-086 | ácidos carboxílicos | `pentanoic acid` | `ácido pentanoico` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-087 | éteres | `methoxymethane` | `metoximetano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-088 | éteres | `methoxyethane` | `metoxietano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-089 | éteres | `ethoxyethane` | `etoxietano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-090 | éteres | `1-methoxypropane` | `1-metoxipropano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-091 | éteres | `2-methoxypropane` | `2-metoxipropano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-092 | éteres | `1-methoxybutane` | `1-metoxibutano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-093 | ésteres | `methyl formate` | `metanoato de metilo` | PASS-ALTERNATIVE | high | nomenclatura de éster |
| HC-094 | ésteres | `methyl acetate` | `etanoato de metilo` | PASS-ALTERNATIVE | high | nomenclatura de éster |
| HC-095 | ésteres | `ethyl acetate` | `etanoato de etilo` | PASS-ALTERNATIVE | high | nomenclatura de éster |
| HC-096 | ésteres | `methyl propanoate` | `propanoato de metilo` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-097 | ésteres | `methyl butanoate` | `butanoato de metilo` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-098 | ésteres | `ethyl propanoate` | `propanoato de etilo` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-099 | aminas | `methanamine` | `metanamina` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-100 | aminas | `ethanamine` | `etanamina` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-101 | aminas | `propan-1-amine` | `propan-1-amina` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-102 | aminas | `propan-2-amine` | `propan-2-amina` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-103 | aminas | `2-methylpropan-2-amine` | `2-metilpropan-2-amina` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-104 | aminas | `N,N-dimethylmethanamine` | `N,N-dimetilmetanamina` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-105 | aminas | `butan-1-amine` | `butan-1-amina` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-106 | amidas | `formamide` | `metanamida` | PASS-ALTERNATIVE | high | sufijo amida |
| HC-107 | amidas | `acetamide` | `etanamida` | PASS-ALTERNATIVE | high | sufijo amida |
| HC-108 | amidas | `propanamide` | `propanamida` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-109 | amidas | `butanamide` | `butanamida` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-110 | amidas | `pentanamide` | `pentanamida` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-111 | amidas | `2-methylpropanamide` | `2-metilpropanamida` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-113 | otros compatibles | `1-chloropropane` | `1-cloropropano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-114 | otros compatibles | `2-chloropropane` | `2-cloropropano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-115 | otros compatibles | `1-bromo-2-methylpropane` | `1-bromo-2-metilpropano` | PASS-STYLE | high | terminología y ortografía español/inglés |
| HC-121 | anillos fusionados | `1,2,3,4,4a,5,6,7,8,8a-decahydronaphthalene` | `biciclo[4.4.0]decano` | PASS-ALTERNATIVE | high | parent bicíclico |
| HC-122 | anillos fusionados | `2,3,3a,4,5,6,7,7a-octahydro-1H-indene` | `biciclo[4.3.0]nonano` | PASS-ALTERNATIVE | high | parent bicíclico |

Los motivos, SMILES canonical/isomeric, fórmula, sinónimos relevantes, perfil del grafo y fuentes de cada dictamen están en `nomenclature-review.json`.

## Integridad

- Fixtures al inicio y al final: 122; CID únicos: 122.
- PARTIAL originales arbitrados: 100.
- Los cuatro archivos de la fase uno permanecen disponibles y no se sobrescribieron.
- Huellas SHA-256 de entrada: `fixtures.json` = `8d23645ee49e9d25d84d471aabd7d99c979a9bf0890619afb6647b5984899ad8`; `results.json` = `d8c5b5e714595aaf5009ceb87ba5dfa15e89750e993046fb7e4e1e9d4badb61e`; `results.csv` = `d967ffbe058db18b2ebda902d368b168ec4d3102b217eb4721eee0522ef17917`; `summary.md` = `54beeb4d2d946bf7127b9a4fdd15a24e77055c02dfceb219513ad7ba6d7974cb`.
- El corpus y los SMILES permanecieron inalterados; no se modificó código de producción ni se escribieron tests de regresión.
- Los FAIL nuevos tienen razón específica y confianza alta. La mera diferencia textual y la presencia en sinónimos no determinaron un FAIL ni un PASS.
