export type DebugLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Type pour les arguments de log - accepte tous types courants
 * Inclut `unknown` pour supporter les erreurs dans les blocs catch
 */
export type LogArg = string | number | boolean | object | Error | null | undefined | unknown;
type LoggerFunction = (...messages: LogArg[]) => void;

interface Logger {
  trace: LoggerFunction;
  debug: LoggerFunction;
  info: LoggerFunction;
  warn: LoggerFunction;
  error: LoggerFunction;
  setLevel: (level: DebugLevel) => void;
}

// Prioriser VITE_LOG_LEVEL s'il est défini, sinon utiliser 'debug' en dev et 'info' en prod
let currentLevel: DebugLevel = (import.meta.env.VITE_LOG_LEVEL as DebugLevel) || (import.meta.env.DEV ? 'debug' : 'info');

const isWorker = 'HTMLRewriter' in globalThis;
const supportsColor = !isWorker;

export const logger: Logger = {
  trace: (...messages: LogArg[]) => log('trace', undefined, messages),
  debug: (...messages: LogArg[]) => log('debug', undefined, messages),
  info: (...messages: LogArg[]) => log('info', undefined, messages),
  warn: (...messages: LogArg[]) => log('warn', undefined, messages),
  error: (...messages: LogArg[]) => log('error', undefined, messages),
  setLevel,
};

export function createScopedLogger(scope: string): Logger {
  return {
    trace: (...messages: LogArg[]) => log('trace', scope, messages),
    debug: (...messages: LogArg[]) => log('debug', scope, messages),
    info: (...messages: LogArg[]) => log('info', scope, messages),
    warn: (...messages: LogArg[]) => log('warn', scope, messages),
    error: (...messages: LogArg[]) => log('error', scope, messages),
    setLevel,
  };
}

function setLevel(level: DebugLevel) {
  if ((level === 'trace' || level === 'debug') && import.meta.env.PROD) {
    return;
  }

  currentLevel = level;
}

function log(level: DebugLevel, scope: string | undefined, messages: LogArg[]) {
  const levelOrder: DebugLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];

  if (levelOrder.indexOf(level) < levelOrder.indexOf(currentLevel)) {
    return;
  }

  const allMessages = messages.reduce<string>((acc, current) => {
    const currentStr = String(current ?? '');

    if (acc.endsWith('\n')) {
      return acc + currentStr;
    }

    if (!acc) {
      return currentStr;
    }

    return `${acc} ${currentStr}`;
  }, '');

  if (!supportsColor) {
    console.log(`[${level.toUpperCase()}]`, allMessages);

    return;
  }

  const labelBackgroundColor = getColorForLevel(level);
  const labelTextColor = level === 'warn' ? 'black' : 'white';

  const labelStyles = getLabelStyles(labelBackgroundColor, labelTextColor);
  const scopeStyles = getLabelStyles('#77828D', 'white');

  const styles = [labelStyles];

  if (typeof scope === 'string') {
    styles.push('', scopeStyles);
  }

  console.log(`%c${level.toUpperCase()}${scope ? `%c %c${scope}` : ''}`, ...styles, allMessages);
}

function getLabelStyles(color: string, textColor: string) {
  return `background-color: ${color}; color: white; border: 4px solid ${color}; color: ${textColor};`;
}

function getColorForLevel(level: DebugLevel): string {
  switch (level) {
    case 'trace':
    case 'debug': {
      return '#77828D';
    }
    case 'info': {
      return '#1389FD';
    }
    case 'warn': {
      return '#FFDB6C';
    }
    case 'error': {
      return '#EE4744';
    }
    default: {
      return 'black';
    }
  }
}

export const renderLogger = createScopedLogger('Render');
