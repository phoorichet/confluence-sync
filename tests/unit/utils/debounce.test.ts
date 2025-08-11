import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce, debounceCollect } from '../../../src/utils/debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should reset timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to the function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('arg1', 'arg2');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should preserve this context', () => {
    const obj = {
      value: 42,
      method: vi.fn(function (this: any) {
        return this.value;
      }),
    };

    obj.method = debounce(obj.method, 100);
    obj.method();
    vi.advanceTimersByTime(100);

    expect(obj.method).toHaveBeenCalled();
  });

  describe('cancel()', () => {
    it('should cancel pending execution', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced.cancel();
      vi.advanceTimersByTime(100);

      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('flush()', () => {
    it('should execute immediately', () => {
      const fn = vi.fn().mockReturnValue('result');
      const debounced = debounce(fn, 100);

      debounced('arg');
      const result = debounced.flush();

      expect(fn).toHaveBeenCalledWith('arg');
      expect(result).toBe('result');
    });

    it('should clear pending execution after flush', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced.flush();
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('pending()', () => {
    it('should return true when execution is pending', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      expect(debounced.pending()).toBe(false);

      debounced();
      expect(debounced.pending()).toBe(true);

      vi.advanceTimersByTime(100);
      expect(debounced.pending()).toBe(false);
    });
  });
});

describe('debounceCollect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should collect items and pass as array', () => {
    const fn = vi.fn();
    const collector = debounceCollect(fn, 100);

    collector('item1');
    collector('item2');
    collector('item3');

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith(['item1', 'item2', 'item3']);
  });

  it('should reset collection after execution', () => {
    const fn = vi.fn();
    const collector = debounceCollect(fn, 100);

    collector('item1');
    vi.advanceTimersByTime(100);

    collector('item2');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, ['item1']);
    expect(fn).toHaveBeenNthCalledWith(2, ['item2']);
  });

  it('should handle cancel()', () => {
    const fn = vi.fn();
    const collector = debounceCollect(fn, 100);

    collector('item1');
    collector('item2');
    collector.cancel();

    vi.advanceTimersByTime(100);

    expect(fn).not.toHaveBeenCalled();
  });

  it('should handle flush()', () => {
    const fn = vi.fn();
    const collector = debounceCollect(fn, 100);

    collector('item1');
    collector('item2');
    collector.flush();

    expect(fn).toHaveBeenCalledWith(['item1', 'item2']);
  });

  it('should handle pending()', () => {
    const fn = vi.fn();
    const collector = debounceCollect(fn, 100);

    expect(collector.pending()).toBe(false);

    collector('item1');
    expect(collector.pending()).toBe(true);

    vi.advanceTimersByTime(100);
    expect(collector.pending()).toBe(false);
  });
});
