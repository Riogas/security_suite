// utils/validarDocumento.ts
export function validarDocumento(numeroRaw: string) {
  const numero = numeroRaw.replace(/\D/g, "");

  if (numero.length < 6 || numero.length > 8) {
    return { valido: false, mensajeError: "Debe tener entre 6 y 8 dígitos" };
  }

  if (!/^\d+$/.test(numero)) {
    return { valido: false, mensajeError: "Solo debe contener números" };
  }

  if (esCIUruguaya(numero)) {
    return { valido: true };
  }

  const num = parseInt(numero);
  if (num >= 10000000 && num <= 99999999) {
    return { valido: true };
  }

  return { valido: false, mensajeError: "Documento inválido para AR o UY" };
}

function esCIUruguaya(ci: string): boolean {
  if (ci.length < 6 || ci.length > 8) return false;
  const coef = [2, 9, 8, 7, 6, 3, 4];
  const ciPadded = ci.padStart(8, "0");
  const nums = ciPadded.split("").map(Number);

  let suma = 0;
  for (let i = 0; i < 7; i++) {
    suma += nums[i] * coef[i];
  }

  const resto = suma % 10;
  const verificadorEsperado = resto === 0 ? 0 : 10 - resto;
  return nums[7] === verificadorEsperado;
}
