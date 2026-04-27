const { twofish } = require('twofish');

// GeneXus Encrypt64: Twofish-128-ECB, key en hex (16 bytes), space padding (0x20), resultado en Base64.
// Usada por GXICAGEO.USUMOBILE.USUMOBILEPASSWORD y por ADMSEC.USUARIOS.USUPASSWORD.
function encrypt64(text, hexKey) {
  const tf = twofish();
  const key = Array.from(Buffer.from(hexKey, 'hex'));
  const input = Array.from(Buffer.from(text.trim(), 'utf8'));
  const blockSize = 16;
  const paddedLen = Math.max(blockSize, Math.ceil(input.length / blockSize) * blockSize);
  const padded = [...input, ...Array(paddedLen - input.length).fill(0x20)];
  const output = [];
  for (let i = 0; i < padded.length; i += blockSize) {
    output.push(...tf.encrypt(key, padded.slice(i, i + blockSize)));
  }
  return Buffer.from(output).toString('base64').trim();
}

module.exports = { encrypt64 };
