/**
 * scripts/test-valor-atributo.ts
 *
 * La ida y vuelta del panel de atributos no puede cambiar el formato de lo que
 * guarda `usuario_preferencias.valor`. Caso real (2026-09-15, usuario 42453714):
 * el operador editó los atributos desde el panel y `[{"Nombre":"EL DUENDE
 * CENTRO","Valor":14}]` quedó guardado como `{"0": "{\"Nombre\":...}"}`, que
 * ni TrackMovil ni el login de secapi parsean.
 *
 *   pnpm test:valor-atributo
 */
import assert from "node:assert/strict";
import {
  generarJsonValor,
  parsearValorAtributo,
} from "../src/components/dashboard/usuarios/atributos/valorAtributo";

let casos = 0;
function caso(nombre: string, fn: () => void) {
  fn();
  casos++;
  console.log(`  ok  ${nombre}`);
}

const idaYVuelta = (valor: string) => JSON.parse(generarJsonValor(parsearValorAtributo(valor)));

caso("array de objetos vuelve como array (EmpFletera de SGM)", () => {
  assert.deepEqual(idaYVuelta('[{"Nombre":"EL DUENDE CENTRO","Valor":14}]'), [
    { Nombre: "EL DUENDE CENTRO", Valor: 14 },
  ]);
});

caso("array con varios elementos conserva orden y tipos", () => {
  assert.deepEqual(
    idaYVuelta('[{"Nombre":"MONTEVIDEO","Valor":1000},{"Nombre":"CORDOBA","Valor":2000}]'),
    [
      { Nombre: "MONTEVIDEO", Valor: 1000 },
      { Nombre: "CORDOBA", Valor: 2000 },
    ],
  );
});

caso("objeto legacy {nombre: id} queda igual, con valores string", () => {
  assert.deepEqual(idaYVuelta('{"Montevideo":"1000"}'), { Montevideo: "1000" });
  assert.deepEqual(idaYVuelta('{"SYN GAS SRL BELVEDERE":"45","SYN GAS SRL CERRO":"42"}'), {
    "SYN GAS SRL BELVEDERE": "45",
    "SYN GAS SRL CERRO": "42",
  });
});

caso("el comodín {TODAS: *} y los atributos de texto no cambian", () => {
  assert.deepEqual(idaYVuelta('{"TODAS":"*"}'), { TODAS: "*" });
  assert.deepEqual(idaYVuelta('{"ModoKiosco":"true"}'), { ModoKiosco: "true" });
  assert.deepEqual(idaYVuelta('{"CantDiasMaxAntiguedad":"31"}'), { CantDiasMaxAntiguedad: "31" });
});

caso("nunca se genera el formato envuelto {\"0\": \"{...}\"}", () => {
  const salida = generarJsonValor(parsearValorAtributo('[{"Nombre":"EL DUENDE CENTRO","Valor":14}]'));
  assert.equal(/"0"\s*:\s*"\{/.test(salida), false, salida);
});

caso("el formato envuelto ya guardado se repara solo al pasar por el panel", () => {
  const envuelto = '{"0": "{\\"Nombre\\":\\"MONTEVIDEO\\",\\"Valor\\":1000}"}';
  assert.deepEqual(idaYVuelta(envuelto), [{ Nombre: "MONTEVIDEO", Valor: 1000 }]);
});

caso("un campo que el operador tipea a mano sigue siendo objeto con string", () => {
  assert.deepEqual(JSON.parse(generarJsonValor([{ id: "Rivera", valor: "16" }])), { Rivera: "16" });
  // id numérico con valor escalar NO se toma por array
  assert.deepEqual(JSON.parse(generarJsonValor([{ id: "0", valor: "1000" }])), { "0": "1000" });
});

caso("campos vacíos se ignoran", () => {
  assert.deepEqual(JSON.parse(generarJsonValor([{ id: "", valor: "x" }, { id: "a", valor: "" }, { id: "b", valor: "2" }])), { b: "2" });
});

caso("formato informal {16: Rivera} sigue parseando", () => {
  assert.deepEqual(parsearValorAtributo("{16: Rivera, 17: Salto}"), [
    { id: "16", valor: "Rivera" },
    { id: "17", valor: "Salto" },
  ]);
});

console.log(`\n${casos} casos OK — valorAtributo`);
