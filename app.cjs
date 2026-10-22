// Arquivo de inicialização para hospedagem compartilhada (cPanel "Setup Node.js App" / Passenger).
// Aponte o "Application startup file" para app.cjs.
process.env.NITRO_PORT = process.env.NITRO_PORT || process.env.PORT || "3000";
import("./.output/server/index.mjs").catch((err) => {
  console.error("Falha ao iniciar:", err);
  process.exit(1);
});
