interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
  pending: () => boolean;
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 *
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns The debounced function with cancel, flush, and pending methods
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): DebouncedFunction<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: unknown = null;
  let result: ReturnType<T> | undefined;

  const debounced = function (this: any, ...args: Parameters<T>) {
    lastArgs = args;
    // eslint-disable-next-line ts/no-this-alias
    lastThis = this;

    const later = () => {
      timeoutId = null;
      result = func.apply(lastThis, lastArgs!);
      lastArgs = null;
      lastThis = null;
    };

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(later, wait);
  };

  debounced.cancel = function () {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
    lastThis = null;
  };

  debounced.flush = function () {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      result = func.apply(lastThis, lastArgs!);
      timeoutId = null;
      lastArgs = null;
      lastThis = null;
    }
    return result;
  };

  debounced.pending = function () {
    return timeoutId !== null;
  };

  return debounced;
}

/**
 * Creates a debounced function that collects all calls during the wait period
 * and invokes the function with all collected arguments.
 *
 * @param func The function to debounce that accepts an array of collected items
 * @param wait The number of milliseconds to delay
 * @returns The debounced collector function
 */
export function debounceCollect<T>(
  func: (items: T[]) => any,
  wait: number,
): DebouncedFunction<(item: T) => void> {
  const collected: T[] = [];

  const executeWithCollection = () => {
    if (collected.length > 0) {
      const items = [...collected];
      collected.length = 0;
      func(items);
    }
  };

  const debouncedExecute = debounce(executeWithCollection, wait);

  const collector = (item: T) => {
    collected.push(item);
    debouncedExecute();
  };

  // Extend with utility methods
  const extendedCollector = collector as DebouncedFunction<(item: T) => void>;

  extendedCollector.cancel = () => {
    collected.length = 0;
    debouncedExecute.cancel();
  };

  extendedCollector.flush = () => {
    return debouncedExecute.flush();
  };

  extendedCollector.pending = () => {
    return debouncedExecute.pending();
  };

  return extendedCollector;
}
