import type { AppLanguage } from "./i18n.ts";
import type { ReviewParams } from "./practice-review.ts";

/** Review models persist message identities and chemical parameters, never this prose. */
const MESSAGES: Record<string, { es: string; en: string }> = {
  "review.title.parent": { es: "Estructura principal", en: "Parent structure" },
  "review.title.function": { es: "Grupo funcional", en: "Functional group" },
  "review.title.numbering": { es: "Numeración", en: "Numbering" },
  "review.title.unsaturation": { es: "Insaturación", en: "Unsaturation" },
  "review.title.substituent": { es: "Sustituyente", en: "Substituent" },
  "review.title.alphabetical": { es: "Orden de los prefijos", en: "Prefix order" },
  "review.title.ester-alkyl": { es: "Parte alquilo del éster", en: "Ester alkyl portion" },
  "review.title.ez": { es: "Estereoquímica E/Z", en: "E/Z stereochemistry" },
  "review.title.assembly": { es: "Nombre completo", en: "Complete name" },
  "review.parent.chain": { es: "El padre seleccionado contiene {count} átomos de carbono. Su nombre es {name}.", en: "The selected parent contains {count} carbon atoms. Its name is {name}." },
  "review.parent.ester": { es: "La parte del éster derivada del ácido contiene {count} carbonos, incluido el carbono del carbonilo. Estos átomos forman el padre de la parte ácida.", en: "The acid-derived ester portion contains {count} carbons, including the carbonyl carbon. These atoms form the parent of the acid portion." },
  "review.parent.ring": { es: "El padre es un anillo de {count} carbonos: {name}. Las ramas quedan fuera del anillo principal.", en: "The parent is a {count}-carbon ring: {name}. Branches lie outside the parent ring." },
  "review.parent.aromatic": { es: "El padre es el anillo aromático de {count} carbonos: {name}. Los enlaces de Kekulé representan el anillo aromático; no se nombran como alquenos independientes.", en: "The parent is the {count}-carbon aromatic ring: {name}. Kekulé bonds represent the aromatic ring; they are not named as independent alkenes." },
  "review.function": { es: "{group} es la función principal y aporta el sufijo. Sus carbonos de referencia reciben los localizadores {locants} en el padre.", en: "{group} is the principal function and supplies the suffix. Its reference carbons have locants {locants} in the parent." },
  "review.ether": { es: "El enlace éter –O– une dos partes de carbono. La parte fuera del padre se cita como sustituyente alcoxi.", en: "The ether linkage –O– connects two carbon portions. The portion outside the parent is named as an alkoxy substituent." },
  "review.numbering.function": { es: "La función principal decide la dirección: recibe {selected}, frente a {reverse} desde el otro extremo. Se conserva el menor conjunto antes de considerar insaturaciones y prefijos.", en: "The principal function determines the direction: its locants are {selected}, versus {reverse} from the other end. The lower set takes precedence over unsaturation and prefixes." },
  "review.numbering.unsaturation": { es: "Los enlaces múltiples deciden la dirección: reciben {selected}, frente a {reverse} desde el otro extremo. Este criterio precede a los prefijos.", en: "Multiple bonds determine the direction: their locants are {selected}, versus {reverse} from the other end. This criterion precedes prefixes." },
  "review.numbering.substituent": { es: "Los sustituyentes deciden la dirección: el conjunto {selected} es menor que {reverse} desde el otro extremo.", en: "Substituents determine the direction: the set {selected} is lower than {reverse} from the other end." },
  "review.numbering.tie": { es: "Los localizadores {selected} empatan con {reverse} desde el otro extremo. Este criterio no distingue las dos direcciones; se muestra la numeración seleccionada por el motor.", en: "Locants {selected} tie with {reverse} from the other end. This criterion does not distinguish the directions; the numbering selected by the engine is shown." },
  "review.numbering.selected": { es: "Se muestran los localizadores {selected} de la numeración seleccionada por el motor y {reverse} desde el otro extremo. Esta comparación aislada no permite explicar por sí sola la selección.", en: "The engine's selected numbering has locants {selected}, versus {reverse} from the other end. This isolated comparison cannot by itself explain the selection." },
  "review.numbering.ring": { es: "La numeración del anillo asigna {selected} a los sustituyentes. Se conserva el menor conjunto de localizadores del padre elegido; la orientación visual del dibujo no cambia esa numeración.", en: "Ring numbering assigns {selected} to the substituents. The lower locant set of the selected parent is retained; visual orientation does not change this numbering." },
  "review.unsaturation": { es: "El enlace de orden {order} une C{locant} y C{next}. Su localizador es {locant}, el menor de los dos carbonos enlazados.", en: "The bond of order {order} joins C{locant} and C{next}. Its locant is {locant}, the lower of the two bonded carbons." },
  "review.substituent": { es: "El sustituyente {name} está unido al padre en C{locants}. Se cita como prefijo con este localizador cuando el nombre de referencia lo requiere.", en: "The {name} substituent is attached to the parent at C{locants}. It is cited as a prefix with this locant when required by the reference name." },
  "review.substituent.multiple": { es: "Hay {count} sustituyentes {name}, unidos en los localizadores {locants}. El nombre agrupa sus localizadores y utiliza el prefijo multiplicativo correspondiente.", en: "There are {count} {name} substituents at locants {locants}. The name groups their locants and uses the corresponding multiplicative prefix." },
  "review.alphabetical": { es: "En este idioma, los prefijos se citan en este orden: {names}. Los prefijos multiplicativos como di- o tri- no determinan la alfabetización.", en: "In this language, the prefixes are cited in this order: {names}. Multiplicative prefixes such as di- or tri- do not determine alphabetization." },
  "review.ester-alkyl": { es: "La parte alquilo unida al oxígeno es {name}. Se combina con la parte derivada del ácido, cuyo padre contiene {count} carbonos, según el orden del idioma.", en: "The alkyl portion attached to oxygen is {name}. It is combined with the acid-derived portion, whose parent contains {count} carbons, in the language's naming order." },
  "review.ez.E": { es: "En el doble enlace de C{locant}, los sustituyentes de mayor prioridad identificados por el motor están en lados opuestos: descriptor {descriptor}. Se resaltan el enlace y sus átomos de prioridad.", en: "At the C{locant} double bond, the higher-priority substituents identified by the engine are on opposite sides: descriptor {descriptor}. The bond and its priority atoms are highlighted." },
  "review.ez.Z": { es: "En el doble enlace de C{locant}, los sustituyentes de mayor prioridad identificados por el motor están en el mismo lado: descriptor {descriptor}. Se resaltan el enlace y sus átomos de prioridad.", en: "At the C{locant} double bond, the higher-priority substituents identified by the engine are on the same side: descriptor {descriptor}. The bond and its priority atoms are highlighted." },
  "review.assembly": { es: "Los componentes anteriores, con los localizadores, prefijos y sufijos del perfil de referencia, forman: {name}.", en: "The preceding components, with the reference profile's locants, prefixes and suffixes, form: {name}." },
  "review.group.alcohol": { es: "El grupo hidroxilo –OH", en: "The hydroxyl group –OH" },
  "review.group.aldehyde": { es: "El grupo aldehído –CHO", en: "The aldehyde group –CHO" },
  "review.group.ketone": { es: "El carbonilo de cetona >C=O", en: "The ketone carbonyl >C=O" },
  "review.group.carboxylicAcid": { es: "El grupo carboxilo –COOH", en: "The carboxyl group –COOH" },
  "review.group.ester": { es: "El grupo éster –COOR", en: "The ester group –COOR" },
  "review.group.amine": { es: "El grupo amino –NH₂", en: "The amino group –NH₂" },
  "review.group.amide": { es: "El grupo amida –C(=O)N", en: "The amide group –C(=O)N" },
  "review.group.nitrile": { es: "El grupo nitrilo –C≡N", en: "The nitrile group –C≡N" },
  "review.issue.WRONG_EZ_DESCRIPTOR": { es: "El resto del nombre coincide, pero este doble enlace requiere {descriptor} en C{locant}.", en: "The rest of the name matches, but this double bond requires {descriptor} at C{locant}." },
  "review.issue.WRONG_SUBSTITUENT_LOCANT": { es: "El sustituyente y el resto del nombre coinciden. Su localizador es {expected}, no {actual}.", en: "The substituent and the rest of the name match. Its locant is {expected}, rather than {actual}." },
  "review.issue.WRONG_FUNCTIONAL_GROUP_LOCANT": { es: "La función y el resto del nombre coinciden. Su localizador es {expected}, no {actual}.", en: "The function and the rest of the name match. Its locant is {expected}, rather than {actual}." },
  "review.issue.WRONG_UNSATURATION_LOCANT": { es: "El enlace múltiple y el resto del nombre coinciden. Su localizador es {expected}, no {actual}.", en: "The multiple bond and the rest of the name match. Its locant is {expected}, rather than {actual}." },
  "review.issue.WRONG_NUMBERING_DIRECTION": { es: "Los localizadores escritos corresponden a invertir conjuntamente la numeración del padre. Conserva la dirección que muestra el paso de numeración.", en: "The written locants correspond to reversing the parent numbering together. Retain the direction shown in the numbering step." },
  "review.issue.MISSING_SUBSTITUENT": { es: "La respuesta conserva el padre, pero omite el único sustituyente {name}.", en: "The answer retains the parent but omits the single {name} substituent." },
  "review.issue.WRONG_ALPHABETICAL_ORDER": { es: "Los dos prefijos y sus localizadores coinciden, pero aparecen en el orden contrario al de referencia en el idioma de la respuesta enviada.", en: "The two prefixes and their locants match, but appear in the reverse order to the reference in the submitted answer's language." },
  "review.issue.WRONG_PARENT_LENGTH": { es: "El padre de esta cadena sin sustituyentes contiene {expected} carbonos. La respuesta nombra uno de {actual} carbonos.", en: "The parent of this unsubstituted chain contains {expected} carbons. The answer names a parent with {actual} carbons." },
  "review.mcq.parent-length": { es: "El padre contiene {expected} carbonos. La opción seleccionada nombra uno de {actual} carbonos.", en: "The parent contains {expected} carbons. The selected option names a parent with {actual} carbons." },
  "review.mcq.omitted-substituent": { es: "La opción seleccionada omite un sustituyente {name} presente en esta molécula.", en: "The selected option omits a {name} substituent present in this molecule." },
  "review.issue.WRONG_SUFFIX": { es: "El resto del texto coincide, pero el sufijo de referencia es {suffix}.", en: "The rest of the text matches, but the reference suffix is {suffix}." },
  "review.issue.UNKNOWN_MISMATCH": { es: "La respuesta no coincide con el nombre de referencia. No se puede atribuir con seguridad a un único componente; los pasos muestran cómo se obtiene el nombre de esta molécula.", en: "The answer does not match the reference name. It cannot safely be attributed to one component; the steps show how this molecule's name is obtained." },
};

export function formatPracticeReviewMessage(key: string, params: ReviewParams, locale: AppLanguage): string {
  const template = MESSAGES[key]?.[locale];
  if (template === undefined) throw new Error(`Unknown review message: ${key}`);
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing review parameter: ${name}`);
    if (name === "group" && typeof value === "string") return MESSAGES[`review.group.${value}`][locale];
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object" && "es" in value && "en" in value) return value[locale];
    return String(value);
  });
}
