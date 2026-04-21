const ldap = require('ldapjs');

const HOST = '192.168.1.7';
const PORT = 389;
const DOMAIN = 'glp';
const USERNAME = 'jgomez';
const PASSWORD = 'VeintiunoDeOctubre!';

const bindDN = `${DOMAIN}\\${USERNAME}`;

const client = ldap.createClient({
  url: `ldap://${HOST}:${PORT}`,
  timeout: 5000,
  connectTimeout: 5000,
  referrals: false,
});

client.on('error', (err) => {
  console.error('❌ Error de conexión LDAP:', err.message);
  process.exit(1);
});

console.log(`🔌 Conectando a ${HOST}:${PORT}...`);
console.log(`👤 Bind como: ${bindDN}`);

client.bind(bindDN, PASSWORD, (err) => {
  if (err) {
    console.error('❌ Autenticación fallida:', err.message);
    console.error('   Código:', err.code);
    client.destroy();
    process.exit(1);
  }

  console.log('✅ Autenticación exitosa!');

  // Paso 1: rootDSE para detectar el defaultNamingContext real del AD
  console.log('\n🔍 Consultando rootDSE para detectar base DN...');
  client.search('', { scope: 'base', filter: '(objectClass=*)', attributes: ['defaultNamingContext', 'namingContexts'] }, (err, res) => {
    if (err) {
      console.error('⚠️  rootDSE falló:', err.message);
      client.unbind();
      return;
    }

    let baseDN = null;

    res.on('searchEntry', (entry) => {
      entry.pojo.attributes.forEach(attr => {
        console.log(`   ${attr.type}: ${attr.values.join(', ')}`);
        if (attr.type === 'defaultNamingContext') baseDN = attr.values[0];
        if (!baseDN && attr.type === 'namingContexts') baseDN = attr.values[0];
      });
    });

    res.on('error', (err) => {
      console.error('⚠️  Error rootDSE:', err.message);
    });

    res.on('end', () => {
      if (!baseDN) {
        console.log('⚠️  No se pudo detectar base DN, usando DC=glp,DC=com');
        baseDN = 'DC=glp,DC=com';
      }

      console.log(`\n✅ Base DN detectado: ${baseDN}`);
      console.log(`🔍 Buscando usuario ${USERNAME}...`);

      client.search(baseDN, {
        filter: `(sAMAccountName=${USERNAME})`,
        scope: 'sub',
        attributes: ['cn', 'mail', 'displayName', 'memberOf', 'department', 'title', 'sAMAccountName'],
      }, (err2, res2) => {
        if (err2) {
          console.error('⚠️  Search falló:', err2.message);
          client.unbind();
          return;
        }

        let found = false;
        res2.on('searchEntry', (entry) => {
          found = true;
          console.log('\n📋 Datos del usuario:');
          entry.pojo.attributes.forEach(attr => {
            if (attr.type !== 'memberOf') {
              console.log(`   ${attr.type}: ${attr.values.join(', ')}`);
            }
          });
          const grupos = entry.pojo.attributes.find(a => a.type === 'memberOf');
          if (grupos) console.log(`   memberOf: ${grupos.values.length} grupos`);
        });

        res2.on('error', (err2) => {
          console.error('⚠️  Error en search usuario:', err2.message);
        });

        res2.on('end', () => {
          if (!found) console.log('⚠️  Usuario no encontrado en el directorio');
          client.unbind();
        });
      });
    });
  });
});
