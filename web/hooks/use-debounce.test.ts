import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebounce } from './use-debounce'

describe('Hook: useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna o valor inicial imediatamente', () => {
    const { result } = renderHook(() => useDebounce('inicial', 500))
    expect(result.current).toBe('inicial')
  })

  it('não atualiza o valor antes do delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 'inicial' },
    })

    rerender({ value: 'atualizado' })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe('inicial')
  })

  it('atualiza o valor após o delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 'inicial' },
    })

    rerender({ value: 'atualizado' })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe('atualizado')
  })

  it('cancela o timer anterior ao receber novo valor', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'b' })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    rerender({ value: 'c' })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Ainda não completou o delay para 'c'
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('c')
  })

  it('usa delay padrão de 500ms quando não informado', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 'inicial' },
    })

    rerender({ value: 'novo' })
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(result.current).toBe('inicial')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('novo')
  })

  it('funciona com tipos não-string', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 0 },
    })

    rerender({ value: 42 })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe(42)
  })
})
