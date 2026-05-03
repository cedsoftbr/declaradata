const onlyDigitsRegex = /^\d+$/

export const normalizeDocument = (value: string): string =>
  value.replace(/[^A-Z0-9]/gi, '').toUpperCase()

export const formatCpfOrCnpj = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
    if (digits.length <= 9) {
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
    }
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
  }

  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`
}

export const normalizeNcm = (value: string): string =>
  value.replace(/\D/g, '').slice(0, 8)

export const formatNcm = (value: string): string => {
  const digits = normalizeNcm(value)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
}

const validateCPF = (cpf: string): boolean => {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false

  const calcDigit = (length: number) => {
    let sum = 0
    for (let i = 0; i < length; i++) {
      sum += Number(cpf[i]) * (length + 1 - i)
    }
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }

  return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10])
}

export const validateCNPJ = (cnpj: string): boolean => {
  const normalized = normalizeDocument(cnpj)
  if (normalized.length !== 14) return false

  const digits = [...normalized].map(char => {
    const code = char.charCodeAt(0)
    return code >= 65 ? code - 55 : Number(char)
  })

  const calcDigit = (weights: number[]) => {
    const sum = weights.reduce((acc, weight, idx) => acc + digits[idx] * weight, 0)
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }

  return (
    calcDigit([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === digits[12] &&
    calcDigit([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === digits[13]
  )
}

export const isValidCpfOrCnpj = (value: string): boolean => {
  const normalized = normalizeDocument(value)
  if (normalized.length === 11 && onlyDigitsRegex.test(normalized)) {
    return validateCPF(normalized)
  }
  if (normalized.length === 14) {
    return validateCNPJ(normalized)
  }
  return false
}
