import { describe, expect, it, vi } from 'vitest';
import { debounce, debounceCollect } from '../../../src/utils/debounce';

describe('debounce', () => {
  it('should delay function execution', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should reset timer on subsequent calls', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    await new Promise(resolve => setTimeout(resolve, 25));
    debounced();
    await new Promise(resolve => setTimeout(resolve, 25));
    
    expect(fn).not.toHaveBeenCalled();
    
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to the function', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced('arg1', 'arg2');
    await new Promise(resolve => setTimeout(resolve, 60));

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should preserve this context', async () => {
    const obj = {
      value: 42,
      method: vi.fn(function(this: any) {
        return this.value;
      }),
    };

    obj.method = debounce(obj.method, 50);
    obj.method();
    
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(obj.method).toHaveBeenCalled();
  });

  describe('cancel()', () => {
    it('should cancel pending execution', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced();
      debounced.cancel();
      
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('flush()', () => {
    it('should execute immediately', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('test');
      expect(fn).not.toHaveBeenCalled();

      debounced.flush();
      expect(fn).toHaveBeenCalledWith('test');
    });

    it('should clear pending execution after flush', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      debounced();
      debounced.flush();
      expect(fn).toHaveBeenCalledTimes(1);

      await new Promise(resolve => setTimeout(resolve, 60));
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('pending()', () => {
    it('should return true when execution is pending', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      expect(debounced.pending()).toBe(false);
      
      debounced();
      expect(debounced.pending()).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 60));
      expect(debounced.pending()).toBe(false);
    });
  });
});

describe('debounceCollect', () => {
  it('should collect items and pass as array', async () => {
    const fn = vi.fn();
    const debounced = debounceCollect(fn, 50);

    debounced('item1');
    debounced('item2');
    debounced('item3');

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(fn).toHaveBeenCalledWith(['item1', 'item2', 'item3']);
  });

  it('should reset collection after execution', async () => {
    const fn = vi.fn();
    const debounced = debounceCollect(fn, 50);

    debounced('item1');
    await new Promise(resolve => setTimeout(resolve, 60));
    
    debounced('item2');
    await new Promise(resolve => setTimeout(resolve, 60));

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, ['item1']);
    expect(fn).toHaveBeenNthCalledWith(2, ['item2']);
  });

  it('should handle cancel()', async () => {
    const fn = vi.fn();
    const debounced = debounceCollect(fn, 50);

    debounced('item1');
    debounced('item2');
    debounced.cancel();

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(fn).not.toHaveBeenCalled();
  });

  it('should handle flush()', () => {
    const fn = vi.fn();
    const debounced = debounceCollect(fn, 100);

    debounced('item1');
    debounced('item2');
    debounced.flush();

    expect(fn).toHaveBeenCalledWith(['item1', 'item2']);
  });

  it('should handle pending()', async () => {
    const fn = vi.fn();
    const debounced = debounceCollect(fn, 50);

    expect(debounced.pending()).toBe(false);
    
    debounced('item');
    expect(debounced.pending()).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(debounced.pending()).toBe(false);
  });
});