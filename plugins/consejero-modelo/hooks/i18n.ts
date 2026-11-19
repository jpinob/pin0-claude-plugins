// Languages: which one a draft is written in, and every text the mod shows, in Spanish and English. Pure.
import type { Bilingual, Lang } from '../types'

export type { Bilingual, Lang }

/** The language used before any draft says otherwise, when Claude Code's `language` setting names neither. */
export const FALLBACK: Lang = 'en'

// Frequent words that tell the two languages apart, written lowercase and without accents.
// Reason: words both languages share ("a", "no", "test") are left out, so they count for neither.
const MARKERS: Record<Lang, ReadonlySet<string>> = {
  es: new Set([
    'el', 'la', 'los', 'las', 'de', 'del', 'que', 'en', 'y', 'un', 'una', 'unos', 'unas', 'por', 'para', 'con',
    'es', 'se', 'al', 'lo', 'como', 'pero', 'su', 'sus', 'este', 'esta', 'esto', 'estos', 'mi', 'sin', 'sobre',
    'hay', 'cuando', 'donde', 'porque', 'muy', 'mas', 'tambien', 'ya', 'si', 'cada', 'todo', 'todos',
    'arregla', 'anade', 'haz', 'crea', 'implementa', 'escribe', 'revisa', 'dame', 'dime', 'explica', 'cambia',
    'quita', 'pon', 'busca', 'redacta', 'resume', 'traduce', 'disena', 'investiga', 'lee', 'clasifica', 'etiqueta',
    'migra', 'renombra', 'hazlo', 'mira', 'prueba', 'sube', 'usa',
  ]),
  en: new Set([
    'the', 'an', 'and', 'of', 'to', 'is', 'are', 'for', 'with', 'that', 'this', 'these', 'it', 'its', 'on',
    'from', 'by', 'be', 'as', 'at', 'my', 'your', 'please', 'when', 'what', 'which', 'how', 'why', 'into',
    'without', 'all', 'should', 'can', 'each', 'out', 'up', 'there', 'their', 'me', 'it',
    'fix', 'add', 'make', 'create', 'implement', 'write', 'review', 'give', 'tell', 'explain', 'change',
    'remove', 'put', 'find', 'draft', 'summarize', 'translate', 'design', 'research', 'read', 'classify', 'label',
  ]),
}

const plain = (word: string): string => word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * The language of a text, from the marker words it holds and Spanish-only signs (ñ, ¿, ¡, accents).
 * Null when the text has no marker or both languages tie, so the caller keeps the one it had.
 */
export function detectLang(text: string): Lang | null {
  const words = text.split(/[^\p{L}]+/u).filter(w => w !== '').map(plain)
  let es = words.filter(w => MARKERS.es.has(w)).length
  const en = words.filter(w => MARKERS.en.has(w)).length
  // Reason: one sign is enough for a short Spanish draft, and capping it keeps a quoted name from deciding alone.
  es += Math.min(2, (text.match(/[ñÑ¿¡áéíóúÁÉÍÓÚ]/g) ?? []).length)
  if (es === en) return null

  return es > en ? 'es' : 'en'
}

/** Claude Code's `language` setting as one of the two languages; anything else is the fallback. */
export function langFromSetting(value: unknown): Lang {
  if (typeof value !== 'string') return FALLBACK
  if (/span|espa|castell|^es\b/i.test(value)) return 'es'
  if (/engl|ingl|^en\b/i.test(value)) return 'en'

  return FALLBACK
}

/** Two words joined by the language's "and". */
const both = (lang: Lang, a: string, b: string): string => `${a} ${lang === 'es' ? 'y' : 'and'} ${b}`

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** A whole number with the language's thousands separator: 85.000 in Spanish, 85,000 in English. */
export const thousands = (n: number, lang: Lang): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'es' ? '.' : ',')

