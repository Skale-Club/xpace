'use strict';

// Interface texts. Anything missing falls back to English.
const I18N = {
  en: {
    locale: 'en-US',
    ui: {
      tagline: 'Disk space analyzer', madeBy: 'Made by',
      drives: 'Scan', folders: 'Folders', files: 'Largest files', types: 'File types',
      drivesTitle: 'What do you want to analyze?', drivesNote: 'Pick a drive, or choose any folder. Xpace only reads: it never changes or deletes anything.',
      chooseFolder: 'Choose a folder…', free: '{free} free of {total}', used: '{pct}% used',
      fixed: 'Local disk', removable: 'Removable', network: 'Network drive', other: 'Drive',
      scanningTitle: 'Scanning {path}', filesCount: 'Files', foldersCount: 'Folders', sizeCount: 'Size',
      cancel: 'Cancel', rescan: 'Rescan', newScan: 'New scan', exportCsv: 'Export CSV',
      cancelled: 'Scan cancelled: the numbers cover only what was read.',
      unreadable: '{n} folders could not be read (access denied) and count as empty.',
      scannedIn: '{files} files · {folders} folders · scanned in {time}',
      name: 'Name', size: 'Size', share: '% of parent', filesCol: 'Files', foldersCol: 'Folders', modified: 'Modified',
      path: 'Path', type: 'Type', ofTotal: '% of total', noExt: '(no extension)',
      moreFiles: '{n} more files', link: 'link', linkTip: 'Junction or symbolic link: not followed, so it is not counted twice.',
      denied: 'no access', deniedTip: 'This folder could not be read.',
      reveal: 'Show in Explorer', openFolder: 'Open in Explorer',
      emptyFolder: 'This folder is empty.', loading: 'Loading…', noScan: 'Scan a drive or folder first.',
      notFolder: 'That is not a folder.', notFound: 'It is no longer there.',
      saved: 'Saved to {path}', failed: 'Something went wrong: {error}',
      updateAvailable: 'Xpace {v} is available.', updateNow: 'Update now', updating: 'Updating…',
      updateFailed: 'Update failed: {error}',
    },
  },
  pt: {
    locale: 'pt-BR',
    ui: {
      tagline: 'Análise de espaço em disco', madeBy: 'Feito por',
      drives: 'Analisar', folders: 'Pastas', files: 'Maiores arquivos', types: 'Tipos de arquivo',
      drivesTitle: 'O que você quer analisar?', drivesNote: 'Escolha um disco ou qualquer pasta. O Xpace só lê: nunca altera nem apaga nada.',
      chooseFolder: 'Escolher pasta…', free: '{free} livres de {total}', used: '{pct}% usado',
      fixed: 'Disco local', removable: 'Removível', network: 'Unidade de rede', other: 'Unidade',
      scanningTitle: 'Analisando {path}', filesCount: 'Arquivos', foldersCount: 'Pastas', sizeCount: 'Tamanho',
      cancel: 'Cancelar', rescan: 'Analisar de novo', newScan: 'Nova análise', exportCsv: 'Exportar CSV',
      cancelled: 'Análise cancelada: os números cobrem só o que foi lido.',
      unreadable: '{n} pastas não puderam ser lidas (acesso negado) e contam como vazias.',
      scannedIn: '{files} arquivos · {folders} pastas · analisado em {time}',
      name: 'Nome', size: 'Tamanho', share: '% da pasta', filesCol: 'Arquivos', foldersCol: 'Pastas', modified: 'Modificado',
      path: 'Caminho', type: 'Tipo', ofTotal: '% do total', noExt: '(sem extensão)',
      moreFiles: 'mais {n} arquivos', link: 'link', linkTip: 'Junção ou link simbólico: não é seguido, para não contar duas vezes.',
      denied: 'sem acesso', deniedTip: 'Não foi possível ler esta pasta.',
      reveal: 'Mostrar no Explorer', openFolder: 'Abrir no Explorer',
      emptyFolder: 'Esta pasta está vazia.', loading: 'Carregando…', noScan: 'Analise um disco ou pasta primeiro.',
      notFolder: 'Isso não é uma pasta.', notFound: 'Isso não existe mais.',
      saved: 'Salvo em {path}', failed: 'Algo deu errado: {error}',
      updateAvailable: 'O Xpace {v} está disponível.', updateNow: 'Atualizar agora', updating: 'Atualizando…',
      updateFailed: 'A atualização falhou: {error}',
    },
  },
  es: {
    locale: 'es-ES',
    ui: {
      tagline: 'Análisis de espacio en disco', madeBy: 'Hecho por',
      drives: 'Analizar', folders: 'Carpetas', files: 'Archivos más grandes', types: 'Tipos de archivo',
      drivesTitle: '¿Qué quieres analizar?', drivesNote: 'Elige un disco o cualquier carpeta. Xpace solo lee: nunca cambia ni borra nada.',
      chooseFolder: 'Elegir carpeta…', free: '{free} libres de {total}', used: '{pct}% usado',
      fixed: 'Disco local', removable: 'Extraíble', network: 'Unidad de red', other: 'Unidad',
      scanningTitle: 'Analizando {path}', filesCount: 'Archivos', foldersCount: 'Carpetas', sizeCount: 'Tamaño',
      cancel: 'Cancelar', rescan: 'Volver a analizar', newScan: 'Nuevo análisis', exportCsv: 'Exportar CSV',
      cancelled: 'Análisis cancelado: las cifras cubren solo lo que se leyó.',
      unreadable: '{n} carpetas no se pudieron leer (acceso denegado) y cuentan como vacías.',
      scannedIn: '{files} archivos · {folders} carpetas · analizado en {time}',
      name: 'Nombre', size: 'Tamaño', share: '% de la carpeta', filesCol: 'Archivos', foldersCol: 'Carpetas', modified: 'Modificado',
      path: 'Ruta', type: 'Tipo', ofTotal: '% del total', noExt: '(sin extensión)',
      moreFiles: '{n} archivos más', link: 'enlace', linkTip: 'Unión o enlace simbólico: no se sigue, para no contarlo dos veces.',
      denied: 'sin acceso', deniedTip: 'No se pudo leer esta carpeta.',
      reveal: 'Mostrar en el Explorador', openFolder: 'Abrir en el Explorador',
      emptyFolder: 'Esta carpeta está vacía.', loading: 'Cargando…', noScan: 'Analiza primero un disco o una carpeta.',
      notFolder: 'Eso no es una carpeta.', notFound: 'Ya no existe.',
      saved: 'Guardado en {path}', failed: 'Algo salió mal: {error}',
      updateAvailable: 'Xpace {v} está disponible.', updateNow: 'Actualizar ahora', updating: 'Actualizando…',
      updateFailed: 'La actualización falló: {error}',
    },
  },
};

let language = 'en';

function setLanguage(code) {
  language = I18N[code] ? code : 'en';
  document.documentElement.lang = language;
}

/** Interface text with {placeholders}. */
function t(key, vars = {}) {
  const text = I18N[language].ui[key] ?? I18N.en.ui[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
}

const locale = () => I18N[language].locale;
