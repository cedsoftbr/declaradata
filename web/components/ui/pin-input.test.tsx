import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PinInput } from './pin-input'

describe('Component: PinInput', () => {
  it('renders 6 inputs by default', () => {
    render(<PinInput value="" onChange={vi.fn()} />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(6)
  })

  it('distributes value across inputs', () => {
    render(<PinInput value="123456" onChange={vi.fn()} />)
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
    expect(inputs.map(i => i.value).join('')).toBe('123456')
  })

  it('calls onChange with updated value when a digit is typed', () => {
    const onChange = vi.fn()
    render(<PinInput value="" onChange={onChange} />)
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0], { target: { value: '5' } })
    expect(onChange).toHaveBeenCalledWith('5')
  })

  it('ignores non-numeric input', () => {
    const onChange = vi.fn()
    render(<PinInput value="" onChange={onChange} />)
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0], { target: { value: 'a' } })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('handles paste by distributing digits', () => {
    const onChange = vi.fn()
    render(<PinInput value="" onChange={onChange} />)
    const inputs = screen.getAllByRole('textbox')
    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => '123456' },
    })
    expect(onChange).toHaveBeenCalledWith('123456')
  })

  it('handles paste stripping non-numeric characters', () => {
    const onChange = vi.fn()
    render(<PinInput value="" onChange={onChange} />)
    const inputs = screen.getAllByRole('textbox')
    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => '12-34-56' },
    })
    expect(onChange).toHaveBeenCalledWith('123456')
  })

  it('clears digit on Backspace when input has a value', () => {
    const onChange = vi.fn()
    render(<PinInput value="123456" onChange={onChange} />)
    const inputs = screen.getAllByRole('textbox')
    fireEvent.keyDown(inputs[2], { key: 'Backspace' })
    expect(onChange).toHaveBeenCalledWith('12456')
  })

  it('disables all inputs when disabled prop is set', () => {
    render(<PinInput value="" onChange={vi.fn()} disabled />)
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
    expect(inputs.every(i => i.disabled)).toBe(true)
  })
})