/** Every text the mod shows, by language. Functions take what changes; the rest is fixed. */
export const MESSAGES = {
  es: {
    // Band
    advice: 'Consejo: ',
    fineWith: (model: string) => `vas bien con ${model}`,
    unknownModel: '· no conozco tu modelo: prueba /consejo auditar ',
    improving: (who: string) => `${who} mejorando el prompt… `,
    apply: 'Aplicar',
    improve: 'Mejorar',
    turnOff: 'Desactivar',
    turnOn: 'Activar',
    advisorOff: 'Consejero desactivado ',
    pendingPause: 'Haiku mira cuando pares de escribir',
    pendingLooking: 'Haiku mirando…',
    pendingNoAnswer: 'Haiku no respondió; sin consejo',
    pendingInvalid: 'Haiku respondió algo que no vale; sin consejo',
    // Rules
    doubt: (a: string, b: string) => `duda entre ${both('es', a, b)}`,
    stepUp: (reason: string, model: string) => `${reason}: antes de ${model}, sube el effort`,
    // Aplicar
    applied: (model: string, effort: string) => `Aplicado: ${model} · ${effort}. Tu prompt sigue en la caja.`,
    applyFailed: (list: string) => `No se pudo aplicar (${list}). Cámbialo con /model o /effort.`,
    rowModel: 'modelo',
    noModelRow: 'no hay fila de modelo en /config',
    noEffortRow: 'no hay fila de effort en /config',
    menuRefused: 'el menú no aceptó el cambio',
    // Commands
    consejoDescription: 'Última sugerencia de modelo y effort, con su regla y su fuente. Con "auditar" revisa las fuentes',
    consejoHint: '[auditar]',
    mejoraDescription: 'Propone una versión mejor de tu prompt en un panel. Tú decides si la usas',
    mejoraHint: '[texto]',
    auditRunning: 'Ya hay una auditoría en marcha.',
    auditStarted: 'Auditando las fuentes de rules.ts. El informe sale aquí debajo en unos segundos.',
    askingOpinion: (model: string) => `Pido opinión a ${model} sobre esos avisos (una llamada de pago)…`,
    opinion: (model: string, text: string) => `Opinión del auditor (${model}). No cambia nada: decides tú.\n${text}`,
    noOpinion: (reason: string) => `El auditor no dio opinión (${reason}). Los avisos de arriba siguen valiendo.`,
    nothingToImprove: 'No hay prompt que mejorar: escribe uno o pon el texto detrás de /mejora.',
    preparing: (who: string) => `${who} está preparando la propuesta en el panel "Prompt mejorado".`,
    // /consejo report
    noAdvice: 'Todavía no hay ninguna sugerencia en esta sesión.',
    reportAdvice: (line: string) => `Consejo: ${line}`,
    reportSettings: (model: string, effort: string | null) => `Tienes puesto: ${model} · ${effort ?? 'effort sin leer'}`,
    reportShown: 'Se mostró en la banda.',
    reportSilent: 'No se mostró: coincide con lo que tienes puesto.',
    reportConfirmed: 'Coincide con lo que tienes puesto: la banda lo confirmó.',
    reportBy: (byHaiku: boolean) => `Clasificó: ${byHaiku ? 'Haiku' : 'las palabras de rules.ts'}`,
    reportModelRule: (id: string, model: string, source: string) => `Regla de modelo: ${id} (${model}). Fuente: ${source}`,
    reportEffortRule: (id: string, effort: string, source: string) => `Regla de effort: ${id} (${effort}). Fuente: ${source}`,
    reportStep: (source: string) => `Regla aplicada: effort antes que modelo. Fuente: ${source}`,
    reportConflict: (id: string, text: string | undefined) => `Choque ${id}: ${text ?? 'sin descripción en rules.ts'}`,
    // Haiku
    haikuLooking: '· Haiku mirando…',
    haikuNoAnswer: '· Haiku no respondió',
    haikuInvalid: '· Haiku respondió algo que no vale',
    haikuSays: '· según Haiku',
    haikuSteps: {
      off: 'apagado (clasifican las palabras)',
      waiting: 'espera a que dejes de escribir',
      looking: 'está mirando el borrador',
      answered: 'respondió',
      'no-answer': 'no respondió',
      'invalid-answer': 'respondió algo que no nombra una regla',
    },
    // Auditor
    auditHeader: (quotes: number, families: number) => `Auditoría de consejero-modelo: ${quotes} citas, ${families} familias.`,
    auditClean: 'Todo cuadra con las fuentes. No hay nada que revisar.',
    auditCount: (n: number) => (n === 1 ? '1 cosa no cuadra:' : `${n} cosas no cuadran:`),
    auditPageDown: (url: string) => `No se pudo leer ${url}: sus citas quedan sin comprobar.`,
    auditQuoteGone: (url: string, quote: string, users: string) => `Ya no aparece en ${url}: "${quote}". La usan: ${users}.`,
    auditNoModelTable: 'No encuentro la tabla de modelos en la página: no puedo comprobar familias.',
    auditUnknownFamily: (alias: string) => `La documentación lista un modelo que rules.ts no conoce: ${alias}.`,
    auditGoneFamily: (family: string) => `rules.ts tiene la familia ${family}, que ya no sale en la tabla de modelos.`,
    auditNoEffortTable: 'No encuentro la tabla de niveles de effort en la página: no puedo comprobarlos.',
    auditUnknownEffort: (level: string) => `La documentación lista un nivel de effort que el mod no conoce: ${level}.`,
    auditOrphanRule: (id: string, model: string) => `La regla ${id} apunta a ${model}, que no está en familias.`,
    auditorLanguage: 'en español',
    // Improver
    someModel: 'El modelo',
    paneTitle: 'Prompt mejorado',
    writeMore: (n: number) => `Escribe al menos ${n} caracteres antes de mejorar el prompt.`,
    noRoom: (reason: string) => `No hay sitio para el panel (${reason}). Ensancha la ventana y vuelve a pulsar Mejorar.`,
    notAPrompt: 'respondió algo que no es un prompt',
    failTimeout: 'tardó demasiado o se canceló',
    failEmpty: 'respondió vacío',
    failApi: (status: number | null | undefined) => `error de la API${status == null ? '' : ` ${status}`}`,
    failOther: 'no respondió',
    fillFailed: (refusal: string | undefined) =>
      `No pude poner la propuesta en la caja${refusal === undefined ? '' : ` (${refusal})`}. Sigue en el panel.`,
    filled: (tags: number) =>
      tags === 0
        ? 'Propuesta en la caja. Revísala y pulsa Enter cuando quieras.'
        : `Propuesta en la caja, con ${plural(tags, 'etiqueta', 'etiquetas')} por rellenar.`,
    undoFailed: 'No pude devolver tu texto a la caja.',
    idle: 'Escribe un prompt y pulsa Mejorar en la banda, o usa /mejora.',
    thinking: (who: string) => `${who} está reescribiendo tu prompt…`,
    boxUntouched: 'Tu caja no cambia hasta que pulses Preparar.',
    failed: (who: string, reason: string) => `${who} no pudo mejorarlo: ${reason}.`,
    boxSame: 'Tu prompt sigue igual en la caja.',
    proposalBy: (who: string) => `Propuesta de ${who}`,
    levels: {
      required: ['necesario', 'necesarios'],
      specify: ['a especificar', 'a especificar'],
      optional: ['opcional', 'opcionales'],
    },
    tooLong: (proposal: number, original: number) =>
      `Más larga de lo pedido: ${proposal} palabras sin etiquetas; tu texto tenía ${original}.`,
    rewritten: 'Cambios: lo ha reescrito casi entero. Compáralo con el tuyo antes de usarlo.',
    noChanges: 'Cambios: ninguno. Tu prompt ya estaba claro.',
    onlyQuestions: 'Cambios: tu texto queda igual; solo añade preguntas.',
    addedWords: (n: number) => `añadió ${plural(n, 'palabra', 'palabras')}`,
    keptAll: (added: string) => `Cambios: ${added}. No quitó nada de lo tuyo.`,
    droppedSome: (added: string, list: string, rest: number) =>
      `Cambios: ${added}. Quitó ${list}${rest > 0 ? ` y ${rest} más` : ''}.`,
    inBox: 'Ya está en tu caja: rellena las etiquetas y pulsa Enter.',
    // Settings card and Preparar
    promptTitle: 'Prompt',
    cardTitle: 'Modelo y effort',
    cardLooking: 'Haiku está mirando este borrador…',
    cardFailed: 'Haiku no respondió: sin sugerencia de modelo ni effort.',
    cardNoJudge: 'Sin Haiku no sé de qué tarea es este prompt: sin sugerencia.',
    modelRowText: (from: string, to: string, reason: string) => `Modelo: ${from} → ${to} · ${reason}`,
    rowEffort: (from: string, to: string, reason: string, isLower: boolean) =>
      `Effort: ${from} → ${to} · ${reason}${isLower ? ' · tarea nueva y el último turno acabó sin errores' : ''}`,
    reread: (tokens: number | null) =>
      `Aviso: cambiar de modelo a mitad de sesión rompe la caché. El modelo nuevo relee ${tokens === null ? 'toda la conversación' : `${thousands(tokens, 'es')} tokens`} sin caché y sale más caro.`,
    cardHold: (effort: string, why: string) => `Effort: te quedas en ${effort} · no lo bajo: ${why}`,
    holds: {
      continues: 'el prompt sigue la tarea anterior',
      errors: 'el último turno tuvo errores',
      'no-judge': 'sin Haiku no sé si es una tarea nueva',
    },
    picked: { use: 'Lo usarás.', discard: 'Lo descartas.' },
    prepare: 'Preparar',
    chooseAll: 'Elige Usar o Descartar en cada fila y pulsa Preparar.',
    partPrompt: 'prompt en la caja',
    partModel: (model: string) => `modelo ${model}`,
    partEffort: (effort: string) => `effort ${effort}`,
    prepared: (parts: string[]) =>
      parts.length === 0
        ? 'Nada que preparar: tu caja, tu modelo y tu effort siguen igual.'
        : `Preparado: ${parts.join(', ')}. Revisa la caja y pulsa Enter.`,
    prepareFailed: (list: string) => `No se pudo cambiar ${list}. Cámbialo con /model o /effort.`,
    doneNoPrompt: 'Preparado. Tu prompt sigue como lo escribiste: pulsa Enter cuando quieras.',
    rowsUndoFailed: 'No pude devolver el modelo o el effort: usa /model o /effort.',
    use: 'Usar',
    discard: 'Descartar',
    undo: 'Deshacer',
    close: 'Cerrar',
    cancel: 'Cancelar',
  },
  en: {
    advice: 'Advice: ',
    fineWith: (model: string) => `you're fine with ${model}`,
    unknownModel: "· I don't know your model: try /consejo audit ",
    improving: (who: string) => `${who} improving the prompt… `,
    apply: 'Apply',
    improve: 'Improve',
    turnOff: 'Turn off',
    turnOn: 'Turn on',
    advisorOff: 'Advisor off ',
    pendingPause: 'Haiku looks once you stop typing',
    pendingLooking: 'Haiku looking…',
    pendingNoAnswer: 'Haiku did not answer; no advice',
    pendingInvalid: 'Haiku answered something unusable; no advice',
    doubt: (a: string, b: string) => `torn between ${both('en', a, b)}`,
    stepUp: (reason: string, model: string) => `${reason}: before ${model}, raise the effort`,
    applied: (model: string, effort: string) => `Applied: ${model} · ${effort}. Your prompt is still in the box.`,
    applyFailed: (list: string) => `Could not apply it (${list}). Change it with /model or /effort.`,
    rowModel: 'model',
    noModelRow: 'no model row in /config',
    noEffortRow: 'no effort row in /config',
    menuRefused: 'the menu did not take the change',
    consejoDescription: 'Last model and effort advice, with its rule and its source. With "audit" it checks the sources',
    consejoHint: '[audit]',
    mejoraDescription: 'Proposes a better version of your prompt in a pane. You decide whether to use it',
    mejoraHint: '[text]',
    auditRunning: 'An audit is already running.',
    auditStarted: 'Auditing the sources of rules.ts. The report shows up below in a few seconds.',
    askingOpinion: (model: string) => `Asking ${model} for an opinion on those findings (one paid call)…`,
    opinion: (model: string, text: string) => `Auditor's opinion (${model}). It changes nothing: you decide.\n${text}`,
    noOpinion: (reason: string) => `The auditor gave no opinion (${reason}). The findings above still stand.`,
    nothingToImprove: 'No prompt to improve: write one or put the text after /mejora.',
    preparing: (who: string) => `${who} is preparing the proposal in the "Improved prompt" pane.`,
    noAdvice: 'No advice yet in this session.',
    reportAdvice: (line: string) => `Advice: ${line}`,
    reportSettings: (model: string, effort: string | null) => `You have: ${model} · ${effort ?? 'effort not read'}`,
    reportShown: 'It was shown in the band.',
    reportSilent: 'Not shown: it matches what you have.',
    reportConfirmed: 'It matches what you have: the band confirmed it.',
    reportBy: (byHaiku: boolean) => `Classified by: ${byHaiku ? 'Haiku' : 'the words in rules.ts'}`,
    reportModelRule: (id: string, model: string, source: string) => `Model rule: ${id} (${model}). Source: ${source}`,
    reportEffortRule: (id: string, effort: string, source: string) => `Effort rule: ${id} (${effort}). Source: ${source}`,
    reportStep: (source: string) => `Rule applied: effort before model. Source: ${source}`,
    reportConflict: (id: string, text: string | undefined) => `Conflict ${id}: ${text ?? 'no description in rules.ts'}`,
    haikuLooking: '· Haiku looking…',
    haikuNoAnswer: '· Haiku did not answer',
    haikuInvalid: '· Haiku answered something unusable',
    haikuSays: '· per Haiku',
    haikuSteps: {
      off: 'off (the words classify)',
      waiting: 'waits for you to stop typing',
      looking: 'is looking at the draft',
      answered: 'answered',
      'no-answer': 'did not answer',
      'invalid-answer': 'answered something that names no rule',
    },
    auditHeader: (quotes: number, families: number) => `consejero-modelo audit: ${quotes} quotes, ${families} families.`,
    auditClean: 'Everything matches the sources. Nothing to review.',
    auditCount: (n: number) => (n === 1 ? '1 thing does not match:' : `${n} things do not match:`),
    auditPageDown: (url: string) => `Could not read ${url}: its quotes stay unchecked.`,
    auditQuoteGone: (url: string, quote: string, users: string) => `No longer in ${url}: "${quote}". Used by: ${users}.`,
    auditNoModelTable: 'I cannot find the model table on the page: families stay unchecked.',
    auditUnknownFamily: (alias: string) => `The docs list a model rules.ts does not know: ${alias}.`,
    auditGoneFamily: (family: string) => `rules.ts has the family ${family}, which is no longer in the model table.`,
    auditNoEffortTable: 'I cannot find the effort level table on the page: levels stay unchecked.',
    auditUnknownEffort: (level: string) => `The docs list an effort level the mod does not know: ${level}.`,
    auditOrphanRule: (id: string, model: string) => `The rule ${id} points to ${model}, which is not in families.`,
    auditorLanguage: 'in English',
    someModel: 'The model',
    paneTitle: 'Improved prompt',
    writeMore: (n: number) => `Write at least ${n} characters before improving the prompt.`,
    noRoom: (reason: string) => `No room for the pane (${reason}). Widen the window and press Improve again.`,
    notAPrompt: 'answered something that is not a prompt',
    failTimeout: 'took too long or was cancelled',
    failEmpty: 'answered with nothing',
    failApi: (status: number | null | undefined) => `API error${status == null ? '' : ` ${status}`}`,
    failOther: 'did not answer',
    fillFailed: (refusal: string | undefined) =>
      `Could not put the proposal in the box${refusal === undefined ? '' : ` (${refusal})`}. It is still in the pane.`,
    filled: (tags: number) =>
      tags === 0
        ? 'Proposal in the box. Review it and press Enter when you want.'
        : `Proposal in the box, with ${plural(tags, 'tag', 'tags')} to fill in.`,
    undoFailed: 'Could not put your text back in the box.',
    idle: 'Write a prompt and press Improve in the band, or use /mejora.',
    thinking: (who: string) => `${who} is rewriting your prompt…`,
    boxUntouched: 'Your box does not change until you press Prepare.',
    failed: (who: string, reason: string) => `${who} could not improve it: ${reason}.`,
    boxSame: 'Your prompt is unchanged in the box.',
    proposalBy: (who: string) => `${who}'s proposal`,
    levels: {
      required: ['required', 'required'],
      specify: ['to specify', 'to specify'],
      optional: ['optional', 'optional'],
    },
    tooLong: (proposal: number, original: number) =>
      `Longer than asked: ${proposal} words without tags; your text had ${original}.`,
    rewritten: 'Changes: rewritten almost entirely. Compare it with yours before using it.',
    noChanges: 'Changes: none. Your prompt was already clear.',
    onlyQuestions: 'Changes: your text stays the same; it only adds questions.',
    addedWords: (n: number) => `added ${plural(n, 'word', 'words')}`,
    keptAll: (added: string) => `Changes: ${added}. Dropped nothing of yours.`,
    droppedSome: (added: string, list: string, rest: number) =>
      `Changes: ${added}. Dropped ${list}${rest > 0 ? ` and ${rest} more` : ''}.`,
    inBox: 'It is in your box: fill in the tags and press Enter.',
    promptTitle: 'Prompt',
    cardTitle: 'Model and effort',
    cardLooking: 'Haiku is reading this draft…',
    cardFailed: 'Haiku did not answer: no model or effort advice.',
    cardNoJudge: 'Without Haiku I cannot tell which task this prompt belongs to: no advice.',
    modelRowText: (from: string, to: string, reason: string) => `Model: ${from} → ${to} · ${reason}`,
    rowEffort: (from: string, to: string, reason: string, isLower: boolean) =>
      `Effort: ${from} → ${to} · ${reason}${isLower ? ' · a new task, and the last turn ended without errors' : ''}`,
    reread: (tokens: number | null) =>
      `Warning: switching models mid-session breaks the cache. The new model re-reads ${tokens === null ? 'the whole conversation' : `${thousands(tokens, 'en')} tokens`} uncached, which costs more.`,
    cardHold: (effort: string, why: string) => `Effort: staying at ${effort} · not lowering it: ${why}`,
    holds: {
      continues: 'the prompt follows the task before',
      errors: 'the last turn had errors',
      'no-judge': 'without Haiku I cannot tell whether it is a new task',
    },
    picked: { use: 'You will use it.', discard: 'You discard it.' },
    prepare: 'Prepare',
    chooseAll: 'Pick Use or Discard on each row and press Prepare.',
    partPrompt: 'prompt in the box',
    partModel: (model: string) => `model ${model}`,
    partEffort: (effort: string) => `effort ${effort}`,
    prepared: (parts: string[]) =>
      parts.length === 0
        ? 'Nothing to prepare: your box, model and effort stay as they were.'
        : `Prepared: ${parts.join(', ')}. Review the box and press Enter.`,
    prepareFailed: (list: string) => `Could not change ${list}. Change it with /model or /effort.`,
    doneNoPrompt: 'Prepared. Your prompt stays as you wrote it: press Enter when you want.',
    rowsUndoFailed: 'Could not put the model or effort back: use /model or /effort.',
    use: 'Use',
    discard: 'Discard',
    undo: 'Undo',
    close: 'Close',
    cancel: 'Cancel',
  },
} as const

/** The texts of one language. */
export const t = (lang: Lang) => MESSAGES[lang]

/** A bilingual value in one language; a plain string is the same in both. */
export const pick = (value: Bilingual | string, lang: Lang): string => (typeof value === 'string' ? value : value[lang])

/** The same bilingual value built in both languages from one function. */
export const inBoth = (make: (lang: Lang) => string): Bilingual => ({ es: make('es'), en: make('en') })
