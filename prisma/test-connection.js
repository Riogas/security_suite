const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  
  try {
    const aplicaciones = await prisma.aplicacion.count();
    const usuarios = await prisma.usuario.count();
    const roles = await prisma.rol.count();
    const funcionalidades = await prisma.funcionalidad.count();
    const acciones = await prisma.accion.count();
    const accesos = await prisma.acceso.count();
    const rolFuncionalidades = await prisma.rolFuncionalidad.count();
    const usuarioRoles = await prisma.usuarioRol.count();
    const usuarioPreferencias = await prisma.usuarioPreferencia.count();
    const funcionalidadAcciones = await prisma.funcionalidadAccion.count();

    console.log("✅ Conexión a PostgreSQL exitosa!\n");
    console.log("📊 Conteo de registros:");
    console.log(`   aplicaciones:          ${aplicaciones}`);
    console.log(`   usuarios:              ${usuarios}`);
    console.log(`   roles:                 ${roles}`);
    console.log(`   funcionalidades:       ${funcionalidades}`);
    console.log(`   acciones:              ${acciones}`);
    console.log(`   accesos:               ${accesos}`);
    console.log(`   rol_funcionalidades:   ${rolFuncionalidades}`);
    console.log(`   usuario_roles:         ${usuarioRoles}`);
    console.log(`   usuario_preferencias:  ${usuarioPreferencias}`);
    console.log(`   funcionalidad_acciones: ${funcionalidadAcciones}`);
  } catch (error) {
    console.error("❌ Error de conexión:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
